// src/app/api/duplicatas/search-conciliacao/route.js
import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

export async function GET(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'NÃ£o autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const { searchParams } = new URL(request.url);
        const query = searchParams.get('query');
        const clienteId = searchParams.get('clienteId');

        if (!query && !clienteId) {
            return NextResponse.json({ message: 'Informe uma busca ou um cliente.' }, { status: 400 });
        }

        let dbQuery = supabase
            .from('duplicatas')
            .select('*, operacao:operacoes!inner(status, cliente_id, valor_liquido, valor_total_bruto, valor_total_juros, valor_total_descontos)')
            .eq('status_recebimento', 'Pendente')
            .eq('operacao.status', 'Aprovada');

        if (clienteId) {
            dbQuery = dbQuery.eq('operacao.cliente_id', clienteId);
        }

        if (query) {
            dbQuery = dbQuery.or(`cliente_sacado.ilike.%${query}%,nf_cte.ilike.%${query}%`);
        }

        const { data, error } = await dbQuery
            .order('data_vencimento', { ascending: true })
            .limit(clienteId && !query ? 100 : 50);

        if (error) throw error;

        const formattedData = (data || []).map((d) => ({
            id: d.id,
            nfCte: d.nf_cte,
            clienteSacado: d.cliente_sacado,
            dataVencimento: d.data_vencimento,
            valorBruto: d.valor_bruto,
            valorJuros: d.valor_juros,
            clienteId: d.operacao?.cliente_id || null,
            operacao: d.operacao || null,
        }));

        return NextResponse.json(formattedData, { status: 200 });
    } catch (error) {
        console.error('Erro na API search-conciliacao:', error);
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}
