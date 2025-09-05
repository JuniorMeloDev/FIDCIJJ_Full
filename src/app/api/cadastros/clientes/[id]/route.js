import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

export async function PUT(request, { params }) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const { id } = params;
        const body = await request.json();
        
        // --- PONTO CRÍTICO DA CORREÇÃO ---
        // Aqui, separamos TUDO que não pertence diretamente à tabela 'clientes'.
        // O que sobra em 'clienteData' é apenas o que pode ser salvo nela.
        const { 
            acesso, 
            contasBancarias, 
            emails, 
            ramoDeAtividade,
            // Adicionamos estas para garantir que nenhuma variação passe
            contas_bancarias, 
            cliente_emails,
            ramo_de_atividade,
            ...clienteData 
        } = body;

        // 1. ATUALIZA OS DADOS DO CLIENTE (agora com certeza sem os campos extras)
        const { error: clienteError } = await supabase
            .from('clientes')
            .update({ ...clienteData, ramo_de_atividade: ramoDeAtividade }) // Atualiza os dados puros + o ramo
            .eq('id', id);

        if (clienteError) {
            console.error("Erro ao atualizar tabela clientes:", clienteError);
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

        // 3. ATUALIZA EMAILS PARA NOTIFICAÇÃO (tabela separada)
        await supabase.from('cliente_emails').delete().eq('cliente_id', id);
        if (emails && emails.length > 0) {
            const emailsToInsert = emails.map(email => ({ email, cliente_id: id }));
            await supabase.from('cliente_emails').insert(emailsToInsert);
        }

        // 4. GERENCIA O USUÁRIO DE ACESSO
        if (acesso && acesso.username) {
            const { data: existingUser } = await supabase.from('users').select('id').eq('cliente_id', id).single();
            
            if (existingUser) { 
                const updatePayload = { username: acesso.username };
                if (acesso.password) {
                    updatePayload.password = await bcrypt.hash(acesso.password, 10);
                }
                await supabase.from('users').update(updatePayload).eq('id', existingUser.id);
            } else { 
                if (!acesso.password) {
                    throw new Error("A senha é obrigatória para criar um novo usuário de acesso.");
                }
                const hashedPassword = await bcrypt.hash(acesso.password, 10);
                await supabase.from('users').insert({
                    username: acesso.username,
                    password: hashedPassword,
                    roles: 'ROLE_CLIENTE',
                    cliente_id: id
                });
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

// A função DELETE permanece a mesma
export async function DELETE(request, { params }) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const { id } = params;
        await supabase.from('users').delete().eq('cliente_id', id);
        await supabase.from('clientes').delete().eq('id', id);

        return new NextResponse(null, { status: 204 });
    } catch (error) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}