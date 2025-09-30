import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

export async function GET(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const { searchParams } = new URL(request.url);

        // 1. A consulta agora busca apenas operações APROVADAS
        let query = supabase
            .from('duplicatas')
            .select(`
                *,
                operacao:operacoes!inner(
                    status,
                    cliente_id,
                    tipo_operacao_id,
                    cliente:clientes ( nome ),
                    tipo_operacao:tipos_operacao ( nome )
                )
            `)
            .eq('operacao.status', 'Aprovada'); // <-- PONTO 1: Filtro de operações aprovadas

        // 2. A ordenação agora é por data e depois por NF/CT-e para agrupar as parcelas
        query = query
            .order('data_operacao', { ascending: true })
            .order('nf_cte', { ascending: true }); // <-- PONTO 2: Ordenação corrigida

        const { data: duplicatas, error } = await query;

        if (error) throw error;

        // Filtros em JavaScript
        const sacadoFilter = searchParams.get('sacado');
        const statusFilter = searchParams.get('status');
        const dataInicio = searchParams.get('dataInicio');
        const dataFim = searchParams.get('dataFim');
        const clienteIdFilter = searchParams.get('clienteId');
        const tipoOperacaoIdFilter = searchParams.get('tipoOperacaoId');

        const filteredData = duplicatas.filter(dup => {
            if (!dup.operacao) return false;
            if (sacadoFilter && !dup.cliente_sacado.toLowerCase().includes(sacadoFilter.toLowerCase())) return false;
            if (statusFilter && statusFilter !== 'Todos' && dup.status_recebimento !== statusFilter) return false;
            if (dataInicio && dup.data_operacao < dataInicio) return false;
            if (dataFim && dup.data_operacao > dataFim) return false;
            if (clienteIdFilter && String(dup.operacao.cliente_id) !== clienteIdFilter) return false;
            if (tipoOperacaoIdFilter && String(dup.operacao.tipo_operacao_id) !== tipoOperacaoIdFilter) return false;
            return true;
        });

        // Formata os dados para o relatório
        let formattedData = filteredData.map(d => ({
            id: d.id,
            data_operacao: d.data_operacao,
            nf_cte: d.nf_cte,
            empresa_cedente: d.operacao?.cliente?.nome,
            cliente_sacado: d.cliente_sacado,
            data_vencimento: d.data_vencimento,
            status_recebimento: d.status_recebimento,
            valor_juros: d.valor_juros || 0,
            juros_mora: d.juros_mora || 0, // <-- PONTO 5: Garantindo que juros de mora sejam incluídos
            valor_bruto: d.valor_bruto,
            // PONTO 3: Identifica uma recompra (liquidada sem entrar em uma conta)
            is_recompra: d.status_recebimento === 'Recebido' && !d.conta_liquidacao,
        }));

        return NextResponse.json(formattedData, { status: 200 });

    } catch (error) {
        console.error('Erro ao gerar relatório de duplicatas:', error);
        return NextResponse.json({ message: error.message || 'Erro interno do servidor' }, { status: 500 });
    }
}