import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

export async function GET(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const { searchParams } = new URL(request.url);

        // Mapeia os nomes do frontend para os nomes das colunas do DB
        const sortMapping = {
            dataOperacao: 'data_operacao',
            nfCte: 'nf_cte',
            'operacao.cliente.nome': 'empresa_cedente',
            clienteSacado: 'cliente_sacado',
            valorBruto: 'valor_bruto',
            valorJuros: 'valor_juros',
            dataVencimento: 'data_vencimento'
        };

        // Pega os parâmetros de ordenação da URL ou usa os padrões
        const sortKey = searchParams.get('sort') || 'dataOperacao';
        const sortColumn = sortMapping[sortKey] || 'data_operacao';
        const sortDirection = searchParams.get('direction') || 'DESC';

        // Monta a chamada para a função RPC, agora incluindo os parâmetros de ordenação
        let query = supabase.rpc('get_vencimentos_proximos', { 
            dias_vencimento: 9999,
            sort_column: sortColumn,
            sort_direction: sortDirection
        });

        // Aplica os outros filtros
        if (searchParams.get('dataOpInicio')) query = query.gte('data_operacao', searchParams.get('dataOpInicio'));
        if (searchParams.get('dataOpFim')) query = query.lte('data_operacao', searchParams.get('dataOpFim'));
        // ... (outros filtros continuam iguais)
        if (searchParams.get('status') && searchParams.get('status') !== 'Todos') query = query.eq('status_recebimento', searchParams.get('status'));

        const { data, error } = await query;
        if (error) throw error;

        // Mapeia os nomes das colunas para o que o frontend espera (camelCase)
        const formattedData = data.map(d => ({
            id: d.id,
            operacaoId: d.operacao_id,
            clienteId: d.cliente_id,
            dataOperacao: d.data_operacao,
            nfCte: d.nf_cte,
            empresaCedente: d.empresa_cedente,
            valorBruto: d.valor_bruto,
            valorJuros: d.valor_juros,
            clienteSacado: d.cliente_sacado,
            dataVencimento: d.data_vencimento,
            tipoOperacaoNome: d.tipo_operacao_nome,
            statusRecebimento: d.status_recebimento,
            dataLiquidacao: d.data_liquidacao,
            contaLiquidacao: d.conta_liquidacao
        }));

        return NextResponse.json(formattedData, { status: 200 });

    } catch (error) {
        console.error('Erro ao buscar duplicatas:', error);
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}