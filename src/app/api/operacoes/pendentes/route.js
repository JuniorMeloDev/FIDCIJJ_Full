import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

// GET: Busca operações com status 'Pendente' para análise do admin
export async function GET(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userRoles = decoded.roles || [];

        if (!userRoles.includes('ROLE_ADMIN')) {
            return NextResponse.json({ message: 'Acesso negado' }, { status: 403 });
        }

        // CORREÇÃO: A junção com a tabela de clientes foi tornada obrigatória (!inner)
        // para garantir a integridade dos dados e evitar erros na consulta.
        const { data, error } = await supabase
            .from('operacoes')
            .select(`
                *,
                cliente:clientes!inner( nome ),
                duplicatas ( * )
            `)
            .eq('status', 'Pendente') // O filtro principal acontece aqui
            .order('data_operacao', { ascending: true });

        if (error) {
            console.error("Erro ao buscar operações pendentes:", error);
            throw error;
        }

        return NextResponse.json(data, { status: 200 });

    } catch (error) {
        return NextResponse.json({ message: error.message || 'Erro interno do servidor' }, { status: 500 });
    }
}