import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

// PUT: Atualiza um cliente
export async function PUT(request, { params }) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const { id } = params;
        const body = await request.json();
        const { contasBancarias, emails, ramoDeAtividade, ...clienteData } = body;

        // Mapeia camelCase para snake_case
        const clienteDataToUpdate = {
            ...clienteData,
            ramo_de_atividade: ramoDeAtividade
        };

        // 1. Atualiza os dados do cliente
        const { error: clienteError } = await supabase.from('clientes').update(clienteDataToUpdate).eq('id', id);
        if (clienteError) throw clienteError;

        // 2. Limpa e reinsere contas e emails
        await supabase.from('contas_bancarias').delete().eq('cliente_id', id);
        await supabase.from('cliente_emails').delete().eq('cliente_id', id);

        if (contasBancarias && contasBancarias.length > 0) {
            const contasToInsert = contasBancarias.map(({id: contaId, ...c}) => ({ ...c, cliente_id: id }));
            const { error } = await supabase.from('contas_bancarias').insert(contasToInsert);
            if(error) throw error;
        }
        if (emails && emails.length > 0) {
            const emailsToInsert = emails.map(email => ({ email, cliente_id: id }));
            const { error } = await supabase.from('cliente_emails').insert(emailsToInsert);
            if(error) throw error;
        }

        return new NextResponse(null, { status: 204 });
    } catch (error) {
        if (error.code === '23505') {
            return NextResponse.json({ message: 'Já existe um cliente com este CNPJ ou Nome.' }, { status: 409 });
        }
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}

// DELETE: Apaga um cliente
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