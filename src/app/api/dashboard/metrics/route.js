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
            id, cliente_id, valor_liquido, valor_total_bruto, valor_total_juros,
            cliente:clientes(id, nome, ramo_de_atividade), tipo_operacao:tipos_operacao(nome, taxa_juros_mora, taxa_juros)
          )
      `)
      .eq('operacao.status', 'Aprovada')
      .eq('status_recebimento', 'Pendente')
      .lte('data_vencimento', format(dataLimite, 'yyyy-MM-dd'));

    if (tipoOperacaoId) vencimentosQuery = vencimentosQuery.eq('operacao.tipo_operacao_id', tipoOperacaoId);
    if (clienteId) vencimentosQuery = vencimentosQuery.eq('operacao.cliente_id', clienteId);
    if (sacadoNome) vencimentosQuery = vencimentosQuery.ilike('cliente_sacado', `%${sacadoNome}%`);

    let recompraQuery = supabase
      .from('descontos')
      .select('valor, operacao:operacoes!inner(data_operacao, tipo_operacao_id, cliente_id)')
      .ilike('descricao', 'Crédito Juros Recompra%');

    if (dataInicio) recompraQuery = recompraQuery.gte('operacao.data_operacao', dataInicio);
    if (dataFim) recompraQuery = recompraQuery.lte('operacao.data_operacao', dataFim);
    if (tipoOperacaoId) recompraQuery = recompraQuery.eq('operacao.tipo_operacao_id', tipoOperacaoId);
    if (clienteId) recompraQuery = recompraQuery.eq('operacao.cliente_id', clienteId);

    let renegociacoesQuery = supabase
      .from('duplicatas')
      .select('valor_bruto, valor_juros, cliente_sacado, operacao:operacoes!inner(status, tipo_operacao_id, cliente_id)')
      .not('origem_renegociacao_id', 'is', null)
      .eq('operacao.status', 'Aprovada');

    if (dataInicio) renegociacoesQuery = renegociacoesQuery.gte('data_operacao', dataInicio);
    if (dataFim) renegociacoesQuery = renegociacoesQuery.lte('data_operacao', dataFim);
    if (tipoOperacaoId) renegociacoesQuery = renegociacoesQuery.eq('operacao.tipo_operacao_id', tipoOperacaoId);
    if (clienteId) renegociacoesQuery = renegociacoesQuery.eq('operacao.cliente_id', clienteId);
    if (sacadoNome) renegociacoesQuery = renegociacoesQuery.ilike('cliente_sacado', `%${sacadoNome}%`);

    const [
      valorOperadoRes,
      topClientesRes,
      topSacadosRes,
      totaisFinanceirosRes,
      vencimentosProximosRes,
      recompraCreditsRes,
      jurosMoraRes,
      renegociacoesRes
    ] = await Promise.all([
      supabase.rpc('get_valor_operado', rpcParams),
      supabase.rpc('get_top_clientes', topNParams),
      supabase.rpc('get_top_sacados', topNParams),
      supabase.rpc('get_totais_financeiros', rpcParams),
      vencimentosQuery,
      recompraQuery,
      supabase.rpc('get_total_juros_mora_no_periodo', rpcParams),
      renegociacoesQuery
    ]);

    const errors = [
      valorOperadoRes.error,
      topClientesRes.error,
      topSacadosRes.error,
      totaisFinanceirosRes.error,
      vencimentosProximosRes.error,
      recompraCreditsRes.error,
      jurosMoraRes.error,
      renegociacoesRes.error
    ].filter(Boolean);

    if (errors.length > 0) {
      console.error('Erros ao buscar métricas:', errors);
      throw new Error('Uma ou mais consultas de métricas falharam.');
    }

    const totalCreditosRecompra = recompraCreditsRes.data?.reduce((sum, item) => sum + item.valor, 0) || 0;
    const totalJurosMora = jurosMoraRes.data || 0;
    const totalOperadoRenegociacao = renegociacoesRes.data?.reduce((sum, item) => sum + (item.valor_bruto || 0), 0) || 0;
    const totalJurosRenegociacao = renegociacoesRes.data?.reduce((sum, item) => sum + (item.valor_juros || 0), 0) || 0;

    const totais = totaisFinanceirosRes.data?.[0] || { total_juros: 0, total_despesas: 0 };
    const totalJurosBruto = totais.total_juros || 0;
    const totalJurosAjustado = totalJurosBruto + totalCreditosRecompra + totalJurosMora + totalJurosRenegociacao;
    const lucroLiquido = totalJurosAjustado - (totais.total_despesas || 0);

    const metrics = {
      valorOperadoNoMes: (valorOperadoRes.data || 0) + totalOperadoRenegociacao,
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
      totalJuros: totalJurosAjustado,
      totalDespesas: totais.total_despesas || 0,
      lucroLiquido
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
