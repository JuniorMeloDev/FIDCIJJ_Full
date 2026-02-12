import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient'; // Ajuste o caminho se necessário
import jwt from 'jsonwebtoken';

export async function GET(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const { searchParams } = new URL(request.url);
        const nfCte = searchParams.get('nfCte');
        const sacadoNome = searchParams.get('sacadoNome');
        const clienteId = searchParams.get('clienteId'); // <-- CORREÇÃO: Adicionado filtro de clienteId

        // Validação básica: pelo menos um filtro deve ser usado
        if (!nfCte && !sacadoNome) {
            return NextResponse.json([]); // Retorna vazio se nenhum filtro for forte
        }

        let query = supabase
            .from('duplicatas')
            .select('*, operacao:operacoes!inner(cliente_id, valor_total_bruto, valor_liquido, valor_total_juros, valor_total_descontos)') // <-- CORREÇÃO: Faz join com operacoes
            // REGRA DE NEGÓCIO CORRETA: Apenas duplicatas "Em Aberto"
            .eq('status_recebimento', 'Pendente'); 

        // Aplica os filtros
        if (nfCte) {
            query = query.ilike('nf_cte', `%${nfCte}%`);
        }
        if (sacadoNome) {
            query = query.ilike('cliente_sacado', `%${sacadoNome}%`);
        }
        // <-- CORREÇÃO: Aplica o filtro de clienteId
        if (clienteId) {
            query = query.eq('operacao.cliente_id', clienteId);
        }

        // Limita os resultados para não sobrecarregar
        const { data, error } = await query.limit(25); 

        if (error) {
            console.error('Erro ao buscar duplicatas pendentes:', error.message);
            throw error;
        }
        
        return NextResponse.json(data);

    } catch (error) {
        return NextResponse.json(
            { message: error.message || 'Erro interno do servidor' },
            { status: 500 }
        );
    }
}
