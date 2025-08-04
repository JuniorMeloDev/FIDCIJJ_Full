import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

export async function GET(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const { searchParams } = new URL(request.url);

        // Parâmetros de filtro
        const rpcParams = {
            p_data_inicio: searchParams.get('dataInicio') || null,
            p_data_fim: searchParams.get('dataFim') || null,
            p_cliente_id: searchParams.get('clienteId') || null,
            p_sacado: searchParams.get('sacado') || null,
            p_status: searchParams.get('status') || null,
            p_tipo_operacao_id: searchParams.get('tipoOperacaoId') || null,
        };

        const { data, error } = await supabase.rpc('get_duplicatas_filtradas', rpcParams);

        if (error) throw error;

        // --- LÓGICA DE ORDENAÇÃO CORRIGIDA AQUI ---
        const sortKey = searchParams.get('sort'); // Ex: 'dataOperacao'
        const sortDirection = searchParams.get('direction'); // Ex: 'DESC'

        // Mapeia os nomes do frontend para os nomes das colunas do DB
        const sortColumnMapping = {
            dataOperacao: 'data_operacao',
            nfCte: 'nf_cte',
            empresaCedente: 'empresa_cedente',
            clienteSacado: 'cliente_sacado',
            valorBruto: 'valor_bruto',
            valorJuros: 'valor_juros',
            dataVencimento: 'data_vencimento'
        };

        if (sortKey && sortDirection) {
            const dbColumn = sortColumnMapping[sortKey] || 'data_operacao';

            data.sort((a, b) => {
                const valA = a[dbColumn];
                const valB = b[dbColumn];

                if (valA < valB) return sortDirection === 'ASC' ? -1 : 1;
                if (valA > valB) return sortDirection === 'ASC' ? 1 : -1;
                return 0;
            });
        }

        // Mapeia os nomes das colunas para o que o frontend espera (camelCase)
        const formattedData = data.map(d => ({
            id: d.id, operacaoId: d.operacao_id, clienteId: d.cliente_id,
            dataOperacao: d.data_operacao, nfCte: d.nf_cte, empresaCedente: d.empresa_cedente,
            valorBruto: d.valor_bruto, valorJuros: d.valor_juros, clienteSacado: d.cliente_sacado,
            dataVencimento: d.data_vencimento, tipoOperacaoNome: d.tipo_operacao_nome,
            statusRecebimento: d.status_recebimento, dataLiquidacao: d.data_liquidacao,
            contaLiquidacao: d.conta_liquidacao
        }));

        return NextResponse.json(formattedData, { status: 200 });

    } catch (error) {
        console.error('Erro ao buscar duplicatas:', error);
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}