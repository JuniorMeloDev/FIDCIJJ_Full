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
        
        // --- CORREÇÃO AQUI: Junção reversa opcional com a tabela de duplicatas. ---
        // Isso busca a duplicata correspondente APENAS para os lançamentos que a possuem.
        let query = supabase.from('movimentacoes_caixa').select(`
            *, 
            operacao:operacoes ( valor_liquido, cliente_id ),
            duplicata:duplicatas!liquidacao_mov_id ( id, nf_cte )
        `);

        // ... (filtros permanecem iguais) ...
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
        if (error) throw error;

        // --- ALTERAÇÃO NO FORMATO DOS DADOS ---
        const formattedData = data.map(m => ({
            ...m,
            dataMovimento: m.data_movimento,
            contaBancaria: m.conta_bancaria,
            empresaAssociada: m.empresa_associada,
            operacaoId: m.operacao_id,
            operacao: m.operacao,
            // A Supabase retorna a duplicata como um objeto único (ou null), que é o que precisamos.
            duplicata: m.duplicata 
        }));

        return NextResponse.json(formattedData, { status: 200 });
    } catch (error) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}