// type: uploaded file
// fileName: app/api/operacoes/[id]/status/route.js

import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';
import { sendOperationStatusEmail } from '@/app/lib/emailService';
import { getInterAccessToken, enviarPixInter } from "@/app/lib/interService";
import { getItauAccessToken, enviarPixItau } from "@/app/lib/itauService";
import { format } from 'date-fns';

export async function PUT(request, props) {
    const params = await props.params;
    const { id } = params;
    
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });

        jwt.verify(token, process.env.JWT_SECRET);

        const body = await request.json();
        const { status, conta_bancaria_id, descontos, valor_debito_parcial, data_debito_parcial, efetuar_pix, recompraData } = body;

        // 1. Busca a operação
        const { data: operacao, error: fetchError } = await supabase
            .from('operacoes')
            .select('*, cliente:clientes(id, nome, email, ramo_de_atividade)')
            .eq('id', id)
            .single();

        if (fetchError || !operacao) throw new Error('Operação não encontrada.');

        if (status === 'Aprovada') {
            if (!conta_bancaria_id) return NextResponse.json({ message: 'Conta bancária obrigatória.' }, { status: 400 });

            // --- CÁLCULOS ---
            const totalDescontosAdicionais = descontos?.reduce((acc, d) => acc + d.valor, 0) || 0;
            const valorTotalRecompra = recompraData?.valorTotal || 0;
            const valorLiquidoFinal = operacao.valor_liquido - totalDescontosAdicionais; 

            let valorParaPagar = valorLiquidoFinal;
            if (valor_debito_parcial && Number(valor_debito_parcial) > 0) {
                valorParaPagar = Number(valor_debito_parcial);
            }

            // Definição da data de pagamento
            const dataObj = data_debito_parcial ? new Date(data_debito_parcial) : new Date();
            const dataPagamentoFormatada = format(dataObj, 'yyyy-MM-dd');

            // 2. PROCESSAMENTO DE PIX (Inter ou Itaú)
            const { data: conta } = await supabase.from("contas_bancarias").select("*").eq("id", conta_bancaria_id).single();
            let pixEndToEndId = null;

            if (efetuar_pix) {
                const nomeBanco = conta.banco.toLowerCase();
                
                const { data: contasCliente } = await supabase.from('contas_bancarias').select('*').eq('cliente_id', operacao.cliente.id);
                const contaDestino = contasCliente.find(c => c.chave_pix);

                if (!contaDestino || !contaDestino.chave_pix) {
                    throw new Error(`Cliente ${operacao.cliente.nome} não possui chave PIX cadastrada.`);
                }

                // --- LÓGICA BANCO INTER ---
                if (nomeBanco.includes('inter')) {
                    try {
                        const dadosPix = {
                            valor: parseFloat(valorParaPagar.toFixed(2)),
                            dataPagamento: dataPagamentoFormatada,
                            descricao: `Pagamento Op #${id}`,
                            destinatario: { tipo: "CHAVE", chave: contaDestino.chave_pix }
                        };

                        const tokenInter = await getInterAccessToken();
                        const resultadoPix = await enviarPixInter(tokenInter.access_token, dadosPix, conta.conta_corrente);
                        
                        pixEndToEndId = resultadoPix.endToEndId || resultadoPix.transacaoPix?.endToEnd || resultadoPix.transacaoPix?.endToEndId;

                    } catch (pixError) {
                        console.error(">>> [ERRO PIX INTER]:", pixError);
                        throw new Error(`Falha no envio do PIX Inter: ${pixError.message}`);
                    }

                // --- LÓGICA BANCO ITAÚ ---
                } else if (nomeBanco.includes('itaú') || nomeBanco.includes('itau')) {
                    
                    const CONTA_REAL_ITAU = process.env.ITAU_PIX_CONTA_REAL;
                    const ID_CLIENTE_PAGADOR = process.env.ITAU_PIX_CLIENTE_ID_REAL;

                    if (!CONTA_REAL_ITAU || !ID_CLIENTE_PAGADOR) {
                        throw new Error("Configuração de PIX Itaú incompleta.");
                    }

                    const { data: contaRealInfo, error: contaRealError } = await supabase
                        .from("contas_bancarias")
                        .select("*")
                        .eq("conta_corrente", CONTA_REAL_ITAU)
                        .single();

                    if (contaRealError || !contaRealInfo) throw new Error(`Conta Itaú real (${CONTA_REAL_ITAU}) não encontrada.`);

                    const { data: dadosPagador, error: pagadorError } = await supabase
                        .from("clientes")
                        .select("cnpj")
                        .eq("id", ID_CLIENTE_PAGADOR)
                        .single();

                    if (pagadorError || !dadosPagador) throw new Error("Dados do pagador (Empresa) não encontrados.");

                    const pagadorDocumento = dadosPagador.cnpj.replace(/\D/g, "");
                    const pagadorTipoPessoa = pagadorDocumento.length > 11 ? "J" : "F";

                    let chaveFinal = contaDestino.chave_pix;
                    
                    try {
                        let tipoChave = "aleatoria";
                        const chaveLimpa = chaveFinal.replace(/\D/g, '');
                        if (chaveFinal.includes('@')) tipoChave = "email";
                        else if (chaveLimpa.length === 11) tipoChave = "cpf";
                        else if (chaveLimpa.length === 14) tipoChave = "cnpj";
                        else if (chaveLimpa.length > 8 && chaveLimpa.length < 14) tipoChave = "celular";

                        const dadosPixItau = {
                            valor_pagamento: valorParaPagar.toFixed(2),
                            data_pagamento: dataPagamentoFormatada,
                            chave: chaveFinal,
                            tipo_conta: "CC", 
                            referencia_empresa: `OP-${id}`.substring(0, 20),
                            identificacao_comprovante: `Pagamento Operacao ${id}`.substring(0, 100),
                            pagador: {
                                tipo_conta: "CC",
                                agencia: contaRealInfo.agencia.replace(/\D/g, ""),
                                conta: contaRealInfo.conta_corrente.replace(/\D/g, "").padStart(8, "0"),
                                tipo_pessoa: pagadorTipoPessoa,
                                documento: pagadorDocumento,
                                modulo_sispag: "Fornecedores"
                            }
                        };


                        const tokenItau = await getItauAccessToken();
                        const resultadoPix = await enviarPixItau(tokenItau.access_token, dadosPixItau);
                        
                        pixEndToEndId = resultadoPix.cod_pagamento || resultadoPix.id_transferencia || "ENVIADO_ITAU"; 

                    } catch (pixError) {
                        console.error(">>> [ERRO PIX ITAÚ]:", pixError);
                        throw new Error(`Falha no envio do PIX Itaú: ${pixError.message}`);
                    }
                }
            }

            // 3. Limpeza de dados antigos
            await supabase.from("movimentacoes_caixa").delete().eq("operacao_id", id).in("categoria", ["Pagamento de Borderô", "Recompra de Titulo"]);
            await supabase.from('descontos').delete().eq('operacao_id', id);

            // 4. Movimentações Financeiras - A) Débito Principal
            const valorBaseOperacao = operacao.valor_liquido - totalDescontosAdicionais;
            
            // --- CONSTRUÇÃO DA DESCRIÇÃO ---
            let descricaoLancamento = `Borderô #${id}`;
            const { data: duplicatas } = await supabase
                .from("duplicatas")
                .select("nf_cte")
                .eq("operacao_id", id);
            
            if (duplicatas && duplicatas.length > 0 && operacao.cliente) {
                const docType =
                operacao.cliente.ramo_de_atividade === "Transportes" ? "CTe" : "NF";
                const numerosDoc = [
                ...new Set(duplicatas.map((d) => d.nf_cte.split(".")[0])),
                ].join(", ");
                descricaoLancamento = `Borderô ${docType} ${numerosDoc}`;
            }
            
            // [REMOVIDO]: O trecho que adicionava "PIX Enviado - " foi removido conforme solicitado.
            // A descrição agora será sempre "Borderô NF/CTe Numeros" independentemente se houve PIX ou não.

            await supabase.from("movimentacoes_caixa").insert({
                operacao_id: id,
                data_movimento: dataPagamentoFormatada,
                descricao: descricaoLancamento, // Usa a descrição formatada sem o prefixo PIX
                valor: -Math.abs(valorParaPagar), // Usa o valor efetivamente pago
                categoria: "Pagamento de Borderô",
                conta_bancaria: `${conta.banco} - ${conta.agencia}/${conta.conta_corrente}`,
                empresa_associada: operacao.cliente.nome,
                transaction_id: pixEndToEndId
            });

            // B) Créditos de Recompra
            if (recompraData && recompraData.ids && recompraData.ids.length > 0) {
                const { data: dupsRecompra } = await supabase.from('duplicatas').select('*').in('id', recompraData.ids);

                if (dupsRecompra) {
                    const totalBrutoDups = dupsRecompra.reduce((sum, d) => sum + d.valor_bruto, 0);
                    
                    for (const dup of dupsRecompra) {
                        const prop = totalBrutoDups > 0 ? (dup.valor_bruto / totalBrutoDups) : 0;
                        const valorCreditoItem = valorTotalRecompra * prop;

                        await supabase.from("movimentacoes_caixa").insert({
                            operacao_id: id,
                            data_movimento: dataPagamentoFormatada,
                            descricao: `Recompra NF ${dup.nf_cte} (${dup.cliente_sacado})`,
                            valor: Math.abs(valorCreditoItem),
                            categoria: "Recompra de Titulo",
                            conta_bancaria: `${conta.banco} - ${conta.agencia}/${conta.conta_corrente}`,
                            empresa_associada: operacao.cliente.nome
                        });
                    }

                    await supabase.from('duplicatas')
                        .update({
                            status_recebimento: 'Recebido',
                            data_liquidacao: recompraData.dataLiquidacao || new Date().toISOString().split('T')[0],
                            observacoes: `Recompra na Op. #${id}`
                        })
                        .in('id', recompraData.ids);
                }
            }
            
            // Insere Descontos
             if (descontos && descontos.length > 0) {
                await supabase.from('descontos').insert(descontos.map(d => ({
                    operacao_id: id, descricao: d.descricao, valor: d.valor
                })));
            }

            // 5. Update Final da Operação
            const { error: updateOpError } = await supabase.from('operacoes').update({ 
                status: 'Aprovada', 
                conta_bancaria_id,
                valor_liquido: valorLiquidoFinal,
                valor_total_descontos: operacao.valor_total_descontos + totalDescontosAdicionais + valorTotalRecompra,
                data_aprovacao: dataPagamentoFormatada 
            }).eq('id', id);

            if (updateOpError) throw updateOpError;

        } else {
            // Reprovação
            await supabase.from('duplicatas').delete().eq('operacao_id', id);
            await supabase.from('operacoes').update({ status }).eq('id', id);
        }

        // Notificações
        const { data: clienteUser } = await supabase.from('users').select('id').eq('cliente_id', operacao.cliente.id).single();
        if (clienteUser) {
            await supabase.from('notifications').insert({
                user_id: clienteUser.id,
                title: `Operação #${id} ${status}`,
                message: `Sua operação foi processada.`,
                link: '/portal/dashboard'
            });
        }

        return NextResponse.json({ message: 'Sucesso' }, { status: 200 });

    } catch (error) {
        console.error('Erro Status Route:', error);
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}