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

        // 1. Buscar todos os clientes com seus dados
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

        const { data: clientes, error: clientesError } = await query.order('nome', { ascending: true });

        if (clientesError) {
            console.error('Erro do Supabase ao buscar clientes:', clientesError);
            throw clientesError;
        }

        // 2. CORREÇÃO DE PERFORMANCE E LÓGICA:
        // Buscar *todas* as duplicatas PENDENTES de operações APROVADAS em UMA ÚNICA CONSULTA.
        const { data: duplicatasUtilizadas, error: duplicatasError } = await supabase
            .from('duplicatas')
            .select('valor_bruto, operacao:operacoes!inner(cliente_id, status)') // Puxa o cliente_id e status da operação
            .eq('status_recebimento', 'Pendente')   // A duplicata está pendente
            .eq('operacao.status', 'Aprovada');     // E a operação foi Aprovada

        if (duplicatasError) {
            console.error('Erro ao buscar duplicatas para cálculo de limite:', duplicatasError);
            throw duplicatasError;
        }

        // 3. Criar um mapa de [cliente_id]: limite_utilizado para consulta rápida
        const limitesUtilizadosMap = duplicatasUtilizadas.reduce((acc, dup) => {
            const clienteId = dup.operacao.cliente_id;
            const valor = dup.valor_bruto || 0;
            if (!acc[clienteId]) {
                acc[clienteId] = 0;
            }
            acc[clienteId] += valor;
            return acc;
        }, {});

        // 4. Injetar o limite utilizado e disponível em cada cliente (em memória, muito mais rápido)
        const clientesComLimite = clientes.map(cliente => {
            const limite_total = cliente.limite_credito || 0;
            const limite_utilizado = limitesUtilizadosMap[cliente.id] || 0; // Pega o valor do mapa
            const limite_disponivel = limite_total - limite_utilizado;

            return { 
                ...cliente, 
                limite_utilizado,   // Adiciona o campo 'limite_utilizado'
                limite_disponivel // Adiciona/Corrige o campo 'limite_disponivel'
            };
        });

        // 5. Retornar a lista de clientes com os limites corretos
        return NextResponse.json(clientesComLimite, { status: 200 });

    } catch (error) {
        console.error('Erro em GET /api/cadastros/clientes:', error);
        return NextResponse.json({ message: error.message || 'Erro interno do servidor' }, { status: 500 });
    }
}


// A função POST permanece a mesma
export async function POST(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const body = await request.json();
        const { contasBancarias, emails, acesso, ramoDeAtividade, tiposOperacao, sendWelcomeEmail: shouldSendEmail, ...clienteData } = body;
        
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
            
            if (shouldSendEmail) {
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
            
            if (shouldSendEmail) {
                // Corrigido: 'sendWelcomeEmail' (variável booleana) vs 'sendWelcomeEmail' (função)
                // O código original parecia confundir. Mantendo a lógica de 'shouldSendEmail' (booleana)
                // e assumindo que o *envio* real é pela API de emails.
                const recipientEmail = clienteData.email || (emails && emails.length > 0 ? emails[0] : null);
                if (recipientEmail) {
                    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
                    const emailApiUrl = `${appUrl}/api/emails/enviar-boasVindas`; // Verifique se esta rota existe
                    
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
        console.error('Erro em POST /api/cadastros/clientes:', error);
        return NextResponse.json({ message: error.message || 'Erro interno do servidor' }, { status: 500 });
    }
}