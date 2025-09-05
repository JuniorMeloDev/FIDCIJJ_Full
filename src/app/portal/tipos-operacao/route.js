import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

// GET: Busca os tipos de operação PERMITIDOS para o cliente logado
export async function GET(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const clienteId = decoded.cliente_id;
        
        if (!clienteId) {
            return NextResponse.json({ message: 'Usuário cliente sem empresa associada.' }, { status: 403 });
        }

        // Busca os tipos de operação através da tabela de associação
        const { data, error } = await supabase
            .from('cliente_tipos_operacao')
            .select('tipos_operacao(*)')
            .eq('cliente_id', clienteId);

        if (error) throw error;

        // Formata os dados para retornar apenas a lista de tipos de operação
        const tiposOperacao = data.map(item => item.tipos_operacao);

        return NextResponse.json(tiposOperacao, { status: 200 });

    } catch (error) {
        console.error("Erro ao buscar tipos de operação do cliente:", error);
        return NextResponse.json({ message: error.message || 'Erro interno do servidor' }, { status: 500 });
    }
}