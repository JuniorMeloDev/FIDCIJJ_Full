import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

// GET: Busca clientes por nome para autocomplete
export async function GET(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const { searchParams } = new URL(request.url);
        const nome = searchParams.get('nome');

        if (!nome) return NextResponse.json([], { status: 200 });

        // --- CORREÇÃO APLICADA AQUI ---
        // A consulta agora inclui as contas bancárias relacionadas (*),
        // que contêm as chaves PIX.
        const { data, error } = await supabase
            .from('clientes')
            .select('*, contas_bancarias(*)')
            .ilike('nome', `%${nome}%`)
            .limit(10);

        if (error) throw error;
        
        // A resposta agora inclui os dados das contas
        const formattedData = data.map(cliente => ({
            ...cliente,
            contasBancarias: cliente.contas_bancarias.map(conta => ({
                ...conta,
                contaCorrente: conta.conta_corrente // Mantém a compatibilidade com o frontend
            }))
        }));

        return NextResponse.json(formattedData, { status: 200 });

    } catch (error) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}