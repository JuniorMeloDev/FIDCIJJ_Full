import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';
import jwt from 'jsonwebtoken';

export async function GET(request) {
    try {
        // Validação do token (essencial para segurança)
        const authHeader = request.headers.get('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        }
        const token = authHeader.substring(7);
        jwt.verify(token, process.env.JWT_SECRET);

        // Extrai os parâmetros de filtro da URL
        const { searchParams } = new URL(request.url);
        const dataInicio = searchParams.get('dataInicio') || null;
        const dataFim = searchParams.get('dataFim') || null;

        // Chama a função no Supabase, agora passando os parâmetros
        const { data, error } = await supabase.rpc('get_saldos_por_conta', {
            data_inicio: dataInicio,
            data_fim: dataFim
        });

        if (error) {
            console.error("Erro ao buscar saldos:", error);
            throw new Error("Falha ao consultar os saldos no banco de dados.");
        }

        const formattedData = data.map(item => ({
            contaBancaria: item.conta_bancaria,
            saldo: item.saldo
        }));

        return NextResponse.json(formattedData, { status: 200 });

    } catch (error) {
        console.error('Erro no endpoint de saldos:', error.message);
        return NextResponse.json({ message: error.message || 'Erro interno do servidor' }, { status: 500 });
    }
}