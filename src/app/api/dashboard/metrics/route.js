import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';
import { format } from 'date-fns';

export async function GET(request) {
  try {
    const token = request.headers.get('Authorization')?.split(' ')[1];
    if (!token)
      return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });

    jwt.verify(token, process.env.JWT_SECRET);

    const { searchParams } = new URL(request.url);

    const dataInicio = searchParams.get('dataInicio') || null;
    const dataFim = searchParams.get('dataFim') || null;
    const tipoOperacaoId = searchParams.get('tipoOperacaoId') || null;
    const clienteId = searchParams.get('clienteId') || null;
    const sacadoNome = searchParams.get('sacado') || null;
    const diasVencimento = parseInt(searchParams.get('diasVencimento') || '5', 10);
    const topNLimit = parseInt(searchParams.get('topNLimit') || '5', 10);

    const rpcParams = {
      p_data_inicio: dataInicio,
      p_data_fim: dataFim,
      p_tipo_operacao_id: tipoOperacaoId,
      p_cliente_id: clienteId,
      p_sacado_nome: sacadoNome
    };

    const topNParams = {
      p_data_inicio: dataInicio,
      p_data_fim: dataFim,
      p_tipo_operacao_id: tipoOperacaoId,
      p_limit: topNLimit
    };

    const hoje = new Date();
    const dataLimite = new Date();
    dataLimite.setDate(hoje.getDate() + diasVencimento);

    let vencimentosQuery = supabase
      .from('duplicatas')
      .select(`
        id, nf_cte, data_vencimento, valor_bruto, valor_juros, cliente_sacado,
        operacao:operacoes!inner(
          id, valor_liquido, valor_total_bruto, valor_total_juros,
          cliente:clientes(nome), tipo_operacao:tipos_operacao(nome)
        )
      `)
      .eq('status_recebimento', 'Pendente')
      .lte('data_vencimento', format(dataLimite, 'yyyy-MM-dd'));

    if (tipoOperacaoId) vencimentosQuery = vencimentosQuery.eq('operacao.tipo_operacao_id', tipoOperacaoId);
    if (clienteId) vencimentosQuery = vencimentosQuery.eq('operacao.cliente_id', clienteId);
    if (sacadoNome) vencimentosQuery = vencimentosQuery.ilike('cliente_sacado', `%${sacadoNome}%`);
    
    // --- INÍCIO DA CORREÇÃO ---
    // (Esta seção é do seu código original, está correta)
    // Busca os créditos de recompra separadamente
    let recompraQuery = supabase
      .from('descontos')
      .select('valor, operacao:operacoes!inner(data_operacao, tipo_operacao_id, cliente_id)')
      .ilike('descricao', 'Crédito Juros Recompra%'); 

    // Aplica os mesmos filtros de data, tipo de operação e cliente à busca de recompras
    if (dataInicio) recompraQuery = recompraQuery.gte('operacao.data_operacao', dataInicio);
    if (dataFim) recompraQuery = recompraQuery.lte('operacao.data_operacao', dataFim);
    if (tipoOperacaoId) recompraQuery = recompraQuery.eq('operacao.tipo_operacao_id', tipoOperacaoId);
    if (clienteId) recompraQuery = recompraQuery.eq('operacao.cliente_id', clienteId);

    const [
      valorOperadoRes,
      topClientesRes,
      topSacadosRes,
      totaisFinanceirosRes,
      vencimentosProximosRes,
      recompraCreditsRes,
      jurosMoraRes // --- ADIÇÃO DA LINHA 1 ---
    ] = await Promise.all([
      supabase.rpc('get_valor_operado', rpcParams),
      supabase.rpc('get_top_clientes', topNParams),
      supabase.rpc('get_top_sacados', topNParams),
      supabase.rpc('get_totais_financeiros', rpcParams),
      vencimentosQuery,
      recompraQuery,
      supabase.rpc('get_total_juros_mora_no_periodo', rpcParams) // --- ADIÇÃO DA LINHA 2 ---
    ]);

    const errors = [
      valorOperadoRes.error,
      topClientesRes.error,
      topSacadosRes.error,
      totaisFinanceirosRes.error,
      vencimentosProximosRes.error,
      recompraCreditsRes.error,
      jurosMoraRes.error // --- ADIÇÃO DA LINHA 3 ---
    ].filter(Boolean);

    if (errors.length > 0) {
      console.error('Erros ao buscar métricas:', errors);
      throw new Error('Uma ou mais consultas de métricas falharam.');
    }

    const totalCreditosRecompra = recompraCreditsRes.data?.reduce((sum, item) => sum + item.valor, 0) || 0;
    
    // --- ADIÇÃO DA LINHA 4 ---
    const totalJurosMora = jurosMoraRes.data || 0;

    const totais = totaisFinanceirosRes.data?.[0] || { total_juros: 0, total_despesas: 0 };
    const totalJurosBruto = totais.total_juros || 0;
    
    // --- ADIÇÃO DA LINHA 5 (MODIFICAÇÃO) ---
    const totalJurosAjustado = totalJurosBruto + totalCreditosRecompra + totalJurosMora;
    const lucroLiquido = totalJurosAjustado - (totais.total_despesas || 0);

    // --- FIM DA CORREÇÃO ---

    const metrics = {
      valorOperadoNoMes: valorOperadoRes.data || 0,
      topClientes: (topClientesRes.data || []).map(c => ({ ...c, valorTotal: c.valor_total })),
      topSacados: (topSacadosRes.data || []).map(s => ({ ...s, valorTotal: s.valor_total })),
      vencimentosProximos: (vencimentosProximosRes.data || []).map(v => ({
        id: v.id,
        nfCte: v.nf_cte,
        dataVencimento: v.data_vencimento,
        valorBruto: v.valor_bruto,
        valorJuros: v.valor_juros,
        clienteSacado: v.cliente_sacado,
        operacao: v.operacao
      })),
      totalJuros: totalJurosAjustado, // <-- Valor agora corrigido
      totalDespesas: totais.total_despesas || 0,
      lucroLiquido: lucroLiquido
    };

    return NextResponse.json(metrics, { status: 200 });
  } catch (error) {
    console.error('Erro no endpoint de métricas:', error.message);
    return NextResponse.json(
      { message: error.message || 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}