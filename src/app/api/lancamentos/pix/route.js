// src/app/api/lancamentos/pix/route.js
import { NextResponse } from "next/server";
import { supabase } from "@/app/utils/supabaseClient";
import jwt from "jsonwebtoken";
import { getInterAccessToken, enviarPixInter } from "@/app/lib/interService";
import { format } from "date-fns";

export async function POST(request) {
  try {
    const token = request.headers.get("Authorization")?.split(" ")[1];
    if (!token)
      return NextResponse.json({ message: "Não autorizado" }, { status: 401 });
    jwt.verify(token, process.env.JWT_SECRET);

    const body = await request.json();
    const {
      valor,
      descricao,
      contaOrigem,
      empresaAssociada,
      pix,
      operacao_id,
    } = body;

    if (!valor || !descricao || !contaOrigem || !pix || !pix.chave) {
      return NextResponse.json(
        { message: "Todos os campos são obrigatórios para o PIX." },
        { status: 400 }
      );
    }

    const { data: contaInfo, error: contaError } = await supabase
      .from("contas_bancarias")
      .select("*")
      .eq("conta_corrente", contaOrigem)
      .single();

    if (contaError || !contaInfo) {
      throw new Error(
        `Conta de origem (${contaOrigem}) não encontrada no cadastro de contas.`
      );
    }

    const nomeContaCompleto = `${contaInfo.banco} - ${contaInfo.agencia}/${contaInfo.conta_corrente}`;

    let chaveFinal = pix.chave;
    if (pix.tipo === "Telefone") {
      const numeros = pix.chave.replace(/\D/g, "");
      chaveFinal =
        numeros.length >= 10 && !numeros.startsWith("+55")
          ? `+55${numeros}`
          : numeros;
    }

    const dadosPix = {
      valor: parseFloat(valor.toFixed(2)),
      dataPagamento: format(new Date(), "yyyy-MM-dd"),
      descricao: descricao,
      destinatario: {
        tipo: "CHAVE",
        chave: chaveFinal,
      },
    };

    const tokenInter = await getInterAccessToken();
    const resultadoPix = await enviarPixInter(
      tokenInter.access_token,
      dadosPix,
      contaOrigem
    );

    // --- INÍCIO DA CORREÇÃO E DEBUG ---
    // Adicionamos um log para ver a resposta completa da API do Inter nos logs da Vercel
    console.log(
      "[DEBUG] Resposta completa da API PIX Inter (Lançamento Manual):",
      JSON.stringify(resultadoPix, null, 2)
    );

    // Capturamos o ID da transação. A API do Inter retorna este valor como "endToEndId".
    // Correção para acessar o endToEnd aninhado. Note que a API do Inter retorna "endToEnd" e não "endToEndId" na consulta.
    const pixEndToEndId = resultadoPix.transacaoPix?.endToEnd;

    if (!pixEndToEndId) {
      console.warn(
        "[AVISO] O campo 'endToEnd' não foi encontrado em 'transacaoPix' na resposta da API do Inter."
      );
    }
    // --- FIM DA CORREÇÃO E DEBUG ---

    let descricaoLancamento = `PIX Enviado - ${descricao}`;
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
      data_movimento: new Date().toISOString().split("T")[0],
      descricao: descricaoLancamento,
      valor: -Math.abs(valor),
      conta_bancaria: nomeContaCompleto,
      // Altera a categoria para algo mais específico para o lançamento manual
      categoria: "Pagamento PIX",
      empresa_associada: empresaAssociada,
      transaction_id: pixEndToEndId, // Salva o ID capturado
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
          message: `PIX enviado com sucesso (ID: ${resultadoPix.endToEndId}), mas falhou ao registrar a movimentação. Por favor, registre manualmente.`,
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
    return NextResponse.json(
      { message: error.message || "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
