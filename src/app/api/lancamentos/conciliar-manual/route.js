// src/app/api/lancamentos/conciliar-manual/route.js
import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

export async function POST(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const body = await request.json();

        // Validação dos campos obrigatórios
        const requiredFields = ['data_movimento', 'descricao', 'valor', 'conta_bancaria', 'categoria'];
        for (const field of requiredFields) {
            if (!body[field]) {
                return NextResponse.json({ 
                    message: `Campo obrigatório ausente: ${field}` 
                }, { status: 400 });
            }
        }

        // Formata o payload para inserção
        const lancamento = {
            data_movimento: body.data_movimento,
            descricao: body.descricao,
            valor: Number(body.valor), // Garante que seja número
            conta_bancaria: body.conta_bancaria,
            categoria: body.categoria,
            transaction_id: body.transaction_id || null,
            is_despesa: body.isDespesa || false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        // Insere o lançamento no banco
        const { data, error } = await supabase
            .from('movimentacoes_caixa')
            .insert([lancamento])
            .select()
            .single();

        if (error) {
            console.error('Erro ao salvar lançamento:', error);
            throw new Error('Falha ao salvar o lançamento.');
        }

        return NextResponse.json({ 
            message: 'Lançamento manual salvo com sucesso!',
            lancamento: data
        }, { status: 201 });

    } catch (error) {
        console.error('Erro na API /conciliar-manual:', error);
        return NextResponse.json({ 
            message: error.message || 'Erro interno do servidor' 
        }, { status: 500 });
    }
}