import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

export async function GET(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const { searchParams } = new URL(request.url);
        
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

        if (searchParams.get('dataInicio')) query = query.gte('data_movimento', searchParams.get('dataInicio'));
        if (searchParams.get('dataFim')) query = query.lte('data_movimento', searchParams.get('dataFim'));
        if (searchParams.get('descricao')) query = query.ilike('descricao', `%${searchParams.get('descricao')}%`);
        if (searchParams.get('conta')) query = query.eq('conta_bancaria', searchParams.get('conta'));
        if (searchParams.get('categoria') && searchParams.get('categoria') !== 'Todos') {
            query = query.eq('categoria', searchParams.get('categoria'));
        }

        // --- LÓGICA DE ORDENAÇÃO CORRIGIDA ---
        const sortKey = searchParams.get('sort') || 'data_movimento';
        const sortDirection = searchParams.get('direction') || 'DESC';
        const isAscending = sortDirection === 'ASC';

        // 1. Ordena pela coluna principal escolhida pelo usuário (ex: data_movimento)
        query = query.order(sortKey, { ascending: isAscending });
        
        // 2. Adiciona uma segunda ordenação pelo ID para garantir uma ordem estável e previsível
        query = query.order('id', { ascending: isAscending });
        // --- FIM DA CORREÇÃO ---


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