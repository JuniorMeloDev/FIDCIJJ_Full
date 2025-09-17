import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

// GET (sem alterações)
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
export async function POST(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const body = await request.json();
        const { condicoesPagamento, ...sacadoData } = body;
        const cleanCnpj = sacadoData.cnpj?.replace(/\D/g, '');

        // Verifica se já existe um sacado com este CNPJ
        const { data: existingSacado } = await supabase
            .from('sacados')
            .select('id, matriz_id')
            .eq('cnpj', cleanCnpj)
            .single();

        // Se o sacado já existe, ATUALIZA (vincula como filial)
        if (existingSacado) {
            if (existingSacado.matriz_id && existingSacado.matriz_id !== sacadoData.matriz_id) {
                return NextResponse.json({ message: 'Este CNPJ já está vinculado a outra matriz.' }, { status: 409 });
            }
            delete sacadoData.id;

            const { data: updatedSacado, error: updateError } = await supabase
                .from('sacados')
                .update({ ...sacadoData, cnpj: cleanCnpj })
                .eq('id', existingSacado.id)
                .select()
                .single();
                
            if (updateError) throw updateError;
            return NextResponse.json(updatedSacado, { status: 200 });
        }

        // Se não existe, cria um novo
        // CORREÇÃO: Remove o campo 'id' antes de inserir um novo registro
        delete sacadoData.id;

        const { data: newSacado, error: insertError } = await supabase
            .from('sacados')
            .insert({ ...sacadoData, cnpj: cleanCnpj })
            .select()
            .single();

        if (insertError) throw insertError;

        if (condicoesPagamento && condicoesPagamento.length > 0) {
            const condicoesToInsert = condicoesPagamento.map(cond => ({
                parcelas: cond.parcelas,
                prazos: cond.prazos,
                sacado_id: newSacado.id
            }));
            await supabase.from('condicoes_pagamento').insert(condicoesToInsert);
        }

        return NextResponse.json(newSacado, { status: 201 });

    } catch (error) {
        if (error.code === '23505') { 
            return NextResponse.json({ message: 'Já existe um sacado com este CNPJ.' }, { status: 409 });
        }
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}