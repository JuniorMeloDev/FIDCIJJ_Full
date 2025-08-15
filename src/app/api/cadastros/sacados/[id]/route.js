import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

// PUT: Atualiza um sacado e as suas condições de pagamento
export async function PUT(request, { params }) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const { id } = params;
        const body = await request.json();
        const { condicoesPagamento, ...sacadoData } = body;

        // 1. Atualiza os dados principais do sacado
        const { error: sacadoError } = await supabase
            .from('sacados')
            .update(sacadoData)
            .eq('id', id);

        if (sacadoError) throw sacadoError;

        // 2. Apaga as condições de pagamento antigas
        const { error: deleteError } = await supabase.from('condicoes_pagamento').delete().eq('sacado_id', id);
        if (deleteError) throw deleteError;

        // 3. Insere as novas condições de pagamento
        if (condicoesPagamento && condicoesPagamento.length > 0) {
            const condicoesToInsert = condicoesPagamento.map(cond => ({
                ...cond,
                sacado_id: id
            }));
            const { error: insertError } = await supabase.from('condicoes_pagamento').insert(condicoesToInsert);
            if (insertError) throw insertError;
        }

        return new NextResponse(null, { status: 204 });
    } catch (error) {
        if (error.code === '23505') { 
            return NextResponse.json({ message: 'Já existe um sacado com este CNPJ.' }, { status: 409 });
        }
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}

// DELETE: Apaga um sacado
export async function DELETE(request, { params }) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const { id } = params;
        // O Supabase irá apagar em cascata as condições de pagamento se a chave estrangeira foi configurada corretamente
        const { error } = await supabase.from('sacados').delete().eq('id', id);

        if (error) throw error;
        return new NextResponse(null, { status: 204 });
    } catch (error) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}