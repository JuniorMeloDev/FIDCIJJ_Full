import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

export async function GET(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) {
            return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const clienteId = decoded.cliente_id;
        const username = decoded.sub;

        if (!clienteId) {
            return NextResponse.json({ message: 'Cliente não associado a este token.' }, { status: 403 });
        }

        const { data: clienteData, error: clienteError } = await supabase
            .from('clientes')
            .select(`
                *,
                contas_bancarias (*)
            `)
            .eq('id', clienteId)
            .single();

        if (clienteError) throw new Error("Não foi possível encontrar os dados da sua empresa.");
        
        // Adiciona o nome de usuário aos dados retornados
        const profileData = {
            ...clienteData,
            username: username
        };

        return NextResponse.json(profileData, { status: 200 });

    } catch (error) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}
