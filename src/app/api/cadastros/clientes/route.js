// Arquivo: src/app/api/cadastros/clientes/route.js

import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

// Função para gerar senha forte
const generateStrongPassword = () => {
    const length = 10;
    const lower = 'abcdefghijklmnopqrstuvwxyz';
    const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const numbers = '0123456789';
    const special = '!@#$%^&*()_+-=[]{}|;:,.<>?';
    const all = lower + upper + numbers + special;

    let password = '';
    password += lower[Math.floor(Math.random() * lower.length)];
    password += upper[Math.floor(Math.random() * upper.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += special[Math.floor(Math.random() * special.length)];

    for (let i = 4; i < length; i++) {
        password += all[Math.floor(Math.random() * all.length)];
    }
    return password.split('').sort(() => 0.5 - Math.random()).join('');
};


// GET: Busca todos os clientes (sem alterações)
export async function GET(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const { data, error } = await supabase
            .from('clientes')
            .select(`
                *,
                contas_bancarias (*),
                cliente_emails (email),
                cliente_tipos_operacao ( tipo_operacao_id )
            `)
            .order('nome', { ascending: true });

        if (error) {
            console.error('Erro do Supabase ao buscar clientes:', error);
            throw error;
        }

        return NextResponse.json(data, { status: 200 });
    } catch (error) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}

// POST: Cria um novo cliente
export async function POST(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const body = await request.json();
        const { contasBancarias, emails, acesso, ramoDeAtividade, tiposOperacao, sendWelcomeEmail, ...clienteData } = body;
        
        delete clienteData.id;

        const dataToSave = { ...clienteData, ramo_de_atividade: ramoDeAtividade };

        const { data: newCliente, error: clienteError } = await supabase
            .from('clientes').insert(dataToSave).select().single();

        if (clienteError) throw clienteError;

        if (contasBancarias && contasBancarias.length > 0) {
            const contasToInsert = contasBancarias.map(c => ({ ...c, cliente_id: newCliente.id }));
            await supabase.from('contas_bancarias').insert(contasToInsert);
        }

        if (emails && emails.length > 0) {
            const emailsToInsert = emails.map(email => ({ email, cliente_id: newCliente.id }));
            await supabase.from('cliente_emails').insert(emailsToInsert);
        }
        
        if (tiposOperacao && tiposOperacao.length > 0) {
            const tiposToInsert = tiposOperacao.map(tipo_id => ({ cliente_id: newCliente.id, tipo_operacao_id: tipo_id }));
            await supabase.from('cliente_tipos_operacao').insert(tiposToInsert);
        }

        // --- LÓGICA DE USUÁRIO E E-MAIL ---
        if (acesso && acesso.username) {
            let tempPassword = acesso.password;
            
            // Se for para enviar e-mail de boas-vindas, gera uma nova senha forte
            if (sendWelcomeEmail) {
                tempPassword = generateStrongPassword();
            }

            if (!tempPassword) {
                 await supabase.from('clientes').delete().eq('id', newCliente.id); // Rollback
                 throw new Error("A senha é obrigatória para criar um novo usuário de acesso.");
            }

            const hashedPassword = await bcrypt.hash(tempPassword, 10);
            const { error: userError } = await supabase.from('users').insert({
                username: acesso.username,
                password: hashedPassword,
                roles: 'ROLE_CLIENTE',
                cliente_id: newCliente.id
            });

            if (userError) {
                await supabase.from('clientes').delete().eq('id', newCliente.id); // Rollback
                throw userError;
            }
            
            // Envia o e-mail se a flag estiver ativa
            if (sendWelcomeEmail) {
                const recipientEmail = clienteData.email || (emails && emails.length > 0 ? emails[0] : null);
                if (recipientEmail) {
                    const emailApiUrl = new URL('/api/emails/send-welcome', request.url);
                    await fetch(emailApiUrl.toString(), {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            clienteNome: newCliente.nome,
                            username: acesso.username,
                            tempPassword: tempPassword,
                            recipientEmail: recipientEmail
                        })
                    });
                }
            }
        }
        // --- FIM DA LÓGICA ---

        return NextResponse.json(newCliente, { status: 201 });
    } catch (error) {
        if (error.code === '23505') { 
            const message = error.message.includes('users_username_key') 
                ? 'Este nome de usuário já está em uso.'
                : 'Já existe um cliente com este CNPJ ou Nome.';
            return NextResponse.json({ message }, { status: 409 });
        }
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}