import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

// GET: Busca os emails de um cliente específico
export async function GET(request, props) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const params = await props.params;
        const { id } = params;

        // Busca email principal na tabela clientes
        const { data: cliente, error: cliError } = await supabase
            .from('clientes')
            .select('email')
            .eq('id', id)
            .single();

        if (cliError && cliError.code !== 'PGRST116') throw cliError; // Ignora erro se não encontrar (embora deva existir)

        // Busca emails adicionais na tabela cliente_emails
        const { data: emailsAdicionais, error: emailsError } = await supabase
            .from('cliente_emails')
            .select('email')
            .eq('cliente_id', id);

        if (emailsError) throw emailsError;

        // Combina e remove duplicatas
        let allEmails = [];
        if (cliente && cliente.email) allEmails.push(cliente.email);
        if (emailsAdicionais) allEmails.push(...emailsAdicionais.map(item => item.email));
        
        // Remove duplicatas e nulos
        const uniqueEmails = [...new Set(allEmails)].filter(e => e);

        return NextResponse.json(uniqueEmails, { status: 200 });
    } catch (error) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}