import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

export async function GET(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const { searchParams } = new URL(request.url);

        // 1. PEGA OS FILTROS DA URL
        const statusFilter = searchParams.get('status'); // 'Pendente', 'Recebido' ou 'todos'
        const sacadoFilter = searchParams.get('sacado');
        const dataInicio = searchParams.get('dataInicio');
        const dataFim = searchParams.get('dataFim');
        const clienteIdFilter = searchParams.get('clienteId');
        const tipoOperacaoIdFilter = searchParams.get('tipoOperacaoId');

        // 2. CONSTRÓI A CONSULTA BASE DO SUPABASE
        let query = supabase
            .from('duplicatas')
            .select(`
                *,
                operacao:operacoes!inner (
                    cliente_id,
                    tipo_operacao_id,
                    status,
                    cliente:clientes ( nome ),
                    tipo_operacao:tipos_operacao ( nome )
                )
            `)
            // --- CORREÇÃO AQUI ---
            // Adiciona o filtro BASE para trazer apenas duplicatas de OPERAÇÕES APROVADAS
            .eq('operacao.status', 'Aprovada'); 
            // ---------------------------------

        // 3. APLICA OS FILTROS DA URL
        
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
         if (clienteIdFilter) {
            query = query.eq('operacao.cliente_id', clienteIdFilter);
        }
        if (tipoOperacaoIdFilter) {
            query = query.eq('operacao.tipo_operacao_id', tipoOperacaoIdFilter);
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