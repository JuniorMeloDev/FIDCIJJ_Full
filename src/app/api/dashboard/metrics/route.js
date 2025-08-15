import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

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
    const diasVencimento = searchParams.get('diasVencimento') || 5;

    const rpcParams = {
      data_inicio: dataInicio,
      data_fim: dataFim,
      p_tipo_operacao_id: tipoOperacaoId,
    };

    const vencimentoParams = {
      dias_vencimento: parseInt(diasVencimento),
      data_inicio: dataInicio,
      data_fim: dataFim,
      p_tipo_operacao_id: tipoOperacaoId,
    };

    const [
      valorOperadoRes,
      topClientesRes,
      topSacadosRes,
      totaisFinanceirosRes,
      vencimentosProximosRes,
    ] = await Promise.all([
      supabase.rpc('get_valor_operado', rpcParams),
      supabase.rpc('get_top_clientes', rpcParams),
      supabase.rpc('get_top_sacados', rpcParams),
      supabase.rpc('get_totais_financeiros', rpcParams),
      supabase.rpc('get_vencimentos_proximos', vencimentoParams),
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

    const totais = totaisFinanceirosRes.data?.[0] || {
      total_juros: 0,
      total_despesas: 0,
    };

    const lucroLiquido = (totais.total_juros || 0) - (totais.total_despesas || 0);

    const metrics = {
      valorOperadoNoMes: valorOperadoRes.data || 0,
      topClientes: (topClientesRes.data || []).map(c => ({ ...c, valorTotal: c.valor_total })),
      topSacados: (topSacadosRes.data || []).map(s => ({ ...s, valorTotal: s.valor_total })),
      // CORREÇÃO APLICADA AQUI: Mapeamento robusto dos nomes das colunas.
      vencimentosProximos: (vencimentosProximosRes.data || []).map(v => ({
        id: v.id,
        nfCte: v.nf_cte || v.nfCte,
        dataVencimento: v.data_vencimento || v.dataVencimento,
        valorBruto: v.valor_bruto || v.valorBruto,
        clienteSacado: v.cliente_sacado || v.clienteSacado
      })),
      totalJuros: totais.total_juros || 0,
      totalDespesas: totais.total_despesas || 0,
      lucroLiquido: lucroLiquido,
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