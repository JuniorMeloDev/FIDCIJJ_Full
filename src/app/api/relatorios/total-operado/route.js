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
        const tipoOperacaoId = searchParams.get('tipoOperacaoId') || null;
        const clienteId = searchParams.get('clienteId') || null;
        const sacadoNome = searchParams.get('sacado') || null;

        // Monta o objeto de parâmetros para as RPCs
        const rpcParams = { 
            p_data_inicio: dataInicio, 
            p_data_fim: dataFim, 
            p_tipo_operacao_id: tipoOperacaoId,
            p_cliente_id: clienteId,
            p_sacado_nome: sacadoNome
        };

        // --- LÓGICA TRAZIDA DO DASHBOARD (METRICS) ---
        
        // 1. Query para buscar Créditos de Recompra (Descontos com descrição específica)
        let recompraQuery = supabase
            .from('descontos')
            .select('valor, operacao:operacoes!inner(data_operacao, tipo_operacao_id, cliente_id)')
            .ilike('descricao', 'Crédito Juros Recompra%');

        if (dataInicio) recompraQuery = recompraQuery.gte('operacao.data_operacao', dataInicio);
        if (dataFim) recompraQuery = recompraQuery.lte('operacao.data_operacao', dataFim);
        if (tipoOperacaoId) recompraQuery = recompraQuery.eq('operacao.tipo_operacao_id', tipoOperacaoId);
        if (clienteId) recompraQuery = recompraQuery.eq('operacao.cliente_id', clienteId);

        // 2. Executa todas as buscas em paralelo (RPCs originais + Novas do Dashboard)
        const [
            valorOperadoRes, 
            clientesAbcRes, 
            sacadosAbcRes,
            totaisFinanceirosRes,
            recompraCreditsRes, // Novo
            jurosMoraRes        // Novo
        ] = await Promise.all([
            supabase.rpc('get_valor_operado', rpcParams),
            supabase.rpc('get_abc_clientes', rpcParams),
            supabase.rpc('get_abc_sacados', rpcParams),
            supabase.rpc('get_totais_financeiros', rpcParams),
            recompraQuery,
            supabase.rpc('get_total_juros_mora_no_periodo', rpcParams)
        ]);

        const errors = [
            valorOperadoRes.error, 
            clientesAbcRes.error, 
            sacadosAbcRes.error, 
            totaisFinanceirosRes.error,
            recompraCreditsRes.error,
            jurosMoraRes.error
        ].filter(Boolean);

        if (errors.length > 0) {
            console.error("Erros ao buscar métricas para relatório:", errors);
            throw new Error("Uma ou mais consultas para o relatório falharam.");
        }

        // --- CÁLCULOS FINAIS ---

        const totais = totaisFinanceirosRes.data[0] || { total_juros: 0, total_despesas: 0 };
        const totalJurosBruto = totais.total_juros || 0;

        // Soma dos créditos de recompra (Geralmente são negativos no banco, então somar reduz o valor, ou vice-versa, dependendo do cadastro)
        const totalCreditosRecompra = recompraCreditsRes.data?.reduce((sum, item) => sum + item.valor, 0) || 0;
        
        // Total Juros de Mora
        const totalJurosMora = jurosMoraRes.data || 0;

        // Cálculo Final do Juros (Igual ao Dashboard)
        const totalJurosAjustado = totalJurosBruto + totalCreditosRecompra + totalJurosMora;
        
        // Lucro Líquido
        const lucroLiquido = totalJurosAjustado - (totais.total_despesas || 0);

        const metrics = {
            valorOperadoNoMes: valorOperadoRes.data || 0,
            clientes: clientesAbcRes.data || [],
            sacados: sacadosAbcRes.data || [],
            totalJuros: totalJurosAjustado, // Valor Corrigido
            totalDespesas: totais.total_despesas || 0,
            lucroLiquido: lucroLiquido,
        };

        return NextResponse.json(metrics, { status: 200 });

    } catch (error) {
        console.error("Erro na API de relatório Total Operado:", error);
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            return NextResponse.json({ message: 'Token inválido ou expirado' }, { status: 403 });
        }
        return NextResponse.json({ message: error.message || 'Erro interno do servidor' }, { status: 500 });
    }
}