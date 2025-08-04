import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

export async function GET(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });

        // Valida o token com tratamento de erro
        try {
            jwt.verify(token, process.env.JWT_SECRET);
        } catch (err) {
            return NextResponse.json({ message: 'Token inválido' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);

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

        // Filtros
        if (searchParams.get('dataOpInicio')) query = query.gte('data_operacao', searchParams.get('dataOpInicio'));
        if (searchParams.get('dataOpFim')) query = query.lte('data_operacao', searchParams.get('dataOpFim'));
        if (searchParams.get('dataVencInicio')) query = query.gte('data_vencimento', searchParams.get('dataVencInicio'));
        if (searchParams.get('dataVencFim')) query = query.lte('data_vencimento', searchParams.get('dataVencFim'));
        if (searchParams.get('sacado')) query = query.ilike('cliente_sacado', `%${searchParams.get('sacado')}%`);
        if (searchParams.get('nfCte')) query = query.ilike('nf_cte', `%${searchParams.get('nfCte')}%`);
        if (searchParams.get('status') && searchParams.get('status') !== 'Todos') query = query.eq('status_recebimento', searchParams.get('status'));
        if (searchParams.get('clienteId')) query = query.eq('operacoes.cliente_id', searchParams.get('clienteId'));
        if (searchParams.get('tipoOperacaoId')) query = query.eq('operacoes.tipo_operacao_id', searchParams.get('tipoOperacaoId'));

        // Ordenação segura
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

        // Valida sortKey antes de aplicar
        const allowedSorts = Object.keys(sortColumnMapping);
        if (!allowedSorts.includes(sortKey)) {
            return NextResponse.json({ message: 'Parâmetro sort inválido' }, { status: 400 });
        }

        const dbColumn = sortColumnMapping[sortKey];
        query = query.order(dbColumn, { ascending: sortDirection === 'ASC' });

        const { data, error } = await query;
        if (error) throw error;

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

        const uniqueData = Array.from(new Map(formattedData.map(item => [item.id, item])).values());

        return NextResponse.json(uniqueData, { status: 200 });

    } catch (error) {
        console.error('Erro ao buscar duplicatas:', error);
        return NextResponse.json({ message: error.message || 'Erro interno do servidor' }, { status: 500 });
    }
}
