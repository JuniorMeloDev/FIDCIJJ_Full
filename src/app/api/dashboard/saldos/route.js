import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

export async function GET(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const { searchParams } = new URL(request.url);
        
        // A API ainda recebe dataInicio e dataFim, mas só usaremos dataFim.
        const dataFim = searchParams.get('dataFim') || null;

        // Chamada RPC modificada para passar apenas o parâmetro p_data_fim.
        const { data, error } = await supabase.rpc('get_saldos_por_conta', {
            p_data_fim: dataFim
        });

        if (error) throw error;

        const formattedData = data.map(item => ({ contaBancaria: item.conta_bancaria, saldo: item.saldo }));
        return NextResponse.json(formattedData, { status: 200 });
    } catch (error) {
        console.error('Erro no endpoint de saldos:', error.message);
        return NextResponse.json({ message: error.message || 'Erro interno do servidor' }, { status: 500 });
    }
}