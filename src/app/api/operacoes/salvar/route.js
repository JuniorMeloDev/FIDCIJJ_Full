import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

export async function POST(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const body = await request.json();

        // Utiliza os valores pré-calculados enviados pelo frontend
        const { totais } = body;
        const valorTotalBruto = totais.valorTotalBruto;
        const valorTotalJuros = totais.valorTotalJuros;
        const valorTotalDescontos = totais.valorTotalDescontos;

        const duplicatasParaSalvar = body.notasFiscais.flatMap(nf => {
            const isCteSingleParcela = body.cedenteRamo === 'Transportes' && nf.parcelasCalculadas.length === 1;

            return nf.parcelasCalculadas.map(p => ({
                nfCte: isCteSingleParcela ? nf.nfCte : `${nf.nfCte}.${p.numeroParcela}`,
                clienteSacado: nf.clienteSacado,
                valorParcela: p.valorParcela,
                jurosParcela: p.jurosParcela,
                dataVencimento: p.dataVencimento,
            }));
        });

        const { data: operacaoId, error: rpcError } = await supabase.rpc('salvar_operacao_completa', {
            p_data_operacao: body.dataOperacao,
            p_tipo_operacao_id: body.tipoOperacaoId,
            p_cliente_id: body.clienteId,
            p_conta_bancaria_id: body.contaBancariaId,
            p_valor_total_bruto: valorTotalBruto,
            p_valor_total_juros: valorTotalJuros,
            p_valor_total_descontos: valorTotalDescontos,
            p_duplicatas: duplicatasParaSalvar,
            p_descontos: body.descontos,
            p_valor_debito_parcial: body.valorDebito, 
            p_data_debito_parcial: body.dataDebito  
        });

        if (rpcError) throw rpcError;

        // Após criar a operação, define seu status como 'Aprovada'
        const { error: updateError } = await supabase
            .from('operacoes')
            .update({ status: 'Aprovada' })
            .eq('id', operacaoId);

        if (updateError) {
            console.error('Falha ao atualizar status da operação criada pelo admin:', updateError);
            throw new Error('Operação salva, mas falha ao definir o status como Aprovada.');
        }

        return NextResponse.json(operacaoId, { status: 201 });

    } catch (error) {
        console.error('Erro ao salvar operação:', error);
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}