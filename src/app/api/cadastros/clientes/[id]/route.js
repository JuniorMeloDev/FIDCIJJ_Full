import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseServerClient';
import jwt from 'jsonwebtoken';


export async function PUT(request, { params }) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const { id } = params;
        const body = await request.json();

        const { 
            contasBancarias, 
            emails, 
            ramoDeAtividade,
            cliente_emails, 
            contas_bancarias, 
            ...clienteData 
        } = body;

        // Mapeia camelCase para snake_case para o campo específico
        const clienteDataToUpdate = {
            ...clienteData,
            ramo_de_atividade: ramoDeAtividade
        };

        // 1. Atualiza apenas os dados da tabela 'clientes'
        const { error: clienteError } = await supabase.from('clientes').update(clienteDataToUpdate).eq('id', id);
        if (clienteError) throw clienteError;

        // 2. Limpa e reinsere contas e emails
        await supabase.from('contas_bancarias').delete().eq('cliente_id', id);
        await supabase.from('cliente_emails').delete().eq('cliente_id', id);

        if (contasBancarias && contasBancarias.length > 0) {
            const contasToInsert = contasBancarias.map(({id: contaId, ...c}) => ({ 
                banco: c.banco,
                agencia: c.agencia,
                conta_corrente: c.contaCorrente, // Mapeamento manual
                cliente_id: id 
            }));
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
        console.error("Erro ao atualizar cliente:", error);
        if (error.code === '23505') {
            return NextResponse.json({ message: 'Já existe um cliente com este CNPJ ou Nome.' }, { status: 409 });
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