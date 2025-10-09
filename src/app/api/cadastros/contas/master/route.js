import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

export async function GET(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        // --- LÓGICA CORRIGIDA ---
        // 1. Encontrar o ID do cliente master (o primeiro cliente cadastrado no sistema)
        const { data: masterClient, error: clientError } = await supabase
            .from('clientes')
            .select('id')
            .order('id', { ascending: true })
            .limit(1)
            .single();

        // Se nenhum cliente estiver cadastrado, retorna uma lista vazia.
        if (clientError) {
            if (clientError.code === 'PGRST116') { // Erro "No rows found"
                return NextResponse.json([], { status: 200 });
            }
            throw new Error('Erro ao buscar o cliente principal (master).');
        }

        // 2. Usar o ID do cliente master para buscar apenas as contas associadas a ele.
        const { data, error } = await supabase
            .from('contas_bancarias')
            .select('*')
            .eq('cliente_id', masterClient.id);

        if (error) {
            console.error("Erro ao buscar contas master:", error);
            throw new Error('Erro ao buscar as contas da empresa.');
        }
        
        return NextResponse.json(data, { status: 200 });

    } catch (error) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}