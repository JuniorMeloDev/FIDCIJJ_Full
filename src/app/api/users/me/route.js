import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseServerClient';
import jwt from 'jsonwebtoken';

// GET: Busca os dados do usuário logado
export async function GET(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const username = decoded.sub; // 'sub' é o username

        const { data, error } = await supabase
            .from('users')
            .select('id, username, email, telefone, roles')
            .eq('username', username)
            .single();

        if (error) throw error;
        return NextResponse.json(data, { status: 200 });
    } catch (error) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}