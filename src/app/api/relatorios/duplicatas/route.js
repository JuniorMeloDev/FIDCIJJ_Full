import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

export async function GET(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const { searchParams } = new URL(request.url);

        // A API agora apenas recolhe os filtros
        const rpcParams = {
            p_data_inicio: searchParams.get('dataInicio') || null,
            p_data_fim: searchParams.get('dataFim') || null,
            p_cliente_id: searchParams.get('clienteId') || null,
            p_sacado: searchParams.get('sacado') || null,
            p_status: searchParams.get('status') || null,
            p_tipo_operacao_id: searchParams.get('tipoOperacaoId') || null
        };

        // E passa-os todos para a função do Supabase
        const { data, error } = await supabase.rpc('get_duplicatas_filtradas', rpcParams);

        if (error) throw error;
        return NextResponse.json(data, { status: 200 });
    } catch (error) {
        console.error("Erro na API de relatório de duplicatas:", error);
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            return NextResponse.json({ message: 'Token inválido ou expirado' }, { status: 403 });
        }
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}