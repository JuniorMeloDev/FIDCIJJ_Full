import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

export async function GET(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userRoles = decoded.roles || [];
        if (!userRoles.includes('ROLE_CLIENTE')) {
            return NextResponse.json({ message: 'Acesso negado' }, { status: 403 });
        }

        const clienteId = decoded.cliente_id;
        if (!clienteId) {
            return NextResponse.json({ message: 'Usuário cliente sem empresa associada.' }, { status: 403 });
        }

        // Busca todas as duplicatas pertencentes às operações do cliente logado
        const { data, error } = await supabase
            .from('duplicatas')
            .select(`
                *,
                operacao:operacoes!inner(cliente_id)
            `)
            .eq('operacao.cliente_id', clienteId)
            .order('data_vencimento', { ascending: true });

        if (error) throw error;

        return NextResponse.json(data, { status: 200 });

    } catch (error) {
        console.error("Erro ao buscar duplicatas do cliente:", error);
        return NextResponse.json({ message: error.message || 'Erro interno do servidor' }, { status: 500 });
    }
}