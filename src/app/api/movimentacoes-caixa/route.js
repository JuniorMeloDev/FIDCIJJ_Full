// src/app/api/movimentacoes-caixa/route.js

import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

export async function GET(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const { searchParams } = new URL(request.url);
        
        // #### CORREÇÃO DEFINITIVA APLICADA AQUI ####
        // Especificamos explicitamente a relação a ser usada para evitar a ambiguidade.
        // A sintaxe `duplicatas!duplicatas_liquidacao_mov_id_fkey` diz ao Supabase para
        // juntar a tabela `duplicatas` usando a chave estrangeira nomeada `duplicatas_liquidacao_mov_id_fkey`.
        let query = supabase.from('movimentacoes_caixa').select(`
            *, 
            operacao:operacoes ( valor_liquido, cliente_id ),
            duplicata:duplicatas!duplicatas_liquidacao_mov_id_fkey ( id, nf_cte )
        `);

        if (searchParams.get('dataInicio')) query = query.gte('data_movimento', searchParams.get('dataInicio'));
        if (searchParams.get('dataFim')) query = query.lte('data_movimento', searchParams.get('dataFim'));
        if (searchParams.get('descricao')) query = query.ilike('descricao', `%${searchParams.get('descricao')}%`);
        if (searchParams.get('conta')) query = query.eq('conta_bancaria', searchParams.get('conta'));
        if (searchParams.get('categoria') && searchParams.get('categoria') !== 'Todos') {
            query = query.eq('categoria', searchParams.get('categoria'));
        }

        const sortKey = searchParams.get('sort') || 'data_movimento';
        const sortDirection = searchParams.get('direction') || 'DESC';
        query = query.order(sortKey, { ascending: sortDirection === 'ASC' });

        const { data, error } = await query;
        if (error) {
            console.error("Erro na consulta do Supabase:", error);
            throw error;
        }

        const formattedData = data.map(m => ({
            ...m,
            dataMovimento: m.data_movimento,
            contaBancaria: m.conta_bancaria,
            empresaAssociada: m.empresa_associada,
            operacaoId: m.operacao_id,
            operacao: m.operacao,
            duplicata: m.duplicata
        }));

        return NextResponse.json(formattedData, { status: 200 });
    } catch (error) {
        console.error("Erro no endpoint de movimentações de caixa:", error.message);
        return NextResponse.json({ message: error.message || 'Erro interno do servidor' }, { status: 500 });
    }
}