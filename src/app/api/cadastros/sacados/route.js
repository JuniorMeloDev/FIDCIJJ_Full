import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

// GET: Busca todos os sacados com uma consulta explícita para evitar erros de cache
export async function GET(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        // --- CORREÇÃO APLICADA ---
        // A coluna "created_at" foi removida da seleção para corrigir o erro.
        const { data, error } = await supabase
            .from('sacados')
            .select(`
                id,
                nome,
                cnpj,
                ie,
                cep,
                endereco,
                bairro,
                municipio,
                uf,
                fone,
                matriz_id
            `)
            .order('nome', { ascending: true });

        if (error) {
            console.error("Erro no GET /api/cadastros/sacados:", error);
            throw error;
        }
        return NextResponse.json(data, { status: 200 });
    } catch (error) {
        console.error("Catch block: Erro no GET /api/cadastros/sacados:", error);
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}

// POST (sem alterações, mas incluído para facilitar a substituição do arquivo)
export async function POST(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const body = await request.json();
        const { condicoesPagamento, ...sacadoData } = body;
        const cleanCnpj = sacadoData.cnpj?.replace(/\D/g, '');

        const { data: existingSacado } = await supabase
            .from('sacados')
            .select('id, matriz_id')
            .eq('cnpj', cleanCnpj)
            .single();

        if (existingSacado) {
            if (existingSacado.matriz_id && existingSacado.matriz_id !== sacadoData.matriz_id) {
                return NextResponse.json({ message: 'Este CNPJ já está vinculado a outra matriz.' }, { status: 409 });
            }
            
            const { condicoes_pagamento, filiais, ...dataToUpdate } = sacadoData;
            delete dataToUpdate.id;

            const { data: updatedSacado, error: updateError } = await supabase
                .from('sacados')
                .update({ ...dataToUpdate, cnpj: cleanCnpj })
                .eq('id', existingSacado.id)
                .select()
                .single();
                
            if (updateError) throw updateError;
            return NextResponse.json(updatedSacado, { status: 200 });
        }

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
        console.error("Erro ao criar/vincular sacado:", {
            code: error.code,
            message: error.message,
            details: error.details,
        });

        if (error.code === '23505') { 
            return NextResponse.json({ message: 'Já existe um sacado com este CNPJ.' }, { status: 409 });
        }
        return NextResponse.json({ message: error.message || 'Erro interno no servidor.' }, { status: 500 });
    }
}