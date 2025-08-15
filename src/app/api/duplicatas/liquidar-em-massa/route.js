import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

export async function POST(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const { ids, dataLiquidacao, jurosMora, contaBancariaId } = await request.json();

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return NextResponse.json({ message: 'Nenhuma duplicata selecionada.' }, { status: 400 });
        }

        // Para cada ID, chama a função do Supabase para liquidar
        const promises = ids.map(id => 
            supabase.rpc('liquidar_duplicata', {
                p_duplicata_id: id,
                p_data_liquidacao: dataLiquidacao,
                p_juros_mora: jurosMora || 0,
                p_conta_bancaria_id: contaBancariaId
            })
        );
        
        const results = await Promise.all(promises);
        
        // Verifica se alguma das chamadas deu erro
        const firstError = results.find(res => res.error);
        if (firstError) {
            console.error('Erro ao liquidar uma ou mais duplicatas:', firstError.error);
            throw new Error('Falha ao liquidar uma ou mais duplicatas.');
        }

        return new NextResponse(null, { status: 200 });
    } catch (error) {
        console.error('Erro no endpoint de liquidação em massa:', error);
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}