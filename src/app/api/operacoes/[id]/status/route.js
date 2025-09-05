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
            if (!conta_bancaria_id) {
                return NextResponse.json({ message: 'Conta bancária é obrigatória para aprovação.' }, { status: 400 });
            }

            const { data: operacao, error: fetchError } = await supabase
                .from('operacoes')
                .select('valor_liquido, data_operacao, cliente:clientes(ramo_de_atividade)')
                .eq('id', id)
                .single();
            
            if (fetchError || !operacao) {
                throw new Error('Operação a ser aprovada não foi encontrada.');
            }
            
            const { data: conta, error: contaError } = await supabase
                .from('contas_bancarias')
                .select('banco, agencia, conta_corrente')
                .eq('id', conta_bancaria_id)
                .single();

             if (contaError || !conta) {
                throw new Error('Conta bancária selecionada não foi encontrada.');
            }
            
             const { data: clientes } = await supabase.from('clientes').select('nome').limit(1);
             const empresaMasterNome = clientes && clientes.length > 0 ? clientes[0].nome : 'FIDC IJJ';

            // Lógica para criar a descrição customizada
            let descricaoLancamento = `Borderô #${id}`; // Fallback
            const { data: duplicatas } = await supabase.from('duplicatas').select('nf_cte').eq('operacao_id', id);
            if (duplicatas && duplicatas.length > 0 && operacao.cliente) {
                const docType = operacao.cliente.ramo_de_atividade === 'Transportes' ? 'CTe' : 'NF';
                const numerosDoc = [...new Set(duplicatas.map(d => d.nf_cte.split('.')[0]))].join(', ');
                // CORREÇÃO: Removido "Pagamento" do início da string.
                descricaoLancamento = `Borderô ${docType} ${numerosDoc}`;
            }

            const { error: movError } = await supabase
                .from('movimentacoes_caixa')
                .insert({
                    operacao_id: id,
                    data_movimento: operacao.data_operacao,
                    descricao: descricaoLancamento,
                    valor: -Math.abs(operacao.valor_liquido),
                    categoria: 'Pagamento de Borderô',
                    conta_bancaria: `${conta.banco} - Ag. ${conta.agencia} / CC ${conta.conta_corrente}`,
                    empresa_associada: empresaMasterNome,
                });

            if (movError) throw movError;

            const { error: updateError } = await supabase
                .from('operacoes')
                .update({ status: 'Aprovada', conta_bancaria_id: conta_bancaria_id })
                .eq('id', id);

            if (updateError) throw updateError;

        } else {
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