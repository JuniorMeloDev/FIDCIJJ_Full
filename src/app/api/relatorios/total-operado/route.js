import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

export async function GET(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        
        // Verifica token (se falhar, vai pro catch)
        jwt.verify(token, process.env.JWT_SECRET);

        const { searchParams } = new URL(request.url);

        // Captura todos os filtros da URL
        const dataInicio = searchParams.get('dataInicio') || searchParams.get('startDate') || null;
        const dataFim = searchParams.get('dataFim') || searchParams.get('endDate') || null;
        const tipoOperacaoId = searchParams.getAll('tipoOperacaoId');
        const clienteId = searchParams.get('clienteId') || null;
        const sacadoNome = searchParams.get('sacado') || null;

        // Função auxiliar para buscar métricas por tipo (Wrapper nas RPCs)
        const fetchMetrics = async (tipoId) => {
            const rpcParams = { 
                p_data_inicio: dataInicio, 
                p_data_fim: dataFim, 
                p_tipo_operacao_id: tipoId || null,
                p_cliente_id: clienteId,
                p_sacado_nome: sacadoNome
            };

            const [valorOperadoRes, clientesAbcRes, sacadosAbcRes, totaisFinanceirosRes, jurosMoraRes] = await Promise.all([
                supabase.rpc('get_valor_operado', rpcParams),
                supabase.rpc('get_abc_clientes', rpcParams),
                supabase.rpc('get_abc_sacados', rpcParams),
                supabase.rpc('get_totais_financeiros', rpcParams),
                supabase.rpc('get_total_juros_mora_no_periodo', rpcParams)
            ]);

            return {
                valorOperado: valorOperadoRes.data || 0,
                clientes: clientesAbcRes.data || [],
                sacados: sacadosAbcRes.data || [],
                totais: totaisFinanceirosRes.data?.[0] || { total_juros: 0, total_despesas: 0 },
                jurosMora: jurosMoraRes.data || 0,
                errors: [valorOperadoRes.error, clientesAbcRes.error, sacadosAbcRes.error, totaisFinanceirosRes.error, jurosMoraRes.error].filter(Boolean)
            };
        };

        // --- LÓGICA DE AGREGAÇÃO ---
        let aggregatedMetrics = {
            valorOperado: 0,
            clientes: [],
            sacados: [],
            totalJuros: 0,
            totalDespesas: 0,
            jurosMora: 0
        };

        // 1. Query de Recompra (Suporta IN nativamente)
        let recompraQuery = supabase
            .from('descontos')
            .select('valor, operacao:operacoes!inner(data_operacao, tipo_operacao_id, cliente_id)')
            .ilike('descricao', 'Crédito Juros Recompra%');

        if (dataInicio) recompraQuery = recompraQuery.gte('operacao.data_operacao', dataInicio);
        if (dataFim) recompraQuery = recompraQuery.lte('operacao.data_operacao', dataFim);
        if (tipoOperacaoId && tipoOperacaoId.length > 0) recompraQuery = recompraQuery.in('operacao.tipo_operacao_id', tipoOperacaoId);
        if (clienteId) recompraQuery = recompraQuery.eq('operacao.cliente_id', clienteId);

        const { data: recompraData, error: recompraError } = await recompraQuery;
        if (recompraError) throw recompraError;

        // 2. Busca e Agrega Dados das RPCs
        const typesToFetch = (tipoOperacaoId && tipoOperacaoId.length > 0) ? tipoOperacaoId : [null];
        
        for (const typeId of typesToFetch) {
            const metrics = await fetchMetrics(typeId);
            if (metrics.errors.length > 0) throw new Error("Erro em uma das sub-consultas RPC.");

            aggregatedMetrics.valorOperado += metrics.valorOperado;
            aggregatedMetrics.totalJuros += metrics.totais.total_juros || 0;
            aggregatedMetrics.totalDespesas += metrics.totais.total_despesas || 0;
            aggregatedMetrics.jurosMora += metrics.jurosMora;
            
            // Merge Clientes ABC
            metrics.clientes.forEach(c => {
                const existing = aggregatedMetrics.clientes.find(ac => ac.nome === c.nome);
                if (existing) {
                    existing.valor_total += c.valor_total;
                } else {
                    aggregatedMetrics.clientes.push({ ...c });
                }
            });

             // Merge Sacados ABC
             metrics.sacados.forEach(s => {
                const existing = aggregatedMetrics.sacados.find(as => as.nome === s.nome);
                if (existing) {
                    existing.valor_total += s.valor_total;
                } else {
                    aggregatedMetrics.sacados.push({ ...s });
                }
            });
        }
        
        // Re-ordena ABC após merge
        aggregatedMetrics.clientes.sort((a, b) => b.valor_total - a.valor_total);
        aggregatedMetrics.sacados.sort((a, b) => b.valor_total - a.valor_total);


        // --- CÁLCULOS FINAIS ---
        
        // Soma dos créditos de recompra
        const totalCreditosRecompra = recompraData?.reduce((sum, item) => sum + item.valor, 0) || 0;
        
        // Cálculo Final do Juros
        const totalJurosAjustado = aggregatedMetrics.totalJuros + totalCreditosRecompra + aggregatedMetrics.jurosMora;
        
        // Lucro Líquido
        const lucroLiquido = totalJurosAjustado - aggregatedMetrics.totalDespesas;

        const finalResponse = {
            valorOperadoNoMes: aggregatedMetrics.valorOperado,
            clientes: aggregatedMetrics.clientes,
            sacados: aggregatedMetrics.sacados,
            totalJuros: totalJurosAjustado,
            totalDespesas: aggregatedMetrics.totalDespesas,
            lucroLiquido: lucroLiquido,
        };

        return NextResponse.json(finalResponse, { status: 200 });

    } catch (error) {
        console.error("Erro na API de relatório Total Operado:", error);
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            return NextResponse.json({ message: 'Token inválido ou expirado' }, { status: 403 });
        }
        return NextResponse.json({ message: error.message || 'Erro interno do servidor' }, { status: 500 });
    }
}