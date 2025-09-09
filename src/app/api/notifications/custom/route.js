import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';
import { sendCustomNotificationEmail } from '@/app/lib/emailService';

export async function POST(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userRoles = decoded.roles || [];
        if (!userRoles.includes('ROLE_ADMIN')) {
            return NextResponse.json({ message: 'Acesso negado.' }, { status: 403 });
        }

        const { clientIds, title, message } = await request.json();

        if (!clientIds || clientIds.length === 0 || !title || !message) {
            return NextResponse.json({ message: 'Todos os campos são obrigatórios.' }, { status: 400 });
        }
        
        // 1. Buscar os IDs dos usuários associados aos clientes
        const { data: users, error: userError } = await supabase
            .from('users')
            .select('id')
            .in('cliente_id', clientIds);

        if (userError) throw userError;
        if (users.length === 0) {
            return NextResponse.json({ message: 'Nenhum usuário destinatário encontrado para os clientes selecionados.' }, { status: 404 });
        }
        
        // 2. Preparar e inserir as notificações no banco de dados
        const notificationsToInsert = users.map(user => ({
            user_id: user.id,
            title,
            message,
            link: '/portal/notificacoes' // Link genérico para a página de notificações do cliente
        }));

        const { error: insertError } = await supabase.from('notifications').insert(notificationsToInsert);
        if (insertError) throw insertError;
        
        // 3. Buscar os e-mails dos clientes para enviar a notificação
        const { data: clients, error: clientError } = await supabase
            .from('clientes')
            .select('email')
            .in('id', clientIds);
        
        if (clientError) {
             console.error("Falha ao buscar e-mails dos clientes, mas as notificações foram salvas.", clientError);
        } else {
            const recipientEmails = clients.map(c => c.email).filter(Boolean);
            if (recipientEmails.length > 0) {
                await sendCustomNotificationEmail({
                    title,
                    message,
                    recipientEmails
                });
            }
        }
        
        return NextResponse.json({ success: true, message: 'Notificações enviadas.' }, { status: 201 });

    } catch (error) {
        console.error('Erro ao enviar notificação personalizada:', error);
        return NextResponse.json({ message: error.message || 'Erro interno do servidor' }, { status: 500 });
    }
}