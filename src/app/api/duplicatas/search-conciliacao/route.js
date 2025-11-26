// src/app/api/duplicatas/search-conciliacao/route.js
import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

export async function GET(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const { searchParams } = new URL(request.url);
        const query = searchParams.get('query');

        if (!query) {
            return NextResponse.json({ message: 'Parâmetro de busca é obrigatório.' }, { status: 400 });
        }

        // Esta consulta busca duplicatas PENDENTES onde o nome do sacado OU o número da NF/CTe correspondem à busca
        const { data, error } = await supabase
            .from('duplicatas')
            .select('*, operacao:operacoes!inner(status)') 
            .eq('status_recebimento', 'Pendente') // Apenas duplicatas em aberto
            .eq('operacao.status', 'Aprovada')    // Apenas de operações APROVADAS
            .or(`cliente_sacado.ilike.%${query}%,nf_cte.ilike.%${query}%`)
            .order('data_vencimento', { ascending: true })
            .limit(50);

        if (error) throw error;

        // Formata os dados para o frontend usar (opcional, mas bom para consistência)
        const formattedData = data.map(d => ({
            id: d.id,
            nfCte: d.nf_cte,
            clienteSacado: d.cliente_sacado,
            dataVencimento: d.data_vencimento,
            valorBruto: d.valor_bruto,
        }));

        return NextResponse.json(formattedData, { status: 200 });
    } catch (error) {
        console.error("Erro na API search-conciliacao:", error);
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}