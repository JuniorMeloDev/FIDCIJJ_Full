import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';
import { format, subMonths, lastDayOfMonth } from 'date-fns';

export async function GET(request) {
    try {
        // Validação do token
        const authHeader = request.headers.get('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        }
        const token = authHeader.substring(7);
        jwt.verify(token, process.env.JWT_SECRET);

        const { searchParams } = new URL(request.url);
        
        // Define o período padrão como o mês atual se não for fornecido
        const defaultEndDate = new Date();
        const defaultStartDate = new Date(defaultEndDate.getFullYear(), defaultEndDate.getMonth(), 1);

        const dataInicio = searchParams.get('dataInicio') || format(defaultStartDate, 'yyyy-MM-dd');
        const dataFim = searchParams.get('dataFim') || format(defaultEndDate, 'yyyy-MM-dd');
        const diasVencimento = parseInt(searchParams.get('diasVencimento') || '5', 10);
        
        // Chama todas as funções da base de dados em paralelo
        const [
            valorOperadoRes,
            topClientesRes,
            topSacadosRes,
            totaisFinanceirosRes,
            vencimentosProximosRes
        ] = await Promise.all([
            supabase.rpc('get_valor_operado', { data_inicio: dataInicio, data_fim: dataFim }),
            supabase.rpc('get_top_clientes', { data_inicio: dataInicio, data_fim: dataFim }),
            supabase.rpc('get_top_sacados', { data_inicio: dataInicio, data_fim: dataFim }),
            supabase.rpc('get_totais_financeiros', { data_inicio: dataInicio, data_fim: dataFim }),
            supabase.rpc('get_vencimentos_proximos', { dias_vencimento: diasVencimento })
        ]);

        // Verifica se houve erros em alguma chamada
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