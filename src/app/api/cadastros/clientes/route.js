import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

// GET: Busca todos os clientes (CORRIGIDO)
export async function GET(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        // A consulta agora busca explicitamente os dados das tabelas relacionadas.
        // Isso é mais robusto e evita erros caso a relação não seja perfeita.
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
            throw error; // Lança o erro para ser pego pelo catch
        }

        return NextResponse.json(data, { status: 200 });
    } catch (error) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}

// POST: Cria um novo cliente (CORRIGIDO)
export async function POST(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const body = await request.json();
        // Separa a lista de contas e emails do objeto principal do cliente
        const { contasBancarias, emails, ...clienteData } = body;

        // 1. Insere o cliente com todos os seus dados, incluindo o novo campo 'email'
        const { data: newCliente, error: clienteError } = await supabase
            .from('clientes')
            .insert(clienteData)
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

        return NextResponse.json(newCliente, { status: 201 });
    } catch (error) {
        if (error.code === '23505') { 
            return NextResponse.json({ message: 'Já existe um cliente com este CNPJ ou Nome.' }, { status: 409 });
        }
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}