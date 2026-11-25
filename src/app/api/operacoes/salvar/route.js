import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';
import { consultarPixItauEfetivado } from '@/app/lib/pixItauExtrato';
import {
    findRepeatedDuplicatas,
    formatDuplicataConflictMessage,
    queryDuplicatasByEntries,
} from '@/app/lib/duplicataGuard';

export async function POST(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        const usuario = jwt.verify(token, process.env.JWT_SECRET);
        if (!usuario.roles?.some((role) => ['ROLE_ADMIN', 'ROLE_USER'].includes(role))) {
            return NextResponse.json({ message: 'Acesso negado.' }, { status: 403 });
        }

        const body = await request.json();
        const { totais, notasFiscais, efetuar_pix, validarApenas, recuperarPixItau } = body;
        if (!totais || !Array.isArray(notasFiscais) || !notasFiscais.length || !Array.isArray(body.descontos)
            || !notasFiscais.every((nf) => nf?.nfCte && nf.sacadoId && Array.isArray(nf.parcelasCalculadas) && nf.parcelasCalculadas.length)
            || ![body.clienteId, body.contaBancariaId, body.tipoOperacaoId].every((id) => Number.isSafeInteger(Number(id)) && Number(id) > 0)) {
            return NextResponse.json({ message: 'Confira o cedente, a conta, o tipo de operação e as parcelas do borderô.' }, { status: 400 });
        }
        let pixEndToEndId = String(body.pixEndToEndId || '').trim() || null;
        let contaPixNoExtrato;
        const { data: tipoOperacao, error: tipoOperacaoError } = await supabase
            .from('tipos_operacao')
            .select('id, juros_pre_fixado')
            .eq('id', body.tipoOperacaoId)
            .single();

        if (tipoOperacaoError) {
            throw new Error('Tipo de operação não encontrado.');
        }
        
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

        const valorDebitoCentavos = Math.round(Number(body.valorDebito) * 100);
        if (efetuar_pix && (!Number.isSafeInteger(valorDebitoCentavos) || valorDebitoCentavos <= 0)) {
            return NextResponse.json({ message: 'Informe um valor de PIX válido.' }, { status: 400 });
        }
        if (recuperarPixItau || (efetuar_pix && validarApenas)) {
            const data = body.dataDebito;
            const dia = new Date(`${data}T00:00:00Z`);
            if (!efetuar_pix || !/^\d{4}-\d{2}-\d{2}$/.test(data || '') || !Number.isFinite(dia.getTime())
                || dia.toISOString().slice(0, 10) !== data || !Number.isSafeInteger(valorDebitoCentavos)
                || valorDebitoCentavos <= 0) {
                return NextResponse.json({ message: 'Informe a data e o valor do PIX enviado.' }, { status: 400 });
            }
            const [conta, cedente] = await Promise.all([
                supabase.from('contas_bancarias').select('banco, agencia, conta_corrente').eq('id', body.contaBancariaId).single(),
                supabase.from('clientes').select('cnpj').eq('id', body.clienteId).single(),
            ]);
            if (conta.error || cedente.error) throw new Error('Confira a conta bancária e o cedente do borderô.');
            if (recuperarPixItau || /ita[uú]/i.test(conta.data.banco)) {
                const eventos = await consultarPixItauEfetivado({
                    conta: conta.data, data, centavos: valorDebitoCentavos, documento: cedente.data.cnpj,
                });
                if (eventos.length > 1) {
                    return NextResponse.json(
                        { message: 'Há mais de um PIX do mesmo valor para este cedente. Confira os pagamentos no Itaú.' },
                        { status: 409 }
                    );
                }
                if (recuperarPixItau && !eventos.length) {
                    return NextResponse.json({
                        codigo: 'PIX_AGUARDANDO_EXTRATO',
                        message: 'O Itaú ainda não confirmou o débito no extrato. Salvar Operação retoma a consulta.',
                    }, { status: 409 });
                }
                if (eventos.length) {
                    pixEndToEndId = eventos[0].id;
                    contaPixNoExtrato = `${conta.data.banco} - ${conta.data.agencia}/${conta.data.conta_corrente}`;
                }
            }
        }

        const repetidosNoEnvio = findRepeatedDuplicatas(duplicatasParaSalvar);
        const duplicatasConflitantes = await queryDuplicatasByEntries(
            supabase,
            duplicatasParaSalvar,
            { clienteId: body.clienteId }
        );

        let operacaoId;
        if (efetuar_pix && pixEndToEndId) {
            const { data: movimentos, error } = await supabase.from('movimentacoes_caixa')
                .select('operacao_id, valor')
                .eq('transaction_id', pixEndToEndId).limit(2);
            if (error) throw error;
            let candidatos = movimentos;
            if (!candidatos.length && contaPixNoExtrato) {
                const { data, error: consultaError } = await supabase.from('movimentacoes_caixa')
                    .select('operacao_id, valor, operacao:operacoes!inner(cliente_id)')
                    .eq('conta_bancaria', contaPixNoExtrato)
                    .eq('data_movimento', body.dataDebito)
                    .eq('valor', -valorDebitoCentavos / 100)
                    .eq('operacao.cliente_id', body.clienteId)
                    .not('transaction_id', 'is', null).limit(2);
                if (consultaError) throw consultaError;
                candidatos = data;
            }
            if (candidatos.length > 0) {
                const movimento = candidatos[0];
                if (validarApenas && movimentos.length === 1 && movimento.operacao_id
                    && !repetidosNoEnvio.length && !duplicatasConflitantes.length) {
                    return new NextResponse(null, { status: 204 });
                }
                const esperado = new Set(duplicatasParaSalvar.map((item) => item.nfCte));
                const correspondentes = duplicatasConflitantes.filter((item) => item.operacao_id === movimento.operacao_id);
                if (candidatos.length !== 1 || !movimento.operacao_id || repetidosNoEnvio.length > 0
                    || Math.round(-Number(movimento.valor) * 100) !== valorDebitoCentavos
                    || correspondentes.length !== duplicatasParaSalvar.length
                    || !correspondentes.every((item) => esperado.has(item.nf_cte))) {
                    return NextResponse.json({ message: 'Este PIX já está vinculado a outro registro. Confira o Fluxo de Caixa.' }, { status: 409 });
                }
                operacaoId = movimento.operacao_id;
            }
        }

        if (!operacaoId && (repetidosNoEnvio.length > 0 || duplicatasConflitantes.length > 0)) {
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
        if (validarApenas) {
            return contaPixNoExtrato
                ? NextResponse.json({ pixJaDebitado: true })
                : new NextResponse(null, { status: 204 });
        }
        if (efetuar_pix && !pixEndToEndId) {
            return NextResponse.json({ message: 'O identificador do PIX é necessário para finalizar o borderô.' }, { status: 400 });
        }

        if (!operacaoId) {
            const { data, error: rpcError } = await supabase.rpc('salvar_operacao_completa', {
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
            operacaoId = data;
        }
        
        const { error: updateError } = await supabase
            .from('operacoes')
            .update({ 
                status: 'Aprovada',
                juros_pre_fixado: body.jurosPre ?? tipoOperacao?.juros_pre_fixado ?? true
            })
            .eq('id', operacaoId);

        if (updateError) throw new Error('Operação salva, mas falha ao definir o status como Aprovada.');

        return NextResponse.json(operacaoId, { status: 201 });

    } catch (error) {
        console.error('Erro ao salvar operação:', error);
        return NextResponse.json({ message: error.message || 'Erro interno do servidor' }, { status: 500 });
    }
}
