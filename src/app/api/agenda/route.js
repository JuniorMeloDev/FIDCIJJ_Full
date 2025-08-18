import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

// GET: Busca anotações com filtros
export async function GET(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userId = decoded.sub; // Assumindo que 'sub' é o user_id

        const { searchParams } = new URL(request.url);
        let query = supabase.from('anotacoes').select('*');

        // Filtros
        if (searchParams.get('dataInicio')) query = query.gte('data', searchParams.get('dataInicio'));
        if (searchParams.get('dataFim')) query = query.lte('data', searchParams.get('dataFim'));
        if (searchParams.get('assunto')) query = query.ilike('assunto', `%${searchParams.get('assunto')}%`);

        query = query.order('data', { ascending: false });

        const { data, error } = await query;
        if (error) throw error;

        return NextResponse.json(data, { status: 200 });
    } catch (error) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}

// POST: Cria uma nova anotação
export async function POST(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userId = decoded.sub;

        const body = await request.json();

        const { data, error } = await supabase
            .from('anotacoes')
            .insert([{ ...body, user_id: userId }])
            .select();

        if (error) throw error;
        return NextResponse.json(data[0], { status: 201 });
    } catch (error) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}