import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

export async function GET(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const { searchParams } = new URL(request.url);

        // Pega o tipo de operação da URL
        const tipoOperacaoId = searchParams.get('tipoOperacaoId') || null;

        // Monta a chamada para a função, agora passando o tipo de operação
        let query = supabase.rpc('get_duplicatas_filtradas', { 
            p_tipo_operacao_id: tipoOperacaoId,
            sort_column: 'data_operacao',
            sort_direction: 'ASC'
        });

        // Aplica os outros filtros
        if (searchParams.get('dataInicio')) query = query.gte('data_operacao', searchParams.get('dataInicio'));
        if (searchParams.get('dataFim')) query = query.lte('data_operacao', searchParams.get('dataFim'));
        if (searchParams.get('clienteId')) query = query.eq('cliente_id', searchParams.get('clienteId'));
        if (searchParams.get('sacado')) query = query.ilike('cliente_sacado', `%${searchParams.get('sacado')}%`);
        if (search_params.get('status') && search_params.get('status') !== 'Todos') query = query.eq('status_recebimento', search_params.get('status'));

        const { data, error } = await query;
        if (error) throw error;
        return NextResponse.json(data, { status: 200 });
    } catch (error) {
        console.error("Erro na API de relatório de duplicatas:", error);
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            return NextResponse.json({ message: 'Token inválido ou expirado' }, { status: 403 });
        }
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}