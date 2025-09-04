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
        
        // Separa os dados de acesso, contas e emails do resto dos dados do cliente
        const { acesso, contasBancarias, emails, ...clienteData } = body;

        // 1. ATUALIZA OS DADOS DO CLIENTE PRIMEIRO
        const { error: clienteError } = await supabase.from('clientes').update(clienteData).eq('id', id);
        if (clienteError) throw clienteError;

        // 2. ATUALIZA CONTAS BANCÁRIAS
        await supabase.from('contas_bancarias').delete().eq('cliente_id', id);
        if (contasBancarias && contasBancarias.length > 0) {
            const contasToInsert = contasBancarias.map(({id: contaId, ...c}) => ({ ...c, cliente_id: id }));
            const { error: contasError } = await supabase.from('contas_bancarias').insert(contasToInsert);
            if(contasError) throw contasError;
        }

        // 3. ATUALIZA EMAILS
        await supabase.from('cliente_emails').delete().eq('cliente_id', id);
        if (emails && emails.length > 0) {
            const emailsToInsert = emails.map(email => ({ email, cliente_id: id }));
            const { error: emailsError } = await supabase.from('cliente_emails').insert(emailsToInsert);
            if(emailsError) throw emailsError;
        }

        // 4. GERENCIA O USUÁRIO DE ACESSO
        if (acesso && acesso.username) {
            const { data: existingUser } = await supabase.from('users').select('id').eq('cliente_id', id).single();
            
            if (existingUser) { // Se usuário já existe, atualiza
                const updatePayload = { username: acesso.username };
                if (acesso.password) {
                    updatePayload.password = await bcrypt.hash(acesso.password, 10);
                }
                const { error: userUpdateError } = await supabase.from('users').update(updatePayload).eq('id', existingUser.id);
                if (userUpdateError) throw userUpdateError;
            } else { // Se não existe, cria
                if (!acesso.password) {
                    throw new Error("A senha é obrigatória para criar um novo usuário de acesso.");
                }
                const hashedPassword = await bcrypt.hash(acesso.password, 10);
                const { error: userInsertError } = await supabase.from('users').insert({
                    username: acesso.username,
                    password: hashedPassword,
                    roles: 'ROLE_CLIENTE',
                    cliente_id: id
                });
                if (userInsertError) throw userInsertError;
            }
        }

        return new NextResponse(null, { status: 204 });
    } catch (error) {
        console.error("Erro ao atualizar cliente e acesso:", error);
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
        
        // Adicionado: deletar o usuário associado antes de deletar o cliente
        await supabase.from('users').delete().eq('cliente_id', id);

        const { error } = await supabase.from('clientes').delete().eq('id', id);
        if (error) throw error;

        return new NextResponse(null, { status: 204 });
    } catch (error) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}