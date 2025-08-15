import { NextResponse } from "next/server";
import { supabase } from "@/app/utils/supabaseClient";
import jwt from "jsonwebtoken";
import PDFParser from "pdf2json";

export const runtime = "nodejs";

// Função segura para extrair CNPJ do Tomador
function extrairCnpjTomador(texto) {
  // Tenta localizar trecho do Tomador
  let trecho = null;

  const tomadorMatch = texto.match(/TOMADOR DO SERVIÇO(.+)/i);
  if (tomadorMatch) {
    trecho = tomadorMatch[1];
  } else {
    const remetenteMatch = texto.match(/REMETENTE(.+)/i);
    if (remetenteMatch) trecho = remetenteMatch[1];
  }

  if (!trecho) return null;

  // Procura o primeiro CNPJ no trecho encontrado
  const cnpjMatch = trecho.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}|\d{14}/);
  if (!cnpjMatch) return null;

  return cnpjMatch[0].replace(/\D/g, "");
}


export async function POST(request) {
  try {
    // --- Autenticação ---
    const token = request.headers.get("Authorization")?.split(" ")[1];
    if (!token)
      return NextResponse.json({ message: "Não autorizado" }, { status: 401 });
    jwt.verify(token, process.env.JWT_SECRET);

    // --- Arquivo PDF ---
    const formData = await request.formData();
    const file = formData.get("file");
    if (!file) {
      return NextResponse.json(
        { message: "Arquivo não encontrado" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const pdfParser = new PDFParser();

    let pdfText = "";
    await new Promise((resolve, reject) => {
      pdfParser.on("pdfParser_dataError", (errData) => {
        console.error(errData.parserError);
        reject(new Error("Erro ao ler o ficheiro PDF."));
      });
      pdfParser.on("pdfParser_dataReady", () => {
        pdfText = pdfParser.getRawTextContent().replace(/\s+/g, " ").trim();
        console.log("Texto extraído do PDF:", pdfText);
        resolve();
      });
      pdfParser.parseBuffer(buffer);
    });

    // --- Captura ---
    const numeroCteMatch = pdfText.match(
      /NÚMERO\s+(\d+)\s+DATA E HORA DE EMISSÃO/i
    );
    const dataEmissaoMatch = pdfText.match(
      /DATA E HORA DE EMISSÃO\s+(\d{2}\/\d{2}\/\d{4})/i
    );
    const valorTotalMatch = pdfText.match(
      /VALOR TOTAL DA PRESTAÇÃO DO SERVIÇO\s+([\d.,]+)/i
    );

    // Cedente fixo
    const cedenteNomeFixo = "TRANSREC CARGAS LTDA";

    // --- Extrair CNPJ do Tomador ---
    const cnpjTomador = extrairCnpjTomador(pdfText);
    if (!cnpjTomador) {
      throw new Error("Não foi possível extrair o CNPJ do Tomador do CT-e.");
    }

    // --- Buscar no banco ---
    const { data: cedenteData } = await supabase
      .from("clientes")
      .select("id, nome, cnpj")
      .eq("nome", cedenteNomeFixo)
      .single();

    const { data: sacadoData } = await supabase
      .from("sacados")
      .select("*, condicoes_pagamento(*)")
      .eq("cnpj", cnpjTomador)
      .single();

    if (!cedenteData) {
      throw new Error(
        `O cedente padrão "${cedenteNomeFixo}" não foi encontrado.`
      );
    }

    // Nome do sacado (para preencher na operacao-bordero)
    const nomeSacado = sacadoData?.nome || "SACADO NÃO ENCONTRADO";

    // --- Resposta ---
    const responseData = {
      numeroNf: numeroCteMatch ? numeroCteMatch[1] : "",
      dataNf: dataEmissaoMatch
        ? dataEmissaoMatch[1].split("/").reverse().join("-")
        : "",
      valorNf: valorTotalMatch ? valorTotalMatch[1] : "0,00",
      parcelas: "1",
      prazos: "",
      peso: "",
      clienteSacado: nomeSacado, // volta nome para sua tela
      emitente: {
        id: cedenteData.id,
        nome: cedenteData.nome,
        cnpj: cedenteData.cnpj,
      },
      emitenteExiste: true,
      sacado: {
        id: sacadoData?.id || null,
        nome: nomeSacado,
        cnpj: cnpjTomador,
        condicoes_pagamento: sacadoData?.condicoes_pagamento || [],
      },
      sacadoExiste: !!sacadoData,
    };

    return NextResponse.json(responseData, { status: 200 });
  } catch (error) {
    console.error("Erro ao processar PDF CT-e:", error);
    return NextResponse.json(
      { message: error.message || "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
