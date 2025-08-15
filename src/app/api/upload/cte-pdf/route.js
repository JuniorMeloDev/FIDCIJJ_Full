import { NextResponse } from "next/server";
import { supabase } from "@/app/utils/supabaseClient";
import jwt from "jsonwebtoken";
import PDFParser from "pdf2json";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const token = request.headers.get("Authorization")?.split(" ")[1];
    if (!token)
      return NextResponse.json({ message: "Não autorizado" }, { status: 401 });
    jwt.verify(token, process.env.JWT_SECRET);

    const formData = await request.formData();
    const file = formData.get("file");
    if (!file) {
      return NextResponse.json(
        { message: "Arquivo não encontrado" },
        { status: 400 }
      );
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
        console.log("Texto extraído do PDF:", pdfText); // Adicione este log
        resolve();
      });
      pdfParser.parseBuffer(buffer);
    });

    // --- EXPRESSÕES REGULARES CORRIGIDAS E MAIS PRECISAS ---
    const numeroCteMatch = pdfText.match(
      /NÚMERO\s+(\d+)\s+DATA E HORA DE EMISSÃO/i
    );
    const dataEmissaoMatch = pdfText.match(
      /DATA E HORA DE EMISSÃO\s+(\d{2}\/\d{2}\/\d{4})/i
    );
    const valorTotalMatch = pdfText.match(
      /VALOR TOTAL DA PRESTAÇÃO DO SERVIÇO\s+([\d.,]+)/i
    );

    // --- LÓGICA DO CEDENTE FIXO E BUSCA DO SACADO (REMETENTE) PELO NOME ---
    const cedenteNomeFixo = "TRANSREC CARGAS LTDA";
    // Tenta extrair o nome do Tomador do Serviço
    // Regex para capturar apenas o nome (até o primeiro endereço, município ou CNPJ)
    let sacadoNomeExtraido = null;
const tomadorMatch = pdfText.match(/TOMADOR DO SERVIÇO\s*([A-Z0-9\s\-.&]+?)(?=\sROD)/i);
if (tomadorMatch) {
  sacadoNomeExtraido = tomadorMatch[1].trim();
} else {
  const remetenteMatch = pdfText.match(/REMETENTE\s*([A-Z0-9\s\-.&]+?)(?=\sROD)/i);
  if (remetenteMatch) {
    sacadoNomeExtraido = remetenteMatch[1].trim();
  }
}

    if (!sacadoNomeExtraido) {
      throw new Error(
        "Não foi possível extrair o nome do Tomador ou Remetente do CT-e."
      );
    }

    // Busca os dados do Cedente Fixo e do Sacado (pelo nome) no Supabase
    const { data: cedenteData } = await supabase
      .from("clientes")
      .select("id, nome, cnpj")
      .eq("nome", cedenteNomeFixo)
      .single();
    const { data: sacadoData } = await supabase
      .from("sacados")
      .select("*, condicoes_pagamento(*)") // Pede para trazer as condições de pagamento
      .eq("nome", sacadoNomeExtraido)
      .single();

    if (!cedenteData) {
      throw new Error(
        `O cedente padrão "${cedenteNomeFixo}" não foi encontrado no seu cadastro de clientes.`
      );
    }

    // Monta a resposta seguindo as suas regras de negócio
    const responseData = {
      numeroNf: numeroCteMatch ? numeroCteMatch[1] : "",
      dataNf: dataEmissaoMatch
        ? dataEmissaoMatch[1].split("/").reverse().join("-")
        : "",
      valorNf: valorTotalMatch ? valorTotalMatch[1] : "0,00",
      parcelas: "1",
      prazos: "",
      peso: "",
      clienteSacado: sacadoNomeExtraido,
      emitente: {
        // O emitente agora é o nosso Cedente Fixo
        id: cedenteData.id,
        nome: cedenteData.nome,
        cnpj: cedenteData.cnpj,
      },
      emitenteExiste: true,
      sacado: {
        id: sacadoData?.id || null,
        nome: sacadoNomeExtraido,
        cnpj: sacadoData?.cnpj || "", // Pega o CNPJ do banco se encontrar o sacado
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
