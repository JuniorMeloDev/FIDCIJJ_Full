import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

async function getUserIdFromToken(token) {
    if (!token) return null;
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // ✅ Agora o sub é tratado como o ID do usuário
        const userId = decoded.sub;
        if (!userId) {
            console.error("Token não contém sub (userId). Decoded:", decoded);
            return null;
        }

        return userId;
    } catch (e) {
        console.error("Falha ao verificar token:", e);
        return null;
    }
}

// GET: Retorna a contagem de notificações não lidas
export async function GET(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        const userId = await getUserIdFromToken(token);
        
        if (!userId) {
            return NextResponse.json(
                { message: 'Não autorizado ou usuário não encontrado.' },
                { status: 401 }
            );
        }

        const { count, error } = await supabase
            .from('notifications')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('is_read', false);

        if (error) {
            console.error("Erro ao buscar notificações não lidas:", error);
            throw error;
        }

        return NextResponse.json({ count: count || 0 }, { status: 200 });

    } catch (error) {
        console.error("Erro geral em GET unread-count:", error);
        return NextResponse.json(
            { message: error.message || 'Erro interno do servidor' },
            { status: 500 }
        );
    }
}
