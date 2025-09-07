import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

async function getUserIdFromToken(token) {
    if (!token) return null;
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const username = decoded.sub;
        const { data: user, error } = await supabase.from('users').select('id').eq('username', username).single();
        if (error) throw error;
        return user?.id;
    } catch (e) {
        return null;
    }
}

// GET: Retorna a contagem de notificações não lidas
export async function GET(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        const userId = await getUserIdFromToken(token);
        if (!userId) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });

        const { count, error } = await supabase
            .from('notifications')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('is_read', false);

        if (error) throw error;

        return NextResponse.json({ count: count || 0 }, { status: 200 });

    } catch (error) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}
