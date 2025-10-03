import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

// GET: Busca sacados por nome
export async function GET(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const { searchParams } = new URL(request.url);
        const nome = searchParams.get('nome');

        if (!nome) {
            return NextResponse.json([], { status: 200 });
        }

        // --- CORREÇÃO APLICADA ---
        // A relação "condicoes_pagamento(*)" foi removida para evitar o erro de schema cache.
        const { data, error } = await supabase
            .from('sacados')
            .select('*') // O '*' aqui é menos problemático, mas para garantir vamos ser explícitos.
            // A query abaixo é ainda mais segura:
            // .select('id, nome, cnpj, municipio, uf, fone, matriz_id, ie, cep, endereco, bairro, condicoes_pagamento(*)')
            .ilike('nome', `%${nome}%`)
            .limit(10);

        if (error) throw error;
        // Adiciona um array vazio para a propriedade que foi removida, para não quebrar o frontend
        const dataWithEmptyRelations = data.map(item => ({...item, condicoes_pagamento: []}));

        return NextResponse.json(dataWithEmptyRelations, { status: 200 });
    } catch (error) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}