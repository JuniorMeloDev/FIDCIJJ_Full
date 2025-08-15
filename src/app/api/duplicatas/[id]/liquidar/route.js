import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseServerClient';
import jwt from 'jsonwebtoken';

export async function POST(request, { params }) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const { id } = params;
        const { searchParams } = new URL(request.url);

        const { error } = await supabase.rpc('liquidar_duplicata', {
            p_duplicata_id: id,
            p_data_liquidacao: searchParams.get('dataLiquidacao'),
            p_juros_mora: searchParams.get('jurosMora') || 0,
            p_conta_bancaria_id: searchParams.get('contaBancariaId')
        });

        if (error) throw error;
        return new NextResponse(null, { status: 200 });
    } catch (error) {
        console.error('Erro ao liquidar duplicata:', error);
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}