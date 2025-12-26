import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

export async function POST(request, { params }) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const { id } = await params; // ID da Duplicata

        // 1. Executa a função de banco (RPC) que volta a duplicata para 'Pendente'
        const { error: rpcError } = await supabase.rpc('estornar_liquidacao', { p_duplicata_id: id });

        if (rpcError) {
            console.error('Erro na RPC de estorno:', rpcError);
            throw rpcError;
        }

        // --- CORREÇÃO APLICADA AQUI ---
        // 2. Remove explicitamente o lançamento financeiro da tabela de movimentações.
        // Isso fará o item sumir do Fluxo de Caixa e o saldo ser recalculado corretamente.
        const { error: deleteError } = await supabase
            .from('movimentacoes_caixa')
            .delete()
            .eq('duplicata_id', id);

        if (deleteError) {
            console.error('Erro ao excluir movimentação do fluxo de caixa:', deleteError);
            // Mesmo se falhar aqui, a duplicata já foi estornada (passo 1). 
            // Idealmente seria uma transação, mas no Supabase via cliente JS fazemos sequencial.
        }
        // -------------------------------

        return new NextResponse(null, { status: 200 });
    } catch (error) {
        console.error('Erro ao estornar liquidação:', error);
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}