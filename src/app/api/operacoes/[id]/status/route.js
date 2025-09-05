import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

export async function PUT(request, { params }) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userRoles = decoded.roles || [];
        if (!userRoles.includes('ROLE_ADMIN')) {
            return NextResponse.json({ message: 'Acesso negado' }, { status: 403 });
        }

        const { id } = params;
        const { status, conta_bancaria_id } = await request.json();

        if (status === 'Aprovada') {
            // Primeiro, chama a função que cria a movimentação de caixa (débito)
            const { error: rpcError } = await supabase.rpc('aprovar_operacao', {
                p_operacao_id: parseInt(id, 10),
                p_conta_bancaria_id: conta_bancaria_id,
            });
            if (rpcError) throw rpcError;
            
            // CORREÇÃO: Após a aprovação, atualiza explicitamente o status da operação
            const { error: updateError } = await supabase
                .from('operacoes')
                .update({ status: 'Aprovada' })
                .eq('id', id);
            if (updateError) throw updateError;

        } else { // 'Rejeitada' ou outros status
            const { error } = await supabase
                .from('operacoes')
                .update({ status: status })
                .eq('id', id);
            if (error) throw error;
        }
        
        return NextResponse.json({ message: `Operação ${status.toLowerCase()} com sucesso.` }, { status: 200 });

    } catch (error) {
        console.error('Erro ao atualizar status da operação:', error);
        return NextResponse.json({ message: error.message || 'Erro interno do servidor' }, { status: 500 });
    }
}