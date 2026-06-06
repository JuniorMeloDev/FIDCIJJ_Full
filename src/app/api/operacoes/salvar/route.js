import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';
import {
    findRepeatedValues,
    formatDuplicataConflictMessage,
    queryDuplicatasByIdentifiers,
} from '@/app/lib/duplicataGuard';

export async function POST(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const body = await request.json();
        const { totais, notasFiscais, efetuar_pix, pixEndToEndId } = body;
        
        const duplicatasParaSalvar = notasFiscais.flatMap(nf => {
            return nf.parcelasCalculadas.map(p => ({
                nfCte: `${nf.nfCte}.${p.numeroParcela}`,
                clienteSacado: nf.clienteSacado, 
                sacadoId: nf.sacadoId,
                valorParcela: p.valorParcela,
                jurosParcela: p.jurosParcela,
                dataVencimento: p.dataVencimento,
            }));
        });

        const identificadoresDuplicata = duplicatasParaSalvar.map((duplicata) => duplicata.nfCte);
        const repetidosNoEnvio = findRepeatedValues(identificadoresDuplicata);
        const duplicatasConflitantes = await queryDuplicatasByIdentifiers(
            supabase,
            identificadoresDuplicata,
            { clienteId: body.clienteId }
        );

        if (repetidosNoEnvio.length > 0 || duplicatasConflitantes.length > 0) {
            return NextResponse.json(
                {
                    message: formatDuplicataConflictMessage(
                        duplicatasConflitantes,
                        repetidosNoEnvio
                    ),
                    duplicatasConflitantes,
                    repetidosNoEnvio,
                },
                { status: 400 }
            );
        }

        const { data: operacaoId, error: rpcError } = await supabase.rpc('salvar_operacao_completa', {
            p_data_operacao: body.dataOperacao,
            p_tipo_operacao_id: body.tipoOperacaoId,
            p_cliente_id: body.clienteId,
            p_conta_bancaria_id: body.contaBancariaId,
            p_valor_total_bruto: totais.valorTotalBruto,
            p_valor_total_juros: totais.desagioTotal,
            p_valor_total_descontos: totais.totalOutrosDescontos,
            p_duplicatas: duplicatasParaSalvar,
            p_descontos: body.descontos,
            p_valor_debito_parcial: body.valorDebito,
            p_data_debito_parcial: body.dataDebito,
            p_valor_liquido_debito: totais.liquidoOperacao,
            p_is_pix: efetuar_pix,
            p_pix_transaction_id: pixEndToEndId
        });

        if (rpcError) {
            console.error("Erro RPC ao salvar operação:", rpcError);
            throw rpcError;
        }
        
        const { error: updateError } = await supabase
            .from('operacoes')
            .update({ 
                status: 'Aprovada',
                juros_pre_fixado: body.jurosPre 
            })
            .eq('id', operacaoId);

        if (updateError) throw new Error('Operação salva, mas falha ao definir o status como Aprovada.');

        return NextResponse.json(operacaoId, { status: 201 });

    } catch (error) {
        console.error('Erro ao salvar operação:', error);
        return NextResponse.json({ message: error.message || 'Erro interno do servidor' }, { status: 500 });
    }
}
