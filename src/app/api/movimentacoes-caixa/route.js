// type: uploaded file
// fileName: app/api/movimentacoes-caixa/route.js

import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

export async function GET(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const { searchParams } = new URL(request.url);
        
        // --- 1. Consulta Principal (Movimentações) ---
        let query = supabase.from('movimentacoes_caixa').select(`
            *, 
            operacao:operacoes ( 
                valor_liquido, 
                cliente:clientes ( 
                    id, nome, cnpj, 
                    contas_bancarias ( banco, chave_pix, tipo_chave_pix )
                ) 
            ),
            duplicata:duplicatas!liquidacao_mov_id ( id, nf_cte )
        `);

        const dataInicio = searchParams.get('dataInicio');
        const dataFim = searchParams.get('dataFim');
        const conta = searchParams.get('conta');

        if (dataInicio) query = query.gte('data_movimento', dataInicio);
        if (dataFim) query = query.lte('data_movimento', dataFim);
        if (searchParams.get('descricao')) query = query.ilike('descricao', `%${searchParams.get('descricao')}%`);
        if (conta) query = query.eq('conta_bancaria', conta);
        if (searchParams.get('categoria') && searchParams.get('categoria') !== 'Todos') {
            query = query.eq('categoria', searchParams.get('categoria'));
        }

        const sortKey = searchParams.get('sort') || 'data_movimento';
        const sortDirection = searchParams.get('direction') || 'DESC';
        const isAscending = sortDirection === 'ASC';

        query = query.order(sortKey, { ascending: isAscending });
        query = query.order('id', { ascending: isAscending });

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

        // --- 2. Cálculo do Saldo Anterior ---
        // Soma tudo que veio ANTES da data de início para compor o saldo inicial do extrato
        let saldoAnterior = 0;
        if (dataInicio) {
            let saldoQuery = supabase.from('movimentacoes_caixa').select('valor');
            
            // O saldo anterior deve respeitar a conta selecionada, mas NÃO os outros filtros (descrição/categoria),
            // para que represente o saldo real disponível na conta.
            saldoQuery = saldoQuery.lt('data_movimento', dataInicio);
            
            if (conta) {
                saldoQuery = saldoQuery.eq('conta_bancaria', conta);
            }

            const { data: saldoData, error: saldoError } = await saldoQuery;
            
            if (!saldoError && saldoData) {
                saldoAnterior = saldoData.reduce((acc, cur) => acc + (cur.valor || 0), 0);
            }
        }

        // Retorna objeto com dados e o saldo inicial
        return NextResponse.json({ 
            data: formattedData, 
            saldoAnterior: saldoAnterior 
        }, { status: 200 });

    } catch (error) {
        console.error("Erro no endpoint de movimentações de caixa:", error.message);
        return NextResponse.json({ message: error.message || 'Erro interno do servidor' }, { status: 500 });
    }
}