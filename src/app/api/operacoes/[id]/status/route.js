import { NextResponse } from "next/server";
import { supabase } from "@/app/utils/supabaseClient";
import jwt from "jsonwebtoken";
import { sendOperationStatusEmail } from "@/app/lib/emailService";
import { getInterAccessToken, enviarPixInter } from "@/app/lib/interService";
import { getItauAccessToken, enviarPixItau } from "@/app/lib/itauService";
import { format } from 'date-fns';

export async function PUT(request, props) {
  const params = await props.params;
  const { id } = params;

  try {
    const token = request.headers.get("Authorization")?.split(" ")[1];
    if (!token)
      return NextResponse.json({ message: "Não autorizado" }, { status: 401 });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userRoles = decoded.roles || [];
    if (!userRoles.includes("ROLE_ADMIN")) {
      return NextResponse.json({ message: "Acesso negado" }, { status: 403 });
    }

    const body = await request.json();
    const { status, conta_bancaria_id, descontos, valor_debito_parcial, data_debito_parcial, efetuar_pix, recompraData } = body;

    const { data: operacao, error: fetchError } = await supabase
      .from("operacoes")
      .select("*, cliente:clientes(id, nome, email, ramo_de_atividade)")
      .eq("id", id)
      .single();

    if (fetchError || !operacao) {
      throw new Error("Operação a ser atualizada não foi encontrada.");
    }

    if (status === "Aprovada") {
      if (!conta_bancaria_id) {
        return NextResponse.json(
          { message: "Conta bancária é obrigatória para aprovação." },
          { status: 400 }
        );
      }

      const dataEfetivaDebito = data_debito_parcial 
          ? data_debito_parcial 
          : format(new Date(), 'yyyy-MM-dd');
      
      let dataHoraRealTransacao = new Date().toISOString();

      const totalDescontosAdicionais = descontos?.reduce((acc, d) => acc + d.valor, 0) || 0;
      const valorTotalRecompra = recompraData?.valorTotal || 0; 
      const novoValorLiquido = operacao.valor_liquido - totalDescontosAdicionais - valorTotalRecompra;
      
      let valorDebitado = novoValorLiquido;
      if (valor_debito_parcial && Number(valor_debito_parcial) > 0) {
          valorDebitado = Number(valor_debito_parcial);
      }

      if (descontos && descontos.length > 0) {
        const descontosToInsert = descontos.map(d => ({
            operacao_id: id,
            descricao: d.descricao,
            valor: d.valor
        }));
        await supabase.from('descontos').insert(descontosToInsert);
      }

      const { data: conta } = await supabase
        .from("contas_bancarias")
        .select("*")
        .eq("id", conta_bancaria_id)
        .single();
      
      if (!conta) {
          throw new Error("Conta bancária selecionada não encontrada no banco de dados.");
      }

      let pixEndToEndId = null;

      if (efetuar_pix) {
          const nomeBanco = conta.banco.toLowerCase();
          const { data: contasCliente } = await supabase.from('contas_bancarias').select('*').eq('cliente_id', operacao.cliente.id);
          const contaDestino = contasCliente.find(c => c.chave_pix);

          if (!contaDestino || !contaDestino.chave_pix) {
              throw new Error(`Cliente ${operacao.cliente.nome} não possui chave PIX cadastrada para recebimento.`);
          }

          if (nomeBanco.includes('inter')) {
              const dadosPix = {
                  valor: parseFloat(valorDebitado.toFixed(2)),
                  dataPagamento: dataEfetivaDebito,
                  descricao: `Pagamento Borderô #${id}`,
                  destinatario: {
                      tipo: "CHAVE",
                      chave: contaDestino.chave_pix
                  }
              };
              
              const tokenInter = await getInterAccessToken();
              const resultadoPix = await enviarPixInter(tokenInter.access_token, dadosPix, conta.conta_corrente);
              
              pixEndToEndId = resultadoPix.transacaoPix?.endToEnd || resultadoPix.endToEndId; 
              
              if (resultadoPix.transacaoPix?.dataHoraMovimento) {
                  dataHoraRealTransacao = resultadoPix.transacaoPix.dataHoraMovimento;
              } else if (resultadoPix.dataHoraSolicitacao) {
                  dataHoraRealTransacao = resultadoPix.dataHoraSolicitacao;
              }

          } else if (nomeBanco.includes('itaú') || nomeBanco.includes('itau')) {
                const CONTA_REAL_ITAU = process.env.ITAU_PIX_CONTA_REAL;
                const ID_CLIENTE_PAGADOR = process.env.ITAU_PIX_CLIENTE_ID_REAL;
                if (!CONTA_REAL_ITAU || !ID_CLIENTE_PAGADOR) throw new Error("Configuração PIX Itaú incompleta.");

                const { data: contaRealInfo } = await supabase.from("contas_bancarias").select("*").eq("conta_corrente", CONTA_REAL_ITAU).single();
                const { data: dadosPagador } = await supabase.from("clientes").select("cnpj").eq("id", ID_CLIENTE_PAGADOR).single();
                
                const pagadorDocumento = dadosPagador.cnpj.replace(/\D/g, "");
                const pagadorTipoPessoa = pagadorDocumento.length > 11 ? "J" : "F";

                const dadosPixItau = {
                    valor_pagamento: valorDebitado.toFixed(2),
                    data_pagamento: dataEfetivaDebito,
                    chave: contaDestino.chave_pix,
                    tipo_conta: "CC",
                    referencia_empresa: `OP-${id}`.substring(0, 20),
                    identificacao_comprovante: `Pgto Op ${id}`.substring(0, 100),
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
                pixEndToEndId = resultadoPix.cod_pagamento || "ENVIADO_ITAU";
          }
      }

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
      
      if(pixEndToEndId) {
          descricaoLancamento = `${descricaoLancamento}`;
      }

      // --- CORREÇÃO APLICADA AQUI ---
      // Formata a conta bancária de forma segura para string
      // Garante que agência e conta existam para evitar "undefined"
      const agenciaFmt = conta.agencia || '';
      const contaFmt = conta.conta_corrente || '';
      const nomeContaFormatado = `${conta.banco} - ${agenciaFmt}/${contaFmt}`;

      const { error: movError } = await supabase.from("movimentacoes_caixa").insert({
        operacao_id: id,
        data_movimento: dataEfetivaDebito,
        created_at: dataHoraRealTransacao, 
        descricao: descricaoLancamento,
        valor: -Math.abs(valorDebitado), // Garante que é negativo (Débito)
        categoria: "Pagamento de Borderô",
        conta_bancaria: nomeContaFormatado, // Usa a string formatada seguramente
        empresa_associada: operacao.cliente.nome,
        transaction_id: pixEndToEndId,
        natureza: "Aquisição de Direitos Creditórios" 
      });

      if (movError) {
          console.error("Erro ao inserir movimentação financeira:", movError);
          throw new Error("Falha ao registrar o débito no fluxo de caixa.");
      }
      // --- FIM DA CORREÇÃO ---

      await supabase
        .from("operacoes")
        .update({ 
            status: "Aprovada", 
            conta_bancaria_id,
            valor_liquido: novoValorLiquido,
            valor_total_descontos: operacao.valor_total_descontos + totalDescontosAdicionais + valorTotalRecompra,
            data_aprovacao: dataEfetivaDebito 
        })
        .eq("id", id);

      if (recompraData && recompraData.ids && recompraData.ids.length > 0) {
          await supabase
              .from('duplicatas')
              .update({
                  status_recebimento: 'Recebido',
                  data_liquidacao: recompraData.dataLiquidacao
              })
              .in('id', recompraData.ids);
      }

    } else {
      await supabase.from("duplicatas").delete().eq("operacao_id", id);
      await supabase.from("operacoes").update({ status: status }).eq("id", id);
    }

    const { data: clienteUser } = await supabase.from("users").select("id").eq("cliente_id", operacao.cliente.id).single();
    if (clienteUser) {
      await supabase.from("notifications").insert({
        user_id: clienteUser.id,
        title: `Sua Operação #${id} foi ${status}`,
        message: `A operação no valor de R$ ${operacao.valor_liquido.toFixed(
          2
        )} foi ${status.toLowerCase()} pela nossa equipe.`,
        link: "/portal/dashboard",
      });

      if (operacao.cliente.email) {
        await sendOperationStatusEmail({
          clienteNome: operacao.cliente.nome,
          operacaoId: id,
          status: status,
          recipientEmail: operacao.cliente.email,
        });
      }
    }

    return NextResponse.json({ 
        message: `Operação ${status.toLowerCase()} com sucesso.`,
        transactionId: pixEndToEndId,
        descricao: descricaoLancamento
    }, { status: 200 });
  } catch (error) {
    console.error("Erro ao atualizar status da operação:", error);
    return NextResponse.json({ message: error.message || "Erro interno do servidor" }, { status: 500 });
  }
}