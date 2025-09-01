// src/app/api/operacoes/complemento/route.js

import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

export async function POST(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const body = await request.json();
        const { valor, data, operacao_id, conta_bancaria, empresa_associada } = body;

        if (!valor || !data || !operacao_id || !conta_bancaria) {
            return NextResponse.json({ message: 'Dados insuficientes para criar o complemento.' }, { status: 400 });
        }

        // Cria o registro na tabela de movimentações
        const { error } = await supabase.from('movimentacoes_caixa').insert({
            data_movimento: data,
            // A descrição é padronizada como solicitado
            descricao: `Complemento Borderô #${operacao_id}`,
            // O valor é sempre negativo, pois é uma saída/pagamento
            valor: -Math.abs(valor),
            conta_bancaria: conta_bancaria,
            // A categoria é padronizada como solicitado
            categoria: 'Pagamento de Borderô',
            operacao_id: operacao_id,
            empresa_associada: empresa_associada,
        });

        if (error) {
            console.error("Erro ao inserir complemento no Supabase:", error);
            throw error;
        }

        return new NextResponse(null, { status: 201 }); // 201 Created

    } catch (error) {
        console.error("Erro na API de complemento de borderô:", error);
        return NextResponse.json({ message: error.message || 'Erro interno do servidor' }, { status: 500 });
    }
}