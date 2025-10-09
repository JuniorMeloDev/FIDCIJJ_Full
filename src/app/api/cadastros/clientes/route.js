// src/app/api/cadastros/clientes/route.js

import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { generateStrongPassword, sendWelcomeEmail } from '@/app/lib/emailService';

export async function GET(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);
        
        const { searchParams } = new URL(request.url);
        const ramo = searchParams.get('ramo');

        let query = supabase
            .from('clientes')
            .select(`
                *,
                contas_bancarias (*),
                cliente_emails (email),
                cliente_tipos_operacao ( tipo_operacao_id )
            `);
        
        if (ramo && ramo !== 'Todos') {
            query = query.eq('ramo_de_atividade', ramo);
        }

        const { data: clientes, error } = await query.order('nome', { ascending: true });

        if (error) {
            console.error('Erro do Supabase ao buscar clientes:', error);
            throw error;
        }

        // NOVO: Calcular o limite disponível para cada cliente
        const clientesComLimite = await Promise.all(clientes.map(async (cliente) => {
            const { data: duplicatasPendentes, error: dupError } = await supabase
                .from('duplicatas')
                .select('valor_bruto, operacao:operacoes!inner(cliente_id)')
                .eq('operacao.cliente_id', cliente.id)
                .eq('status_recebimento', 'Pendente');

            if (dupError) {
                console.error(`Erro ao buscar duplicatas para cliente ${cliente.id}:`, dupError);
                return { ...cliente, limite_disponivel: null }; // Retorna null em caso de erro
            }
            
            const limiteUtilizado = duplicatasPendentes.reduce((sum, dup) => sum + dup.valor_bruto, 0);
            const limiteDisponivel = (cliente.limite_credito || 0) - limiteUtilizado;

            return { ...cliente, limite_disponivel: limiteDisponivel };
        }));

        return NextResponse.json(clientesComLimite, { status: 200 });
    } catch (error) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}


// A função POST permanece a mesma
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

        if (acesso && acesso.username) {
            let tempPassword = acesso.password;
            
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
            
            if (sendWelcomeEmail) {
                const recipientEmail = clienteData.email || (emails && emails.length > 0 ? emails[0] : null);
                if (recipientEmail) {
                    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
                    const emailApiUrl = `${appUrl}/api/emails/enviar-boasVindas`;
                    
                    const emailResponse = await fetch(emailApiUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            clienteNome: newCliente.nome,
                            username: acesso.username,
                            tempPassword: tempPassword,
                            recipientEmail: recipientEmail
                        })
                    });
                    if (!emailResponse.ok) {
                        console.error('Falha ao chamar a API de envio de e-mail:', await emailResponse.text());
                    }
                }
            }
        }

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