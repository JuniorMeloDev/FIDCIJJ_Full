import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

// GET: Busca um sacado por CNPJ
export async function GET(request, { params }) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const { cnpj } = params;
        const cleanCnpj = cnpj.replace(/\D/g, '');

        if (cleanCnpj.length !== 14) {
            return NextResponse.json({ message: 'CNPJ inválido.' }, { status: 400 });
        }

        // CORREÇÃO: Removido a busca pela relação 'condicoes_pagamento(*)'
        // que estava causando o erro de schema cache.
        const { data, error } = await supabase
            .from('sacados')
            .select('*') // Busca apenas os dados da tabela 'sacados'
            .eq('cnpj', cleanCnpj)
            .single();

        if (error) {
            // Se o erro for 'PGRST116', significa "0 rows returned", ou seja, não encontrado
            if (error.code === 'PGRST116') {
                return NextResponse.json({ message: 'Sacado não encontrado.' }, { status: 404 });
            }
            throw error;
        }

        return NextResponse.json(data, { status: 200 });
    } catch (error) {
        console.error("Erro na API /by-cnpj:", error);
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}