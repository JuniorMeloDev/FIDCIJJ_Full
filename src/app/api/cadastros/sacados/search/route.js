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

        const { data, error } = await supabase
            .from('sacados')
            .select('*, condicoes_pagamento(*)')
            .ilike('nome', `%${nome}%`) // ilike é case-insensitive
            .limit(10);

        if (error) throw error;
        return NextResponse.json(data, { status: 200 });
    } catch (error) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}