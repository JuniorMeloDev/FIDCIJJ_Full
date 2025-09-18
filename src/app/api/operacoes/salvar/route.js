import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

export async function POST(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const body = await request.json();
        const { totais, notasFiscais } = body;

        const { data: operacaoId, error: rpcError } = await supabase.rpc('salvar_operacao_completa', {
            p_data_operacao: body.dataOperacao,
            p_tipo_operacao_id: body.tipoOperacaoId,
            p_cliente_id: body.clienteId,
            p_conta_bancaria_id: body.contaBancariaId,
            p_valor_total_bruto: totais.valorTotalBruto,
            p_valor_total_juros: totais.desagioTotal,
            p_valor_total_descontos: totais.totalOutrosDescontos,
            p_descontos: body.descontos,
            p_valor_debito_parcial: body.valorDebito,
            p_data_debito_parcial: body.dataDebito
        });

        if (rpcError) {
            console.error("Erro na RPC ao criar a operação:", rpcError);
            throw new Error("Falha ao criar o cabeçalho da operação no banco de dados.");
        }

        if (!operacaoId) {
            throw new Error("A criação da operação não retornou um ID válido.");
        }

        // --- LÓGICA DE PREPARAÇÃO DAS DUPLICATAS CORRIGIDA ---
        const duplicatasParaSalvar = notasFiscais.flatMap(nf =>
            nf.parcelasCalculadas.map(p => ({
                operacao_id: operacaoId,
                data_operacao: body.dataOperacao,
                // AQUI ESTÁ A CORREÇÃO: Concatena o número da nota com o número da parcela
                nf_cte: `${nf.nfCte}.${p.numeroParcela}`,
                cliente_sacado: nf.clienteSacado,
                sacado_id: nf.sacadoId,
                valor_bruto: p.valorParcela,
                valor_juros: p.jurosParcela,
                data_vencimento: p.dataVencimento,
                status_recebimento: 'Pendente'
            }))
        );

        const { error: duplicatasError } = await supabase
            .from('duplicatas')
            .insert(duplicatasParaSalvar);

        if (duplicatasError) {
            console.error("Erro ao inserir duplicatas, tentando reverter operação:", duplicatasError);
            await supabase.from('operacoes').delete().eq('id', operacaoId);
            throw new Error("Falha ao salvar os detalhes das duplicatas. A operação foi cancelada.");
        }
        
        const { error: updateError } = await supabase
            .from('operacoes')
            .update({ status: 'Aprovada' })
            .eq('id', operacaoId);

        if (updateError) throw new Error('Operação salva, mas falha ao definir o status como Aprovada.');

        return NextResponse.json(operacaoId, { status: 201 });

    } catch (error) {
        console.error('Erro no processo de salvar operação:', error);
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}