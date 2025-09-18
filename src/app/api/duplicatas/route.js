import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

export async function GET(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const { searchParams } = new URL(request.url);

        let { data: duplicatas, error } = await supabase
            .from('duplicatas')
            .select(`
                *,
                operacao:operacoes (
                    *,
                    cliente:clientes ( nome )
                ),
                sacado:sacados ( id, nome, uf, matriz_id )
            `)
            .eq('operacao.status', 'Aprovada');

        if (error) throw error;

        const sacadoFilter = searchParams.get('sacado');
        const statusFilter = searchParams.get('status');
        const dataOpInicio = searchParams.get('dataOpInicio');
        const dataOpFim = searchParams.get('dataOpFim');
        const dataVencInicio = searchParams.get('dataVencInicio');
        const dataVencFim = searchParams.get('dataVencFim');
        const nfCteFilter = searchParams.get('nfCte');
        const clienteIdFilter = searchParams.get('clienteId');
        const tipoOperacaoIdFilter = searchParams.get('tipoOperacaoId');

        const filteredData = duplicatas.filter(dup => {
            if (!dup.operacao) return false;
            if (sacadoFilter && !dup.cliente_sacado.toLowerCase().includes(sacadoFilter.toLowerCase())) return false;
            if (statusFilter && statusFilter !== 'Todos' && dup.status_recebimento !== statusFilter) return false;
            if (dataOpInicio && dup.data_operacao < dataOpInicio) return false;
            if (dataOpFim && dup.data_operacao > dataOpFim) return false;
            if (dataVencInicio && dup.data_vencimento < dataVencInicio) return false;
            if (dataVencFim && dup.data_vencimento > dataVencFim) return false;
            if (nfCteFilter && !dup.nf_cte.includes(nfCteFilter)) return false;
            if (clienteIdFilter && String(dup.operacao.cliente_id) !== clienteIdFilter) return false;
            if (tipoOperacaoIdFilter && String(dup.operacao.tipo_operacao_id) !== tipoOperacaoIdFilter) return false;
            return true;
        });
        
        let formattedData = filteredData.map(d => ({
            id: d.id,
            operacaoId: d.operacao_id,
            clienteId: d.operacao?.cliente_id,
            dataOperacao: d.data_operacao,
            nfCte: d.nf_cte,
            empresaCedente: d.operacao?.cliente?.nome || 'N/A',
            valorBruto: d.valor_bruto,
            valorJuros: d.valor_juros,
            clienteSacado: d.cliente_sacado,
            dataVencimento: d.data_vencimento,
            statusRecebimento: d.status_recebimento,
            dataLiquidacao: d.data_liquidacao,
            contaLiquidacao: d.conta_liquidacao,
            sacadoInfo: d.sacado,
            operacao: d.operacao
        }));

        const sortKey = searchParams.get('sort');
        const sortDirection = searchParams.get('direction');

        if (sortKey && sortDirection) {
            formattedData.sort((a, b) => {
                const valA = a[sortKey];
                const valB = b[sortKey];
                if (valA === null || valA === undefined) return 1;
                if (valB === null || valB === undefined) return -1;
                if (valA < valB) return sortDirection === 'ASC' ? -1 : 1;
                if (valA > valB) return sortDirection === 'ASC' ? 1 : -1;
                return 0;
            });
        }

        return NextResponse.json(formattedData, { status: 200 });

    } catch (error) {
        console.error('Erro ao buscar duplicatas:', error);
        return NextResponse.json({ message: error.message || 'Erro interno do servidor' }, { status: 500 });
    }
}