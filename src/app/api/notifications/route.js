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
        console.error("Token verification failed:", e);
        return null;
    }
}

// GET: Busca notificações para o usuário logado
export async function GET(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        const userId = await getUserIdFromToken(token);
        if (!userId) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });

        const { searchParams } = new URL(request.url);
        let query = supabase.from('notifications').select('*').eq('user_id', userId);

        if (searchParams.get('dataInicio')) query = query.gte('created_at', searchParams.get('dataInicio'));
        if (searchParams.get('dataFim')) {
            const dataFim = new Date(searchParams.get('dataFim'));
            dataFim.setHours(23, 59, 59, 999); // Inclui o dia todo
            query = query.lte('created_at', dataFim.toISOString());
        }
        
        query = query.order('created_at', { ascending: false });

        const { data, error } = await query;

        if (error) throw error;

        return NextResponse.json(data, { status: 200 });
    } catch (error) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}

// POST: Marca notificações como lidas
export async function POST(request) {
     try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        const userId = await getUserIdFromToken(token);
        if (!userId) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });

        const { ids } = await request.json();

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return NextResponse.json({ message: 'Nenhum ID de notificação fornecido.' }, { status: 400 });
        }

        const { error } = await supabase
            .from('notifications')
            .update({ is_read: true })
            .in('id', ids)
            .eq('user_id', userId);

        if (error) throw error;

        return new NextResponse(null, { status: 204 });

    } catch (error) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}
    // DELETE: Exclui notificações

export async function DELETE(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        const userId = await getUserIdFromToken(token);
        if (!userId) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });

        const { ids } = await request.json();

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return NextResponse.json({ message: 'Nenhum ID de notificação fornecido para exclusão.' }, { status: 400 });
        }

        const { error } = await supabase
            .from('notifications')
            .delete()
            .in('id', ids)
            .eq('user_id', userId); // Garante que o usuário só pode excluir as suas próprias notificações

        if (error) throw error;

        return new NextResponse(null, { status: 204 }); // No Content

    } catch (error) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }

}

