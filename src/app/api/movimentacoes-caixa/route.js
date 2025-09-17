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
        
        // #### CORREÇÃO FINAL APLICADA AQUI ####
        // A sintaxe da junção reversa foi ajustada para ser mais explícita,
        // especificando a coluna da chave estrangeira ('liquidacao_mov_id') na tabela 'duplicatas'.
        // Isso resolve a ambiguidade e garante que o vínculo seja feito corretamente.
        let query = supabase.from('movimentacoes_caixa').select(`
            *, 
            operacao:operacoes ( valor_liquido, cliente_id ),
            duplicata:duplicatas!liquidacao_mov_id ( id, nf_cte )
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
            // A Supabase agora deve retornar o objeto da duplicata corretamente.
            duplicata: m.duplicata
        }));

        return NextResponse.json(formattedData, { status: 200 });
    } catch (error) {
        console.error("Erro no endpoint de movimentações de caixa:", error.message);
        return NextResponse.json({ message: error.message || 'Erro interno do servidor' }, { status: 500 });
    }
}