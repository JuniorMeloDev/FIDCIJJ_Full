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

        // 1. Verificar se alguma duplicata da operação já foi liquidada
        const { data: duplicatasLiquidadas, error: checkError } = await supabase
            .from('duplicatas')
            .select('id')
            .eq('operacao_id', id)
            .eq('status_recebimento', 'Recebido')
            .limit(1);

        if (checkError) throw checkError;

        if (duplicatasLiquidadas.length > 0) {
            return NextResponse.json({ message: 'Não é possível excluir uma operação que contém duplicatas já liquidadas.' }, { status: 400 });
        }

        // Se nenhuma estiver liquidada, prosseguir com a exclusão em cascata
        
        // 2. Excluir movimentações de caixa associadas
        await supabase.from('movimentacoes_caixa').delete().eq('operacao_id', id);

        // 3. Excluir descontos associados
        await supabase.from('descontos').delete().eq('operacao_id', id);

        // 4. Excluir duplicatas associadas (agora seguro, pois não estão liquidadas)
        await supabase.from('duplicatas').delete().eq('operacao_id', id);

        // 5. Excluir a operação principal
        const { error: operacaoError } = await supabase.from('operacoes').delete().eq('id', id);
        if (operacaoError) throw operacaoError;

        return new NextResponse(null, { status: 204 }); // No Content

    } catch (error) {
        console.error('Erro ao excluir operação:', error);
        return NextResponse.json({ message: error.message || 'Erro interno do servidor' }, { status: 500 });
    }
}