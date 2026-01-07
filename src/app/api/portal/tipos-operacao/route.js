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
        
        const { searchParams } = new URL(request.url);
        const source = searchParams.get('source'); // 'all' para buscar todos (para relatórios)

        if (!clienteId) {
            return NextResponse.json({ message: 'Usuário cliente sem empresa associada.' }, { status: 403 });
        }

        let tiposOperacao = [];

        if (source === 'all') {
            // Busca TODOS os tipos de operação (para filtros de relatório)
            const { data, error } = await supabase
                .from('tipos_operacao')
                .select('*');
            
            if (error) throw error;
            tiposOperacao = data;
        } else if (source === 'used') {
            // Busca apenas os tipos de operação que o cliente JÁ UTILIZOU (tem histórico)
            // 1. Busca IDs únicos das operações do cliente
            const { data: ops, error: opsError } = await supabase
                .from('operacoes')
                .select('tipo_operacao_id')
                .eq('cliente_id', clienteId);
            
            if (opsError) throw opsError;

            // Extrai IDs únicos
            const uniqueTypeIds = [...new Set(ops.map(op => op.tipo_operacao_id))];

            if (uniqueTypeIds.length > 0) {
                 // 2. Busca os detalhes dos tipos
                const { data, error } = await supabase
                    .from('tipos_operacao')
                    .select('*')
                    .in('id', uniqueTypeIds);

                if (error) throw error;
                tiposOperacao = data;
            } else {
                tiposOperacao = [];
            }

        } else {
            // Busca apenas os tipos PERMITIDOS para o cliente (para novas operações)
            const { data, error } = await supabase
                .from('cliente_tipos_operacao')
                .select('tipos_operacao(*)')
                .eq('cliente_id', clienteId);

            if (error) throw error;
            tiposOperacao = data.map(item => item.tipos_operacao);
        }

        return NextResponse.json(tiposOperacao, { status: 200 });

    } catch (error) {
        console.error("Erro ao buscar tipos de operação do cliente:", error);
        return NextResponse.json({ message: error.message || 'Erro interno do servidor' }, { status: 500 });
    }
}