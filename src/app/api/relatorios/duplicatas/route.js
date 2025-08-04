import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

export async function GET(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const { searchParams } = new URL(request.url);
        let query = supabase.rpc('get_duplicatas_filtradas', { 
            sort_column: 'data_operacao',
            sort_direction: 'ASC'
        });

        // Aplica os filtros da URL
        if (searchParams.get('dataInicio')) query = query.gte('data_operacao', searchParams.get('dataInicio'));
        if (searchParams.get('dataFim')) query = query.lte('data_operacao', searchParams.get('dataFim'));
        if (searchParams.get('clienteId')) query = query.eq('cliente_id', searchParams.get('clienteId'));
        if (searchParams.get('sacado')) query = query.ilike('cliente_sacado', `%${searchParams.get('sacado')}%`);
        if (searchParams.get('status') && searchParams.get('status') !== 'Todos') query = query.eq('status_recebimento', searchParams.get('status'));

        if (searchParams.get('tipoOperacaoId')) query = query.eq('tipo_operacao_id', searchParams.get('tipoOperacaoId'));

        const { data, error } = await query;
        if (error) throw error;
        return NextResponse.json(data, { status: 200 });
    } catch (error) {
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            return NextResponse.json({ message: 'Token inválido ou expirado' }, { status: 403 });
        }
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}