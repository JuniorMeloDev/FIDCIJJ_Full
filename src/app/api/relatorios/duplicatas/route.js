import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

export async function GET(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userRoles = decoded.roles || [];
        const userClienteId = decoded.cliente_id;

        const { searchParams } = new URL(request.url);

        // 1. PEGA OS FILTROS DA URL
        const statusFilter = searchParams.get('status'); // 'Pendente', 'Recebido' ou 'todos'
        const sacadoFilter = searchParams.get('sacado');
        const dataInicio = searchParams.get('dataInicio');
        const dataFim = searchParams.get('dataFim');
        const clienteIdFilter = searchParams.get('clienteId');
        const tipoOperacaoIdFilter = searchParams.getAll('tipoOperacaoId');

        // 2. CONSTRÓI A CONSULTA BASE DO SUPABASE
        let query = supabase
            .from('duplicatas')
            .select(`
                *,
                operacao:operacoes!inner (
                    cliente_id,
                    tipo_operacao_id,
                    valor_total_bruto,
                    valor_liquido,
                    valor_total_juros,
                    valor_total_descontos,
                    status,
                    cliente:clientes ( nome ),
                    tipo_operacao:tipos_operacao ( nome )
                )
            `)
            .eq('operacao.status', 'Aprovada'); 

        // 3. APLICA OS FILTROS DA URL AND AUTH
        
        // --- SEGURANÇA: FILTRO POR CLIENTE (ROLE_CLIENTE) ---
        if (userRoles.includes('ROLE_CLIENTE')) {
            if (userClienteId) {
                query = query.eq('operacao.cliente_id', userClienteId);
            } else {
                // Se tem role de cliente mas não tem ID, não deve ver nada (segurança)
                return NextResponse.json([], { status: 200 }); 
            }
        } else if (clienteIdFilter) {
            // Se não é cliente (admin), pode usar o filtro da URL
            query = query.eq('operacao.cliente_id', clienteIdFilter);
        }
        // ----------------------------------------------------

        // Filtro de status da DUPLICATA (Pendente, Recebido, etc.)
        if (statusFilter && statusFilter !== 'todos') { 
            query = query.eq('status_recebimento', statusFilter);
        }

        // Outros filtros
        if (sacadoFilter) {
            query = query.ilike('cliente_sacado', `%${sacadoFilter}%`);
        }
        if (dataInicio) {
            query = query.gte('data_operacao', dataInicio);
        }
        if (dataFim) {
            query = query.lte('data_operacao', dataFim);
        }
        if (tipoOperacaoIdFilter && tipoOperacaoIdFilter.length > 0) {
            query = query.in('operacao.tipo_operacao_id', tipoOperacaoIdFilter);
        }

        // Adiciona ordenação
        query = query.order('data_operacao', { ascending: true });

        // 4. EXECUTA A CONSULTA
        let { data: duplicatas, error } = await query;

        if (error) throw error;
        
        // 5. FORMATA OS DADOS (A filtragem extra de JS não é mais necessária)
        let formattedData = duplicatas.map(d => ({
            id: d.id,
            operacao_id: d.operacao_id,
            cliente_id: d.operacao?.cliente_id,
            data_operacao: d.data_operacao,
            nf_cte: d.nf_cte,
            empresa_cedente: d.operacao?.cliente?.nome,
            valor_bruto: d.valor_bruto,
            valor_juros: d.valor_juros,
            cliente_sacado: d.cliente_sacado,
            data_vencimento: d.data_vencimento,
            tipo_operacao_nome: d.operacao?.tipo_operacao?.nome,
            status_recebimento: d.status_recebimento,
            operacao_valor_total_bruto: d.operacao?.valor_total_bruto,
            operacao_valor_liquido: d.operacao?.valor_liquido,
            operacao_valor_total_juros: d.operacao?.valor_total_juros,
            operacao_valor_total_descontos: d.operacao?.valor_total_descontos,
        }));

        // 6. LÓGICA DE DEDUPLICAÇÃO FINAL
        const uniqueData = Array.from(new Map(formattedData.map(item => [
            `${item.data_operacao}-${item.nf_cte}-${item.valor_bruto}`, item
        ])).values());

        return NextResponse.json(uniqueData, { status: 200 });

    } catch (error) {
        console.error('Erro ao gerar relatório de duplicatas:', error);
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            return NextResponse.json({ message: 'Token inválido ou expirado' }, { status: 403 });
        }
        return NextResponse.json({ message: error.message || 'Erro interno do servidor' }, { status: 500 });
    }
}
