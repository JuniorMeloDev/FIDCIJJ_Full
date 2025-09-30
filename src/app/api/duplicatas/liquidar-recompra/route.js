// src/app/api/duplicatas/liquidar-recompra/route.js
import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

export async function POST(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const { duplicataIds, dataLiquidacao } = await request.json();

        if (!duplicataIds || !Array.isArray(duplicataIds) || duplicataIds.length === 0) {
            return NextResponse.json({ message: 'Nenhum ID de duplicata fornecido.' }, { status: 400 });
        }

        const { error } = await supabase
            .from('duplicatas')
            .update({ 
                status_recebimento: 'Recebido', // Ou um novo status 'Recomprado'
                data_liquidacao: dataLiquidacao,
                // Importante: Não mexemos na conta de liquidação para não gerar fluxo de caixa
            })
            .in('id', duplicataIds);
        
        if (error) throw error;

        return NextResponse.json({ message: 'Duplicatas de recompra baixadas com sucesso.' }, { status: 200 });

    } catch (error) {
        console.error('Erro ao baixar duplicatas de recompra:', error);
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}