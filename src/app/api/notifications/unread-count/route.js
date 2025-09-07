import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

async function getUserIdFromToken(token) {
    if (!token) return null;
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const username = decoded.sub;
        const roles = decoded.roles || [];

        // Se for cliente, busca o usuário pelo cliente_id associado
        if (roles.includes('ROLE_CLIENTE')) {
            const clienteId = decoded.cliente_id;
            if (!clienteId) return null;

            const { data: user, error } = await supabase
                .from('users')
                .select('id')
                .eq('cliente_id', clienteId)
                .single();
            
            if (error) throw error;
            return user?.id;
        } 
        
        // Se for admin ou outro tipo, busca pelo username
        else {
            const { data: user, error } = await supabase
                .from('users')
                .select('id')
                .eq('username', username)
                .single();

            if (error) throw error;
            return user?.id;
        }

    } catch (e) {
        console.error("Token verification or user fetch failed:", e);
        return null;
    }
}

// GET: Retorna a contagem de notificações não lidas
export async function GET(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        const userId = await getUserIdFromToken(token);
        
        if (!userId) {
            return NextResponse.json({ message: 'Não autorizado ou usuário não encontrado.' }, { status: 401 });
        }

        const { count, error } = await supabase
            .from('notifications')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('is_read', false);

        if (error) {
             console.error("Error fetching unread notifications count:", error);
            // Retorna uma mensagem mais detalhada para depuração
            return NextResponse.json({ message: `Erro na consulta ao banco: ${error.message}` }, { status: 500 });
        }

        return NextResponse.json({ count: count || 0 }, { status: 200 });

    } catch (error) {
        console.error("General error in GET unread-count:", error);
        return NextResponse.json({ message: error.message || 'Erro interno do servidor' }, { status: 500 });
    }
}

