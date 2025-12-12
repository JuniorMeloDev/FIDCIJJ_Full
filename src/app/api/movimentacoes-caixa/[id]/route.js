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
                natureza: body.natureza // <--- Agora atualiza a natureza
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
export async function DELETE(request, props) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const params = await props.params;
        const { id } = params;

        // 1. Busca o lançamento para verificar a categoria antes de excluir.
        const { data: lancamento, error: fetchError } = await supabase
            .from('movimentacoes_caixa')
            .select('categoria')
            .eq('id', id)
            .single();
        
        if (fetchError) throw new Error("Lançamento não encontrado.");

        // 2. Define uma lista de categorias protegidas que não podem ser excluídas manualmente.
        const categoriasProtegidas = ['Pagamento de Borderô', 'Recebimento', 'Transferencia Enviada', 'Transferencia Recebida'];
        if (categoriasProtegidas.includes(lancamento.categoria)) {
            return NextResponse.json({ message: 'Este lançamento foi gerado automaticamente e não pode ser excluído manualmente.' }, { status: 403 });
        }

        // 3. Se não for protegido, prossegue com a exclusão.
        const { error } = await supabase.from('movimentacoes_caixa').delete().eq('id', id);

        if (error) throw error;
        return new NextResponse(null, { status: 204 });
    } catch (error) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}