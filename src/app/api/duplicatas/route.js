import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

export async function GET(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const { searchParams } = new URL(request.url);

        // Inicia a consulta na tabela 'operacoes' para facilitar os filtros principais
        let query = supabase
            .from('operacoes')
            .select(`
                id, cliente_id, tipo_operacao_id,
                cliente:clientes ( nome ),
                tipo_operacao:tipos_operacao ( nome ),
                duplicatas!inner (
                    id, data_operacao, nf_cte, valor_bruto, valor_juros,
                    cliente_sacado, data_vencimento, status_recebimento
                )
            `);

        // Aplica os filtros da URL
        if (searchParams.get('dataInicio')) query = query.gte('data_operacao', searchParams.get('dataInicio'));
        if (searchParams.get('dataFim')) query = query.lte('data_operacao', searchParams.get('dataFim'));
        if (searchParams.get('clienteId')) query = query.eq('cliente_id', searchParams.get('clienteId'));
        if (searchParams.get('tipoOperacaoId')) query = query.eq('tipo_operacao_id', searchParams.get('tipoOperacaoId'));

        const { data: operacoes, error } = await query;
        if (error) throw error;

        // Transforma a estrutura numa lista simples de duplicatas
        let duplicatas = operacoes.flatMap(op => 
            op.duplicatas.map(dup => ({
                ...dup,
                empresa_cedente: op.cliente?.nome,
                tipo_operacao_nome: op.tipo_operacao?.nome,
            }))
        );

        // Aplica os filtros restantes em JavaScript
        const sacadoFilter = searchParams.get('sacado');
        const statusFilter = searchParams.get('status');

        duplicatas = duplicatas.filter(dup => {
            if (sacadoFilter && !dup.cliente_sacado.toLowerCase().includes(sacadoFilter.toLowerCase())) return false;
            if (statusFilter && statusFilter !== 'Todos' && dup.status_recebimento !== statusFilter) return false;
            return true;
        });

        // Lógica de deduplicação em JavaScript para garantir
        const uniqueData = Array.from(new Map(duplicatas.map(item => [
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