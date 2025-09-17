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

    // Vencimentos próximos
    let vencimentosQuery = supabase
      .from('duplicatas')
      .select(`
        id, nf_cte, data_vencimento, valor_bruto, valor_juros, cliente_sacado,
        operacao:operacoes!inner(*, cliente:clientes(nome), tipo_operacao:tipos_operacao(nome))
      `)
      .eq('status_recebimento', 'Pendente')
      .lte('data_vencimento', format(dataLimite, 'yyyy-MM-dd'));

    if (tipoOperacaoId) vencimentosQuery = vencimentosQuery.eq('operacao.tipo_operacao_id', tipoOperacaoId);
    if (clienteId) vencimentosQuery = vencimentosQuery.eq('operacao.cliente_id', clienteId);
    if (sacadoNome) vencimentosQuery = vencimentosQuery.ilike('cliente_sacado', `%${sacadoNome}%`);

    const [
      valorOperadoRes,
      topClientesRes,
      topSacadosRes,
      totaisFinanceirosRes,
      vencimentosProximosRes,
    ] = await Promise.all([
      supabase.rpc('get_valor_operado', rpcParams),
      supabase.rpc('get_top_clientes', topNParams),
      supabase.rpc('get_top_sacados', topNParams),
      supabase.rpc('get_totais_financeiros', rpcParams),
      vencimentosQuery,
    ]);

    const errors = [
      valorOperadoRes.error,
      topClientesRes.error,
      topSacadosRes.error,
      totaisFinanceirosRes.error,
      vencimentosProximosRes.error,
    ].filter(Boolean);

    if (errors.length > 0) {
      console.error('Erros ao buscar métricas:', errors);
      throw new Error('Uma ou mais consultas de métricas falharam.');
    }

    const totais = totaisFinanceirosRes.data?.[0] || { total_juros: 0, total_despesas: 0 };

    /**
     * >>> AJUSTE PRINCIPAL <<<
     * Subtrai do total de juros os juros de operações PÓS (juros_pre = false)
     * que foram liquidados, pois esses já foram contabilizados no dia da operação.
     * Juros de mora continuam sendo somados normalmente.
     */
    // substituir a parte anterior por isto
const { data: jurosPosLiquidadosData, error: jurosPosErr } = await supabase
  .from('duplicatas')
  .select('valor_juros, operacao:operacoes!inner(juros_pre)')
  .eq('status_recebimento', 'Liquidado')
  .eq('operacao.juros_pre', false);

if (jurosPosErr) {
  console.error('Erro ao buscar juros pós liquidados:', jurosPosErr);
  // retorna detalhe para facilitar debug (remova em produção)
  return NextResponse.json({ message: 'Erro ao buscar juros pós liquidados', detail: jurosPosErr }, { status: 500 });
}

const jurosPosLiquidados = (jurosPosLiquidadosData || [])
  .reduce((sum, d) => sum + (d.valor_juros || 0), 0);


    const totalJurosAjustado = (totais.total_juros || 0) - jurosPosLiquidados;
    const lucroLiquido = totalJurosAjustado - (totais.total_despesas || 0);

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
      // >>> totalJuros já corrigido <<<
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
