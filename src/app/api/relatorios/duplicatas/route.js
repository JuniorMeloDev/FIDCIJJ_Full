import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

export async function GET(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const { searchParams } = new URL(request.url);

        // 1. A consulta agora inclui mais dados da operação para a lógica de juros
        let query = supabase
            .from('duplicatas')
            .select(`
                *,
                operacao:operacoes!inner(
                    status, cliente_id, tipo_operacao_id, valor_total_juros,
                    cliente:clientes ( nome ),
                    tipo_operacao:tipos_operacao ( nome )
                )
            `)
            .eq('operacao.status', 'Aprovada'); // PONTO 1: Filtra apenas operações aprovadas

        // 2. Ordenação corrigida para agrupar parcelas da mesma nota
        query = query
            .order('data_operacao', { ascending: true })
            .order('nf_cte', { ascending: true });

        const { data: duplicatas, error } = await query;
        if (error) throw error;

        // Filtros em JavaScript (sem alteração)
        const sacadoFilter = searchParams.get('sacado');
        const statusFilter = searchParams.get('status');
        const dataInicio = searchParams.get('dataInicio');
        const dataFim = searchParams.get('dataFim');
        const clienteIdFilter = searchParams.get('clienteId');
        const tipoOperacaoIdFilter = searchParams.get('tipoOperacaoId');

        const filteredData = duplicatas.filter(dup => {
            if (!dup.operacao) return false;
            if (sacadoFilter && !dup.cliente_sacado.toLowerCase().includes(sacadoFilter.toLowerCase())) return false;
            
            if (statusFilter && statusFilter !== 'Todos') {
                const isRecomprado = dup.status_recebimento === 'Recebido' && !dup.conta_liquidacao;
                const statusAtual = isRecomprado ? 'Recomprado' : dup.status_recebimento;
                if (statusFilter === 'Recebido' && statusAtual !== 'Recebido' && statusAtual !== 'Recomprado') return false;
                if (statusFilter === 'Pendente' && statusAtual !== 'Pendente') return false;
            }

            if (dataInicio && dup.data_operacao < dataInicio) return false;
            if (dataFim && dup.data_operacao > dataFim) return false;
            if (clienteIdFilter && String(dup.operacao.cliente_id) !== clienteIdFilter) return false;
            if (tipoOperacaoIdFilter && String(dup.operacao.tipo_operacao_id) !== tipoOperacaoIdFilter) return false;
            return true;
        });

        // 3. Lógica para formatar os dados e separar os tipos de juros
        let formattedData = filteredData.map(d => {
            let jurosOperacao = d.valor_juros || 0;
            let jurosMora = d.juros_mora || 0;
            
            // PONTO 2 (Juros Pós-Fixado): Se os juros da operação foram ZERO e o campo 'juros_mora' tem valor,
            // isso indica que é uma operação de juros pós-fixado.
            if (d.operacao.valor_total_juros < 0.01 && jurosMora > 0) {
                // Movemos o valor do campo 'juros_mora' para 'jurosOperacao' e zeramos 'jurosMora'
                jurosOperacao = jurosMora;
                jurosMora = 0;
            }

            return {
                id: d.id,
                data_operacao: d.data_operacao,
                nf_cte: d.nf_cte,
                empresa_cedente: d.operacao?.cliente?.nome,
                cliente_sacado: d.cliente_sacado,
                data_vencimento: d.data_vencimento,
                status_recebimento: d.status_recebimento,
                data_liquidacao: d.data_liquidacao,
                valor_juros: jurosOperacao,
                juros_mora: jurosMora, // Agora este campo só terá juros de mora reais
                valor_bruto: d.valor_bruto,
                // PONTO 3 (Recompra): A lógica para identificar recompra continua segura
                is_recompra: d.status_recebimento === 'Recebido' && !d.conta_liquidacao,
            };
        });

        return NextResponse.json(formattedData, { status: 200 });

    } catch (error) {
        console.error('Erro ao gerar relatório de duplicatas:', error);
        return NextResponse.json({ message: error.message || 'Erro interno do servidor' }, { status: 500 });
    }
}