// Arquivo: src/app/api/cadastros/clientes/[id]/route.js

import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { generateStrongPassword, sendWelcomeEmail } from '@/app/lib/emailService';

export async function PUT(request, { params }) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const { id } = params;
        const body = await request.json();
        
        const { 
            acesso, 
            contasBancarias, 
            emails, 
            ramoDeAtividade,
            tiposOperacao,
            sendWelcomeEmail: sendWelcomeFlag,
            // Propriedades de relacionamento que não devem ser passadas no update
            contas_bancarias,
            cliente_emails,
            cliente_tipos_operacao,
            ...clienteData 
        } = body;

        // 1. ATUALIZA OS DADOS DO CLIENTE
        const { error: clienteError } = await supabase
            .from('clientes')
            .update({ ...clienteData, ramo_de_atividade: ramoDeAtividade })
            .eq('id', id);

        if (clienteError) {
             console.error("Erro ao atualizar dados do cliente:", clienteError);
             throw clienteError;
        }

        // 2. ATUALIZA CONTAS BANCÁRIAS
        await supabase.from('contas_bancarias').delete().eq('cliente_id', id);
        if (contasBancarias && contasBancarias.length > 0) {
             const contasToInsert = contasBancarias.map(({id: contaId, ...c}) => ({ 
                banco: c.banco,
                agencia: c.agencia,
                conta_corrente: c.contaCorrente,
                cliente_id: id 
            }));
            await supabase.from('contas_bancarias').insert(contasToInsert);
        }

        // 3. ATUALIZA EMAILS
        await supabase.from('cliente_emails').delete().eq('cliente_id', id);
        if (emails && emails.length > 0) {
            const emailsToInsert = emails.map(emailAddr => ({ email: emailAddr, cliente_id: id }));
            await supabase.from('cliente_emails').insert(emailsToInsert);
        }
        
        // 4. ATUALIZA OS TIPOS DE OPERAÇÃO
        await supabase.from('cliente_tipos_operacao').delete().eq('cliente_id', id);
        if (tiposOperacao && tiposOperacao.length > 0) {
            const tiposToInsert = tiposOperacao.map(tipo_id => ({ cliente_id: parseInt(id), tipo_operacao_id: tipo_id }));
            const { error: tiposError } = await supabase.from('cliente_tipos_operacao').insert(tiposToInsert);
            if (tiposError) throw tiposError;
        }

        // 5. GERE O ACESSO DO USUÁRIO E ENVIA O E-MAIL SE NECESSÁRIO
        if (acesso && acesso.username) {
            let tempPassword = acesso.password;
            
            if (sendWelcomeFlag) {
                tempPassword = generateStrongPassword();
            }

            const { data: existingUser } = await supabase.from('users').select('id').eq('cliente_id', id).single();
            
            if (existingUser) { 
                const updatePayload = { username: acesso.username };
                if (tempPassword) {
                    updatePayload.password = await bcrypt.hash(tempPassword, 10);
                }
                await supabase.from('users').update(updatePayload).eq('id', existingUser.id);
            } else { 
                if (!tempPassword) throw new Error("A senha é obrigatória para criar um novo usuário de acesso.");
                
                const hashedPassword = await bcrypt.hash(tempPassword, 10);
                await supabase.from('users').insert({
                    username: acesso.username,
                    password: hashedPassword,
                    roles: 'ROLE_CLIENTE',
                    cliente_id: id
                });
            }

            if (sendWelcomeFlag) {
                const recipientEmail = clienteData.email || (emails && emails.length > 0 ? emails[0] : null);
                if (recipientEmail) {
                    console.log("📧 Enviando e-mail de boas-vindas para:", recipientEmail);
                    await sendWelcomeEmail({
                        clienteNome: clienteData.nome,
                        username: acesso.username,
                        tempPassword: tempPassword,
                        recipientEmail: recipientEmail
                    });
                    console.log("✅ E-mail enviado com sucesso!");
                } else {
                    console.warn("⚠ Nenhum e-mail encontrado para envio de boas-vindas.");
                }
            }
        }

        return new NextResponse(null, { status: 204 });
    } catch (error) {
        console.error("Erro na API PUT /api/cadastros/clientes/[id]:", error);
        if (error.code === '23505') {
            return NextResponse.json({ message: 'Este nome de usuário já está em uso.' }, { status: 409 });
        }
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}

export async function DELETE(request, { params }) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const { id } = params;
        const { error } = await supabase.from('clientes').delete().eq('id', id);
        
        if (error) throw error;

        return new NextResponse(null, { status: 204 });
    } catch (error) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}
