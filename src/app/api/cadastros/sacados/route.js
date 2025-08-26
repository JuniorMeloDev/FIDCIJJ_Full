import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

// GET: Busca todos os sacados com as suas condições de pagamento
export async function GET(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const { data, error } = await supabase
            .from('sacados')
            .select('*, condicoes_pagamento(*)')
            .order('nome', { ascending: true });

        if (error) throw error;
        return NextResponse.json(data, { status: 200 });
    } catch (error) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}

// POST: Cria um novo sacado e as suas condições de pagamento
export async function POST(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const body = await request.json();
        
        // --- CORREÇÃO AQUI: Separa os dados do sacado das condições de pagamento ---
        const { condicoesPagamento, ...sacadoData } = body;

        // 1. Insere o sacado
        const { data: newSacado, error: sacadoError } = await supabase
            .from('sacados')
            .insert(sacadoData)
            .select()
            .single();

        if (sacadoError) throw sacadoError;

        // 2. Se houver condições de pagamento, associa-as ao novo sacado
        if (condicoesPagamento && condicoesPagamento.length > 0) {
            const condicoesToInsert = condicoesPagamento.map(cond => ({
                parcelas: cond.parcelas,
                prazos: cond.prazos,
                sacado_id: newSacado.id
            }));
            const { error: condicoesError } = await supabase.from('condicoes_pagamento').insert(condicoesToInsert);
            if (condicoesError) throw condicoesError;
        }

        return NextResponse.json(newSacado, { status: 201 });
    } catch (error) {
        console.error("Erro ao criar sacado:", error);
        if (error.code === '23505') { 
            return NextResponse.json({ message: 'Já existe um sacado com este CNPJ.' }, { status: 409 });
        }
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}