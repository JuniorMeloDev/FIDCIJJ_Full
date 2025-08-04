import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

export async function GET(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const { searchParams } = new URL(request.url);

        // Inicia a consulta diretamente na tabela 'operacoes' para facilitar os filtros
        let query = supabase
            .from('operacoes')
            .select(`
                id, cliente_id, tipo_operacao_id,
                cliente:clientes ( nome ),
                tipo_operacao:tipos_operacao ( nome ),
                duplicatas (
                    id, data_operacao, nf_cte, valor_bruto, valor_juros,
                    cliente_sacado, data_vencimento, status_recebimento,
                    movimentacao:movimentacoes_caixa ( data_movimento, conta_bancaria )
                )
            `);

        // Aplica os filtros
        if (searchParams.get('dataOpInicio')) query = query.gte('data_operacao', searchParams.get('dataOpInicio'));
        if (searchParams.get('dataOpFim')) query = query.lte('data_operacao', searchParams.get('dataOpFim'));
        if (searchParams.get('clienteId')) query = query.eq('cliente_id', searchParams.get('clienteId'));
        if (searchParams.get('tipoOperacaoId')) query = query.eq('tipo_operacao_id', searchParams.get('tipoOperacaoId'));

        // Filtros que precisam de ser aplicados nos dados após a busca
        const sacadoFilter = searchParams.get('sacado');
        const statusFilter = searchParams.get('status');
        const dataVencInicio = searchParams.get('dataVencInicio');
        const dataVencFim = searchParams.get('dataVencFim');
        const nfCteFilter = searchParams.get('nfCte');

        const { data: operacoes, error } = await query;
        if (error) throw error;

        // Transforma a estrutura e aplica os filtros restantes
        let duplicatas = operacoes.flatMap(op => 
            op.duplicatas.map(dup => ({
                ...dup,
                operacaoId: op.id,
                clienteId: op.cliente_id,
                empresaCedente: op.cliente?.nome,
                tipoOperacaoNome: op.tipo_operacao?.nome,
                dataLiquidacao: dup.movimentacao?.data_movimento,
                contaLiquidacao: dup.movimentacao?.conta_bancaria,
            }))
        ).filter(dup => {
            if (sacadoFilter && !dup.clienteSacado.toLowerCase().includes(sacadoFilter.toLowerCase())) return false;
            if (statusFilter && statusFilter !== 'Todos' && dup.statusRecebimento !== statusFilter) return false;
            if (dataVencInicio && dup.dataVencimento < dataVencInicio) return false;
            if (dataVencFim && dup.dataVencimento > dataVencFim) return false;
            if (nfCteFilter && !dup.nfCte.includes(nfCteFilter)) return false;
            return true;
        });

        // Lógica de ordenação em JavaScript
        const sortKey = searchParams.get('sort');
        const sortDirection = searchParams.get('direction');

        if (sortKey && sortDirection) {
            duplicatas.sort((a, b) => {
                const valA = a[sortKey];
                const valB = b[sortKey];
                if (valA === null) return 1; if (valB === null) return -1;
                if (valA < valB) return sortDirection === 'ASC' ? -1 : 1;
                if (valA > valB) return sortDirection === 'ASC' ? 1 : -1;
                return 0;
            });
        }

        return NextResponse.json(duplicatas, { status: 200 });

    } catch (error) {
        console.error('Erro ao buscar duplicatas:', error);
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}