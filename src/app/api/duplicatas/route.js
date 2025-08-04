import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

export async function GET(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const { searchParams } = new URL(request.url);

        // Inicia a consulta diretamente na tabela 'duplicatas'
        let query = supabase
            .from('duplicatas')
            .select(`
                id, operacao_id, data_operacao, nf_cte, valor_bruto, valor_juros,
                cliente_sacado, data_vencimento, status_recebimento,
                operacao:operacoes (
                    cliente_id,
                    cliente:clientes ( nome ),
                    tipo_operacao:tipos_operacao ( nome )
                ),
                movimentacao:movimentacoes_caixa ( data_movimento, conta_bancaria )
            `);

        // Aplica os filtros
        if (searchParams.get('dataOpInicio')) query = query.gte('data_operacao', searchParams.get('dataOpInicio'));
        if (searchParams.get('dataOpFim')) query = query.lte('data_operacao', searchParams.get('dataOpFim'));
        if (searchParams.get('dataVencInicio')) query = query.gte('data_vencimento', searchParams.get('dataVencInicio'));
        if (searchParams.get('dataVencFim')) query = query.lte('data_vencimento', searchParams.get('dataVencFim'));
        if (searchParams.get('sacado')) query = query.ilike('cliente_sacado', `%${searchParams.get('sacado')}%`);
        if (searchParams.get('nfCte')) query = query.ilike('nf_cte', `%${searchParams.get('nfCte')}%`);
        if (searchParams.get('status') && searchParams.get('status') !== 'Todos') query = query.eq('status_recebimento', searchParams.get('status'));
        if (searchParams.get('clienteId')) query = query.eq('operacoes.cliente_id', searchParams.get('clienteId'));
        if (search_params.get('tipoOperacaoId')) query = query.eq('operacoes.tipo_operacao_id', search_params.get('tipoOperacaoId'));

        // Aplica a ordenação
        const sortKey = searchParams.get('sort') || 'dataOperacao';
        const sortDirection = searchParams.get('direction') || 'DESC';

        const sortColumnMapping = {
            dataOperacao: 'data_operacao',
            nfCte: 'nf_cte',
            empresaCedente: 'operacoes(clientes(nome))',
            clienteSacado: 'cliente_sacado',
            valorBruto: 'valor_bruto',
            valorJuros: 'valor_juros',
            dataVencimento: 'data_vencimento'
        };
        const dbColumn = sortColumnMapping[sortKey] || 'data_operacao';

        query = query.order(dbColumn, { ascending: sortDirection === 'ASC' });


        const { data, error } = await query;
        if (error) throw error;

        // Mapeia os dados para o formato que o frontend espera (camelCase)
        const formattedData = data.map(d => ({
            id: d.id,
            operacaoId: d.operacao_id,
            clienteId: d.operacao?.cliente_id,
            dataOperacao: d.data_operacao,
            nfCte: d.nf_cte,
            empresaCedente: d.operacao?.cliente?.nome,
            valorBruto: d.valor_bruto,
            valorJuros: d.valor_juros,
            clienteSacado: d.cliente_sacado,
            dataVencimento: d.data_vencimento,
            tipoOperacaoNome: d.operacao?.tipo_operacao?.nome,
            statusRecebimento: d.status_recebimento,
            dataLiquidacao: d.movimentacao?.data_movimento,
            contaLiquidacao: d.movimentacao?.conta_bancaria
        }));

        // Lógica de deduplicação em JavaScript para garantir
        const uniqueData = Array.from(new Map(formattedData.map(item => [item.id, item])).values());

        return NextResponse.json(uniqueData, { status: 200 });

    } catch (error) {
        console.error('Erro ao buscar duplicatas:', error);
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}