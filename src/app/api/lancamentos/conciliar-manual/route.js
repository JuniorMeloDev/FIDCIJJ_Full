// src/app/api/lancamentos/conciliar-manual/route.js
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';

export async function POST(request) {
    const token = request.headers.get('Authorization')?.split(' ')[1];
    if (!token) {
        return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    }

    try {
        jwt.verify(token, process.env.JWT_SECRET);
        
        const body = await request.json();

        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.SUPABASE_SERVICE_KEY 
        );

        const lancamento = {
            data_movimento: body.data_movimento,
            descricao: body.descricao,
            valor: body.valor,
            conta_bancaria: body.conta_bancaria,
            categoria: body.categoria,
            transaction_id: body.transaction_id,
            natureza: body.natureza
        };

        console.log('[CONCILIAR-MANUAL] Payload final (para insert):', JSON.stringify(lancamento, null, 2));

        // --- INÍCIO DA CORREÇÃO ---
        // Trocando .upsert() por .insert(), para ser igual ao pix/route.js
        const { data, error } = await supabase
            .from('movimentacoes_caixa') 
            .insert(lancamento); // <-- MUDANÇA AQUI
        // --- FIM DA CORREÇÃO ---

        if (error) {
            // Agora, se o 'transaction_id' já existir (e tiver uma constraint UNIQUE que não vimos),
            // o erro será pego aqui. Mas se não tiver, ele apenas inserirá.
            console.error('### ERRO NO OBJETO DE RETORNO [Supabase] ###');
            console.error(JSON.stringify(error, null, 2));
            throw error; 
        }

        return NextResponse.json(data);

    } catch (error) {
        console.error('### ERRO NO CATCH PRINCIPAL ###');
        console.error('Mensagem:', error.message);
        console.error('Objeto de Erro Completo:', error);

        // Se o erro for de duplicidade (agora que estamos usando INSERT)
        if (error.code === '23505') { // 'unique_violation'
             return NextResponse.json({ message: 'Esta transação já foi salva anteriormente.' }, { status: 409 }); // 409 Conflict
        }
        
        if (error.name === 'JsonWebTokenError') {
            return NextResponse.json({ message: 'Token inválido' }, { status: 401 });
        }
        
        const errorMessage = error.message || error.details || 'Erro interno do servidor';
        return NextResponse.json({ message: errorMessage }, { status: 500 });
    }
}