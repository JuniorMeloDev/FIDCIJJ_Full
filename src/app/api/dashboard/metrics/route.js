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
    // Captura o filtro de dias do frontend, com um padrão de 5 dias.
    const diasVencimento = searchParams.get('diasVencimento') || 5;

    const rpcParams = {
      data_inicio: dataInicio,
      data_fim: dataFim,
      p_tipo_operacao_id: tipoOperacaoId,
    };

    // Parâmetros para buscar os vencimentos, agora usando o valor vindo do frontend.
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
      vencimentosProximosRes, // Busca os vencimentos apenas uma vez.
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
      // Mapeia os dados para o formato que o gráfico espera (camelCase).
      topClientes: (topClientesRes.data || []).map(c => ({ ...c, valorTotal: c.valor_total })),
      topSacados: (topSacadosRes.data || []).map(s => ({ ...s, valorTotal: s.valor_total })),
      // Mapeia os dados dos vencimentos para o formato que a tela espera (camelCase).
      vencimentosProximos: (vencimentosProximosRes.data || []).map(v => ({
        id: v.id,
        nfCte: v.nf_cte,
        dataVencimento: v.data_vencimento,
        valorBruto: v.valor_bruto,
        clienteSacado: v.cliente_sacado
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