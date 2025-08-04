import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';
import { format } from 'date-fns';

export async function GET(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const { searchParams } = new URL(request.url);

        const defaultEndDate = new Date();
        const defaultStartDate = new Date(defaultEndDate.getFullYear(), defaultEndDate.getMonth(), 1);

        const dataInicio = searchParams.get('dataInicio') || format(defaultStartDate, 'yyyy-MM-dd');
        const dataFim = searchParams.get('dataFim') || format(defaultEndDate, 'yyyy-MM-dd');
        const diasVencimento = parseInt(searchParams.get('diasVencimento') || '5', 10);
        const tipoOperacaoId = searchParams.get('tipoOperacaoId') || null;

        const rpcParams = { 
            data_inicio: dataInicio, 
            data_fim: dataFim, 
            p_tipo_operacao_id: tipoOperacaoId 
        };

        const [
            valorOperadoRes, topClientesRes, topSacadosRes,
            totaisFinanceirosRes, vencimentosProximosRes
        ] = await Promise.all([
            supabase.rpc('get_valor_operado', rpcParams),
            supabase.rpc('get_top_clientes', rpcParams),
            supabase.rpc('get_top_sacados', rpcParams),
            supabase.rpc('get_totais_financeiros', rpcParams),
            supabase.rpc('get_vencimentos_proximos', { dias_vencimento: diasVencimento })
        ]);

        const errors = [valorOperadoRes.error, topClientesRes.error, topSacadosRes.error, totaisFinanceirosRes.error, vencimentosProximosRes.error].filter(Boolean);
        if (errors.length > 0) {
            console.error("Erros ao buscar métricas:", errors);
            throw new Error("Uma ou mais consultas de métricas falharam.");
        }

        const totais = totaisFinanceirosRes.data[0];
        const lucroLiquido = (totais.total_juros || 0) - (totais.total_despesas || 0);

        const metrics = {
            valorOperadoNoMes: valorOperadoRes.data || 0,
            topClientes: topClientesRes.data || [],
            topSacados: topSacadosRes.data || [],
            vencimentosProximos: vencimentosProximosRes.data || [],
            totalJuros: totais.total_juros || 0,
            totalDespesas: totais.total_despesas || 0,
            lucroLiquido: lucroLiquido,
        };

        return NextResponse.json(metrics, { status: 200 });
    } catch (error) {
        console.error('Erro no endpoint de métricas:', error.message);
        return NextResponse.json({ message: error.message || 'Erro interno do servidor' }, { status: 500 });
    }
}