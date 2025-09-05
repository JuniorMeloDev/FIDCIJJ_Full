import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

// GET: Busca todos os clientes
export async function GET(request) {
    // ... (código existente, sem alterações)
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const { data, error } = await supabase
            .from('clientes')
            .select(`
                *,
                contas_bancarias (*),
                cliente_emails (email)
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

// POST: Cria um novo cliente e seu usuário de acesso
export async function POST(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const body = await request.json();
        
        const { contasBancarias, emails, acesso, ramoDeAtividade, ...clienteData } = body;

        // CORREÇÃO: Remove a propriedade 'id' do objeto antes de salvar.
        // Isso garante que o banco de dados irá gerar um novo ID automaticamente.
        delete clienteData.id;

        const dataToSave = {
            ...clienteData,
            ramo_de_atividade: ramoDeAtividade
        };

        // 1. Insere o cliente com os dados corretos
        const { data: newCliente, error: clienteError } = await supabase
            .from('clientes')
            .insert(dataToSave)
            .select()
            .single();

        if (clienteError) throw clienteError;

        // 2. Insere as contas bancárias associadas
        if (contasBancarias && contasBancarias.length > 0) {
            const contasToInsert = contasBancarias.map(c => ({ ...c, cliente_id: newCliente.id }));
            await supabase.from('contas_bancarias').insert(contasToInsert);
        }

        // 3. Insere os emails de notificação associados
        if (emails && emails.length > 0) {
            const emailsToInsert = emails.map(email => ({ email, cliente_id: newCliente.id }));
            await supabase.from('cliente_emails').insert(emailsToInsert);
        }
        
        // 4. Cria o usuário de acesso se os dados foram fornecidos
        if (acesso && acesso.username && acesso.password) {
            const hashedPassword = await bcrypt.hash(acesso.password, 10);
            const { error: userError } = await supabase.from('users').insert({
                username: acesso.username,
                password: hashedPassword,
                roles: 'ROLE_CLIENTE',
                cliente_id: newCliente.id
            });

            if (userError) {
                await supabase.from('clientes').delete().eq('id', newCliente.id);
                throw userError;
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