// src/app/api/lancamentos/pix/route.js
import { NextResponse } from "next/server";
import { supabase } from "@/app/utils/supabaseClient";
import jwt from "jsonwebtoken";
import { getInterAccessToken, enviarPixInter } from "@/app/lib/interService";
import { getItauAccessToken, enviarPixItau } from "@/app/lib/itauService";
import { format } from "date-fns"; // Apenas 'format' é necessário

export async function POST(request) {
  try {
    const token = request.headers.get("Authorization")?.split(" ")[1];
    if (!token)
      return NextResponse.json({ message: "Não autorizado" }, { status: 401 });
    jwt.verify(token, process.env.JWT_SECRET);

    const body = await request.json();
    const {
      valor, // Vem como número do frontend (ex: 5)
      descricao,
      contaOrigem,
      empresaAssociada,
      pix,
      operacao_id,
    } = body;

    console.log(
      "[LOG PIX] Payload recebido pela API:",
      JSON.stringify(body, null, 2)
    );

    if (!valor || !descricao || !contaOrigem || !pix || !pix.chave) {
      return NextResponse.json(
        { message: "Todos os campos são obrigatórios para o PIX." },
        { status: 400 }
      );
    }

    // 1. Busca dados da conta de origem (só para saber o banco)
    console.log(`[LOG PIX] Buscando conta selecionada: ${contaOrigem}`);
    const { data: contaInfoSelecionada, error: contaError } = await supabase
      .from("contas_bancarias")
      .select("banco")
      .eq("conta_corrente", contaOrigem)
      .single();

    if (contaError || !contaInfoSelecionada) {
      console.error(
        `[ERRO PIX] Conta selecionada (${contaOrigem}) não encontrada. Erro:`,
        contaError
      );
      throw new Error(
        `Conta de origem (${contaOrigem}) não encontrada no cadastro de contas.`
      );
    }

    console.log(
      "[LOG PIX] Banco da conta selecionada:",
      contaInfoSelecionada.banco
    );

    // 2. Prepara a chave PIX
    let chaveFinal = pix.chave;
    if (pix.tipo === "Telefone") {
      const numeros = pix.chave.replace(/\D/g, "");
      chaveFinal =
        numeros.length >= 10 && !numeros.startsWith("+55")
          ? `+55${numeros}`
          : numeros;
    }

    let resultadoPix;
    let pixEndToEndId;
    let nomeContaCompletoParaSalvar;
    const dataPagamentoHoje = new Date(); // Data/Hora atual

    const banco = contaInfoSelecionada.banco.toLowerCase();

    if (banco.includes("inter")) {
      // --- LÓGICA DO INTER (sem alteração) ---
      console.log("[LOG PIX INTER] Iniciando fluxo de pagamento PIX Inter.");

      const { data: contaInter, error: contaInterError } = await supabase
        .from("contas_bancarias")
        .select("*")
        .eq("conta_corrente", contaOrigem)
        .single();

      if (contaInterError)
        throw new Error("Erro ao buscar dados da conta Inter.");
      nomeContaCompletoParaSalvar = `${contaInter.banco} - ${contaInter.agencia}/${contaInter.conta_corrente}`;

      const dadosPixInter = {
        // Inter aceita número
        valor: parseFloat(valor.toFixed(2)),
        dataPagamento: format(dataPagamentoHoje, "yyyy-MM-dd"),
        descricao: descricao,
        destinatario: {
          tipo: "CHAVE",
          chave: chaveFinal,
        },
      };

      const tokenInter = await getInterAccessToken();
      resultadoPix = await enviarPixInter(
        tokenInter.access_token,
        dadosPixInter,
        contaOrigem
      );

      console.log(
        "[DEBUG] Resposta Inter:",
        JSON.stringify(resultadoPix, null, 2)
      );
      pixEndToEndId = resultadoPix.transacaoPix?.endToEnd;
    } else if (banco.includes("itaú") || banco.includes("itau")) {
      // --- LÓGICA DO ITAÚ (COM DADOS FIXOS E FORMATAÇÃO DE VALOR CORRIGIDA) ---
      console.log("[LOG PIX ITAÚ] Iniciando fluxo de pagamento PIX Itaú.");

      // 1. Busca os dados da CONTA REAL (via .env)
      const CONTA_REAL_ITAU = process.env.ITAU_PIX_CONTA_REAL;
      if (!CONTA_REAL_ITAU) {
        throw new Error(
          "Variável de ambiente ITAU_PIX_CONTA_REAL não configurada."
        );
      }
      console.log(
        `[LOG PIX ITAÚ] Buscando dados da conta REAL: ${CONTA_REAL_ITAU}`
      );

      const { data: contaRealInfo, error: contaRealError } = await supabase
        .from("contas_bancarias")
        .select("*")
        .eq("conta_corrente", CONTA_REAL_ITAU)
        .single();

      if (contaRealError || !contaRealInfo) {
        throw new Error(
          `A conta REAL do Itaú (${CONTA_REAL_ITAU}) não foi encontrada.`
        );
      }

      nomeContaCompletoParaSalvar = `${contaRealInfo.banco} - ${contaRealInfo.agencia}/${contaRealInfo.conta_corrente}`;

      // 2. Busca o CNPJ do PAGADOR REAL (via .env)
      const ID_CLIENTE_PAGADOR = process.env.ITAU_PIX_CLIENTE_ID_REAL;
      if (!ID_CLIENTE_PAGADOR) {
        throw new Error(
          "Variável de ambiente ITAU_PIX_CLIENTE_ID_REAL não configurada."
        );
      }
      console.log(
        `[LOG PIX ITAÚ] Buscando CNPJ do cliente pagador (ID: ${ID_CLIENTE_PAGADOR})`
      );

      const { data: dadosPagador, error: pagadorError } = await supabase
        .from("clientes")
        .select("cnpj")
        .eq("id", ID_CLIENTE_PAGADOR)
        .single();

      if (pagadorError || !dadosPagador || !dadosPagador.cnpj) {
        throw new Error(
          `O cadastro do cliente (ID: ${ID_CLIENTE_PAGADOR}) não possui um CNPJ preenchido.`
        );
      }

      const pagadorDocumento = dadosPagador.cnpj.replace(/\D/g, "");
      const pagadorTipoPessoa = pagadorDocumento.length > 11 ? "J" : "F";

      console.log(
        `[LOG PIX ITAÚ] Documento do pagador (limpo): ${pagadorDocumento}, Tipo: ${pagadorTipoPessoa}`
      );

      // 2.2. Monta o payload do Itaú
      // ... dentro do [POST] /api/lancamentos/pix/route.js
      // ...
      const dadosPixItau = {
        valor_pagamento: valor.toFixed(2),

        // 1. CORREÇÃO DA DATA (Voltar para o formato da documentação)
        data_pagamento: format(dataPagamentoHoje, "yyyy-MM-dd"), // <-- Use 'format' como no Inter
        chave: chaveFinal,
        referencia_empresa: descricao.substring(0, 20), // Ajustado para 20 (doc)
        identificacao_comprovante: descricao.substring(0, 100), // Ajustado para 100 (doc)
        informacoes_entre_usuarios: descricao.substring(0, 140),
        pagador: {
          tipo_conta: "CC",
          agencia: contaRealInfo.agencia.replace(/\D/g, ""),

          // 2. CORREÇÃO DA CONTA (Garantir 8 dígitos com padding)
          conta: contaRealInfo.conta_corrente
            .replace(/\D/g, "")
            .padStart(8, "0"), // <-- MUDANÇA AQUI

          tipo_pessoa: pagadorTipoPessoa,
          documento: pagadorDocumento,
          modulo_sispag: "Fornecedores", // (Correto, conforme a doc)
        },
      };
      // ...

      console.log(
        "[LOG PIX ITAÚ] Payload final a ser enviado para o Itaú:",
        JSON.stringify(dadosPixItau, null, 2)
      );

      const tokenItau = await getItauAccessToken();
      resultadoPix = await enviarPixItau(tokenItau.access_token, dadosPixItau);

      console.log(
        "[DEBUG] Resposta Itaú:",
        JSON.stringify(resultadoPix, null, 2)
      );
      pixEndToEndId = resultadoPix.cod_pagamento;
    } else {
      throw new Error(
        `Banco "${contaInfoSelecionada.banco}" não configurado para pagamentos PIX.`
      );
    }

    // 3. Lógica de salvar no banco de dados

    let descricaoLancamento = `${descricao}`;
    const complementMatch = descricao.match(/^Complemento Borderô #(\d+)$/);

    if (complementMatch) {
      const operacaoIdFromDesc = complementMatch[1];
      const { data: operacaoData } = await supabase
        .from("operacoes")
        .select("*, cliente:clientes(ramo_de_atividade)")
        .eq("id", operacaoIdFromDesc)
        .single();
      if (operacaoData) {
        const { data: duplicatas } = await supabase
          .from("duplicatas")
          .select("nf_cte")
          .eq("operacao_id", operacaoIdFromDesc);
        if (duplicatas && duplicatas.length > 0) {
          const docType =
            operacaoData.cliente?.ramo_de_atividade === "Transportes"
              ? "CTe"
              : "NF";
          const numerosDoc = [
            ...new Set(duplicatas.map((d) => d.nf_cte.split(".")[0])),
          ].join(", ");
          descricaoLancamento = `Complemento Borderô ${docType} ${numerosDoc}`;
        }
      }
    }

    const movementPayload = {
      data_movimento: format(dataPagamentoHoje, "yyyy-MM-dd"), // Salva no banco só a data
      descricao: descricaoLancamento,
      valor: -Math.abs(valor),
      conta_bancaria: nomeContaCompletoParaSalvar,
      categoria: "Pagamento PIX",
      empresa_associada: empresaAssociada,
      transaction_id: pixEndToEndId,
      operacao_id: operacao_id || (complementMatch ? complementMatch[1] : null),
    };

    console.log(
      "[DEBUG] Payload para movimentacoes_caixa (pix/route.js):",
      JSON.stringify(movementPayload, null, 2)
    );

    const { error: insertError } = await supabase
      .from("movimentacoes_caixa")
      .insert(movementPayload);

    if (insertError) {
      console.error(
        "ERRO CRÍTICO: PIX enviado mas falhou ao registrar no banco de dados.",
        insertError
      );
      return NextResponse.json(
        {
          message: `PIX enviado com sucesso (ID: ${pixEndToEndId}), mas falhou ao registrar a movimentação. Por favor, registre manualmente.`,
          pixResult: resultadoPix,
        },
        { status: 207 }
      );
    }

    return NextResponse.json(
      { success: true, pixResult: resultadoPix },
      { status: 201 }
    );
  } catch (error) {
    console.error("Erro na API de Lançamento PIX:", error);

    let errorMessage = error.message || "Erro interno do servidor";

    try {
      const errorJsonMatch = errorMessage.match(/(\[.*\]|\{.*\})/); // Tenta pegar JSON em array ou objeto
      if (errorJsonMatch) {
        const errorJson = JSON.parse(errorJsonMatch[0]);
        if (Array.isArray(errorJson) && errorJson.length > 0) {
          // Erro de validação (ex: 400)
          errorMessage = errorJson
            .map((e) => `${e.campo}: ${e.erro}`)
            .join(", ");
        } else if (
          errorJson.motivo_recusa &&
          errorJson.motivo_recusa.length > 0
        ) {
          // Erro de processamento (ex: 422)
          errorMessage = errorJson.motivo_recusa[0].nome;
        } else if (errorJson.mensagem) {
          // Outros erros (ex: 500)
          errorMessage = errorJson.mensagem;
        }
      }
    } catch (e) {
      // Não era JSON, segue com a mensagem original
    }

    return NextResponse.json(
      { message: `Erro: ${errorMessage}` },
      { status: 500 }
    );
  }
}
