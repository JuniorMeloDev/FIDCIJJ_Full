import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

// DELETE: Apaga uma operação completa e suas movimentações de caixa
export async function DELETE(request, { params }) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const { id } = params;

        // Utiliza uma função RPC no Supabase para garantir a exclusão atômica
        const { error } = await supabase.rpc('excluir_operacao_completa', { p_operacao_id: id });

        if (error) {
            // Verifica se o erro é a exceção customizada da função
            if (error.message.includes('liquidada')) {
                return NextResponse.json({ message: 'Não é possível excluir uma operação que contém duplicatas já liquidadas.' }, { status: 400 });
            }
            throw error;
        }

        return new NextResponse(null, { status: 204 }); // No Content
    } catch (error) {
        console.error('Erro ao excluir operação:', error);
        return NextResponse.json({ message: error.message || 'Erro interno do servidor' }, { status: 500 });
    }
}