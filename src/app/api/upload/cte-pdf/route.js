import { NextResponse } from "next/server";
import { supabase } from "@/app/utils/supabaseClient";
import jwt from "jsonwebtoken";
import PDFParser from "pdf2json";

export const runtime = "nodejs";

// Função para extrair CNPJ do Tomador ou Remetente
function extrairCnpjTomadorOuRemetente(texto) {
  const campos = ["TOMADOR DO SERVIÇO", "REMETENTE"];

  for (const campo of campos) {
    const regexCampo = new RegExp(`${campo}(.+?)`, "i");
    const matchCampo = texto.match(regexCampo);
    if (matchCampo) {
      const trecho = matchCampo[1];
      const cnpjMatch = trecho.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}|\d{14}/);
      if (cnpjMatch) {
        return cnpjMatch[0].replace(/\D/g, ""); // só números
      }
    }
  }
  return null;
}

export async function POST(request) {
  try {
    const token = request.headers.get("Authorization")?.split(" ")[1];
    if (!token)
      return NextResponse.json({ message: "Não autorizado" }, { status: 401 });
    jwt.verify(token, process.env.JWT_SECRET);

    const formData = await request.formData();
    const file = formData.get("file");
    if (!file) {
      return NextResponse.json({ message: "Arquivo não encontrado" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    const pdfParser = new PDFParser(this, 1);
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

    // Extrair CNPJ do Tomador ou Remetente
    const cnpjSacado = extrairCnpjTomadorOuRemetente(pdfText);

    if (!cnpjSacado) {
      throw new Error("Não foi possível extrair o CNPJ do Tomador ou Remetente do CT-e.");
    }

    // --- Captura dados básicos do CT-e ---
    const numeroCteMatch = pdfText.match(/NÚMERO\s+(\d+)\s+DATA E HORA DE EMISSÃO/i);
    const dataEmissaoMatch = pdfText.match(/DATA E HORA DE EMISSÃO\s+(\d{2}\/\d{2}\/\d{4})/i);
    const valorTotalMatch = pdfText.match(/VALOR TOTAL DA PRESTAÇÃO DO SERVIÇO\s+([\d.,]+)/i);

    // Cedente fixo
    const cedenteNomeFixo = "TRANSREC CARGAS LTDA";

    // Busca cedente no Supabase
    const { data: cedenteData } = await supabase
      .from("clientes")
      .select("id, nome, cnpj")
      .eq("nome", cedenteNomeFixo)
      .single();

    if (!cedenteData) {
      throw new Error(`O cedente padrão "${cedenteNomeFixo}" não foi encontrado no seu cadastro de clientes.`);
    }

    // Busca sacado pelo CNPJ extraído
    const { data: sacadoData } = await supabase
      .from("sacados")
      .select("*, condicoes_pagamento(*)")
      .eq("cnpj", cnpjSacado)
      .single();

    const responseData = {
      numeroNf: numeroCteMatch ? numeroCteMatch[1] : "",
      dataNf: dataEmissaoMatch ? dataEmissaoMatch[1].split("/").reverse().join("-") : "",
      valorNf: valorTotalMatch ? valorTotalMatch[1] : "0,00",
      parcelas: "1",
      prazos: "",
      peso: "",
      clienteSacado: sacadoData?.nome || "",
      emitente: {
        id: cedenteData.id,
        nome: cedenteData.nome,
        cnpj: cedenteData.cnpj,
      },
      emitenteExiste: true,
      sacado: {
        id: sacadoData?.id || null,
        nome: sacadoData?.nome || "",
        cnpj: sacadoData?.cnpj || cnpjSacado,
        condicoes_pagamento: sacadoData?.condicoes_pagamento || [],
      },
      sacadoExiste: !!sacadoData,
    };

    return NextResponse.json(responseData, { status: 200 });
  } catch (error) {
    console.error("Erro ao processar PDF CT-e:", error);
    return NextResponse.json({ message: error.message || "Erro interno do servidor" }, { status: 500 });
  }
}
