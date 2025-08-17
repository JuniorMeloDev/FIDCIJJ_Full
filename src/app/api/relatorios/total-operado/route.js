import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

export async function GET(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const { searchParams } = new URL(request.url);

        // Captura todos os filtros da URL
        const dataInicio = searchParams.get('dataInicio') || null;
        const dataFim = searchParams.get('dataFim') || null;
        const tipoOperacaoId = searchParams.get('tipoOperacaoId') || null;
        const clienteId = searchParams.get('clienteId') || null;
        const sacadoNome = searchParams.get('sacado') || null;

        // Monta o objeto de parâmetros que será enviado para TODAS as funções
        const rpcParams = { 
            p_data_inicio: dataInicio, 
            p_data_fim: dataFim, 
            p_tipo_operacao_id: tipoOperacaoId,
            p_cliente_id: clienteId,
            p_sacado_nome: sacadoNome
        };

        const [
            valorOperadoRes, 
            clientesAbcRes, 
            sacadosAbcRes,
            totaisFinanceirosRes 
        ] = await Promise.all([
            supabase.rpc('get_valor_operado', rpcParams),
            supabase.rpc('get_abc_clientes', rpcParams),
            supabase.rpc('get_abc_sacados', rpcParams),
            supabase.rpc('get_totais_financeiros', rpcParams)
        ]);

        const errors = [valorOperadoRes.error, clientesAbcRes.error, sacadosAbcRes.error, totaisFinanceirosRes.error].filter(Boolean);
        if (errors.length > 0) {
            console.error("Erros ao buscar métricas para relatório:", errors);
            throw new Error("Uma ou mais consultas para o relatório falharam.");
        }

        const totais = totaisFinanceirosRes.data[0] || { total_juros: 0, total_despesas: 0 };
        const lucroLiquido = (totais.total_juros || 0) - (totais.total_despesas || 0);

        const metrics = {
            valorOperadoNoMes: valorOperadoRes.data || 0,
            clientes: clientesAbcRes.data || [],
            sacados: sacadosAbcRes.data || [],
            totalJuros: totais.total_juros || 0,
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
