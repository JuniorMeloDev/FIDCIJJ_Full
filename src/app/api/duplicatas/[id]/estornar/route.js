import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseServerClient';
import jwt from 'jsonwebtoken';

export async function POST(request, { params }) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const { id } = params;
        const { error } = await supabase.rpc('estornar_liquidacao', { p_duplicata_id: id });

        if (error) throw error;
        return new NextResponse(null, { status: 200 });
    } catch (error) {
        console.error('Erro ao estornar liquidação:', error);
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}