import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

// PUT: Atualiza uma movimentação de caixa
export async function PUT(request, { params }) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const { id } = params;
        const body = await request.json();

        // Apenas atualiza os campos permitidos
        const { error } = await supabase
            .from('movimentacoes_caixa')
            .update({
                data_movimento: body.data_movimento,
                descricao: body.descricao,
                valor: body.valor,
                conta_bancaria: body.conta_bancaria,
                categoria: body.categoria,
            })
            .eq('id', id);

        if (error) {
            console.error("Erro ao atualizar no Supabase:", error);
            throw error;
        }

        return new NextResponse(null, { status: 204 }); // No Content
    } catch (error) {
        return NextResponse.json({ message: error.message || 'Erro interno do servidor' }, { status: 500 });
    }
}


// DELETE: Apaga uma movimentação de caixa
export async function DELETE(request, { params }) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const { id } = params;
        const { error } = await supabase.from('movimentacoes_caixa').delete().eq('id', id);

        if (error) throw error;
        return new NextResponse(null, { status: 204 });
    } catch (error) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}