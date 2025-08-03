import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

// GET: Busca e filtra as duplicatas
export async function GET(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const { searchParams } = new URL(request.url);

        // Monta a consulta base
        let query = supabase.rpc('get_vencimentos_proximos', { dias_vencimento: 9999 }); // Usamos a função com um valor alto para buscar todos

        // Aplica os filtros da URL
        if (searchParams.get('dataOpInicio')) query = query.gte('data_operacao', searchParams.get('dataOpInicio'));
        if (searchParams.get('dataOpFim')) query = query.lte('data_operacao', searchParams.get('dataOpFim'));
        if (searchParams.get('dataVencInicio')) query = query.gte('data_vencimento', searchParams.get('dataVencInicio'));
        if (searchParams.get('dataVencFim')) query = query.lte('data_vencimento', searchParams.get('dataVencFim'));
        if (searchParams.get('sacado')) query = query.ilike('cliente_sacado', `%${searchParams.get('sacado')}%`);
        if (searchParams.get('nfCte')) query = query.ilike('nf_cte', `%${searchParams.get('nfCte')}%`);
        if (searchParams.get('status') && searchParams.get('status') !== 'Todos') query = query.eq('status_recebimento', searchParams.get('status'));
        if (searchParams.get('clienteId')) query = query.eq('cliente_id', searchParams.get('clienteId'));
        if (searchParams.get('tipoOperacaoId')) query = query.eq('tipo_operacao_id', searchParams.get('tipoOperacaoId'));

        // Ordenação
        const sortKey = searchParams.get('sort') || 'data_operacao';
        const sortDirection = searchParams.get('direction') || 'DESC';
        query = query.order(sortKey, { ascending: sortDirection === 'ASC' });

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