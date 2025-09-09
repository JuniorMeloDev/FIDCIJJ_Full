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

        const formData = await request.formData();
        const clientIds = JSON.parse(formData.get('clientIds'));
        const title = formData.get('title');
        const message = formData.get('message');
        const sendEmail = formData.get('sendEmail') === 'true';
        const files = formData.getAll('attachments');

        if (!clientIds || clientIds.length === 0 || !title || !message) {
            return NextResponse.json({ message: 'Todos os campos de texto são obrigatórios.' }, { status: 400 });
        }
        
        const { data: users, error: userError } = await supabase.from('users').select('id').in('cliente_id', clientIds);
        if (userError) throw userError;
        if (users.length === 0) {
            return NextResponse.json({ message: 'Nenhum usuário destinatário encontrado.' }, { status: 404 });
        }

        // **CORREÇÃO: Extrai os nomes dos arquivos para salvar no BD**
        const attachmentFileNames = files.map(file => file.name);
        
        const notificationsToInsert = users.map(user => ({
            user_id: user.id,
            title,
            message,
            link: null, // Link nulo para notificações personalizadas
            attachments: attachmentFileNames.length > 0 ? attachmentFileNames : null, // Salva os nomes dos arquivos
        }));

        const { error: insertError } = await supabase.from('notifications').insert(notificationsToInsert);
        if (insertError) throw insertError;
        
        const { data: clients, error: clientError } = await supabase.from('clientes').select('email').in('id', clientIds);
        
        if (clientError) {
             console.error("Falha ao buscar e-mails, mas notificações no portal foram salvas.", clientError);
        } else {
            const recipientEmails = clients.map(c => c.email).filter(Boolean);
            if (recipientEmails.length > 0) {
                const attachments = [];
                if (sendEmail) {
                    for (const file of files) {
                        const buffer = Buffer.from(await file.arrayBuffer());
                        attachments.push({
                            filename: file.name,
                            content: buffer,
                            contentType: file.type,
                        });
                    }
                }

                await sendCustomNotificationEmail({
                    title,
                    message,
                    recipientEmails,
                    attachments,
                    isDetailedEmail: sendEmail
                });
            }
        }
        
        return NextResponse.json({ success: true, message: 'Notificações enviadas.' }, { status: 201 });

    } catch (error) {
        console.error('Erro ao enviar notificação personalizada:', error);
        return NextResponse.json({ message: error.message || 'Erro interno do servidor' }, { status: 500 });
    }
}