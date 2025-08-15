import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseServerClient';
import jwt from 'jsonwebtoken';

// GET: Busca os emails de um cliente específico
export async function GET(request, { params }) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const { id } = params;
        const { data, error } = await supabase
            .from('cliente_emails')
            .select('email')
            .eq('cliente_id', id);

        if (error) throw error;

        // Retorna um array de strings de email, como o frontend espera
        const emails = data.map(item => item.email);
        return NextResponse.json(emails, { status: 200 });
    } catch (error) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}