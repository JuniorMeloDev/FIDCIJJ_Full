// src/app/api/duplicatas/search-by-nf/[nfCte]/route.js
import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

export async function GET(request, { params }) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const { nfCte } = params;

        // Busca todas as parcelas que começam com o número da nota
        const { data, error } = await supabase
            .from('duplicatas')
            .select('*')
            .like('nf_cte', `${nfCte}.%`)
            .eq('status_recebimento', 'Pendente') // Apenas duplicatas em aberto
            .order('data_vencimento', { ascending: true });

        if (error) throw error;
        if (!data || data.length === 0) {
            return NextResponse.json({ message: 'Nenhuma duplicata em aberto encontrada com este número.' }, { status: 404 });
        }

        return NextResponse.json(data, { status: 200 });
    } catch (error) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}