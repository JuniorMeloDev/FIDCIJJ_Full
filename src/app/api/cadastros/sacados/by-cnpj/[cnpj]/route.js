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

        const { data, error } = await supabase
            .from('sacados')
            .select('*, condicoes_pagamento(*)')
            .eq('cnpj', cleanCnpj)
            .single(); // .single() para esperar um único resultado

        if (error) {
            // Se o erro for 'PGRST116', significa "0 rows returned", ou seja, não encontrado
            if (error.code === 'PGRST116') {
                return NextResponse.json({ message: 'Sacado não encontrado.' }, { status: 404 });
            }
            throw error;
        }

        return NextResponse.json(data, { status: 200 });
    } catch (error) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}