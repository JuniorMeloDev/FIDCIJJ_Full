import { NextResponse } from "next/server";
import { supabase } from "@/app/utils/supabaseClient";
import jwt from "jsonwebtoken";
import PDFParser from "pdf2json";

export const runtime = "nodejs";

/** Normaliza o texto pra facilitar regex (remove acentos, caixa alta) */
function normalize(str) {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

/** Extrai o primeiro CNPJ que aparecer em até `win` chars APOS um rótulo; se falhar, tenta até `back` chars ANTES */
function cnpjNearLabel(text, labels, win = 800, back = 300) {
  const norm = normalize(text);
  for (const rawLabel of labels) {
    const label = normalize(rawLabel);
    const idx = norm.indexOf(label);
    if (idx !== -1) {
      // 1) procurar PARA FRENTE
      const forwardSlice = norm.slice(idx, idx + win);
      const fwd = forwardSlice.match(/\b(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}|\d{14})\b/);
      if (fwd) return fwd[1].replace(/\D/g, "");

      // 2) fallback: procurar um CNPJ imediatamente ANTES do rótulo (alguns layouts trazem o CNPJ antes da palavra)
      const backSlice = norm.slice(Math.max(0, idx - back), idx + 50);
      const allBack = [...backSlice.matchAll(/\b(\d{14})\b/g)];
      if (allBack.length) return allBack[allBack.length - 1][1]; // último 14 dígitos encontrados perto do rótulo
    }
  }
  return null;
}

/** Extrai o valor (número) a partir do texto "VALOR TOTAL DA PRESTAÇÃO DO SERVIÇO" */
function extrairValorTotal(text) {
  const m = text.match(/VALOR TOTAL DA PRESTA[ÇC][ÃA]O DO SERVI[ÇC]O\s*([\d.,]+)/i);
  if (!m) return { valorStr: "", valorNum: 0 };
  const valorStr = m[1];
  const num = parseFloat(valorStr.replace(/\./g, "").replace(",", "."));
  return { valorStr, valorNum: Number.isFinite(num) ? num : 0 };
}

/** Extrai data de emissão (DD/MM/AAAA) próximo do rótulo */
function extrairDataEmissao(text) {
  const m = text.match(/DATA E HORA DE EMISS[ÃA]O\s*([0-3]?\d\/[01]?\d\/\d{4})/i);
  return m ? m[1].split("/").reverse().join("-") : "";
}

/** Tenta pegar o CNPJ do emitente a partir do padrão "CNPJ:" (o primeiro costuma ser do emitente) */
function extrairCnpjEmitente(text) {
  const m = text.match(/CNPJ[:\s]*([\d./-]{14,18})/i);
  return m ? m[1].replace(/\D/g, "") : null;
}

export async function POST(request) {
  try {
    const token = request.headers.get("Authorization")?.split(" ")[1];
    if (!token) return NextResponse.json({ message: "Não autorizado" }, { status: 401 });
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
      pdfParser.on("pdfParser_dataError", (err) => {
        console.error(err?.parserError || err);
        reject(new Error("Erro ao ler o ficheiro PDF."));
      });
      pdfParser.on("pdfParser_dataReady", () => {
        // NÃO remova tudo para 1 espaço antes de extrair; só compacte múltiplos mantendo separadores
        pdfText = pdfParser.getRawTextContent().replace(/[ \t]+/g, " ").trim();
        console.log("Texto extraído do PDF:", pdfText);
        resolve();
      });
      pdfParser.parseBuffer(buffer);
    });

    // --- Emitente por CNPJ (mais confiável que nome fixo) ---
    const cnpjEmitente = extrairCnpjEmitente(pdfText);
    let cedenteData = null;

    if (cnpjEmitente) {
      const { data } = await supabase
        .from("clientes")
        .select("id, nome, cnpj")
        .eq("cnpj", cnpjEmitente)
        .single();
      cedenteData = data || null;
    }

    // Fallback: nome fixo se não achar por CNPJ
    if (!cedenteData) {
      const cedenteNomeFixo = "TRANSREC CARGAS LTDA";
      const { data } = await supabase
        .from("clientes")
        .select("id, nome, cnpj")
        .eq("nome", cedenteNomeFixo)
        .single();
      if (!data) {
        throw new Error(
          `Cedente não encontrado. Nem por CNPJ (emitente) nem pelo nome padrão "TRANSREC CARGAS LTDA".`
        );
      }
      cedenteData = data;
    }

    // --- Sacado (Tomador do Serviço ou Remetente) por CNPJ perto dos rótulos ---
    // Janela ampla para capturar depois do rótulo; PDF vem sem quebras confiáveis
    const cnpjSacado =
      cnpjNearLabel(pdfText, ["TOMADOR DO SERVIÇO", "TOMADOR DO SERVICO"], 900, 400) ||
      cnpjNearLabel(pdfText, ["REMETENTE"], 900, 400);

    if (!cnpjSacado) {
      throw new Error("Não foi possível extrair o CNPJ do Tomador ou Remetente do CT-e.");
    }

    const { data: sacadoData } = await supabase
      .from("sacados")
      .select("*, condicoes_pagamento(*)")
      .eq("cnpj", cnpjSacado)
      .single();

    // --- Campos básicos do CT-e ---
    const numeroCteMatch = pdfText.match(/N[ÚU]MERO\s*([0-9]{1,10})\s*DATA E HORA DE EMISS[ÃA]O/i);
    const numeroNf = numeroCteMatch ? numeroCteMatch[1] : "";

    const dataNf = extrairDataEmissao(pdfText);
    const { valorStr, valorNum } = extrairValorTotal(pdfText);

    const responseData = {
      // para seu front preencher
      numeroNf,
      dataNf, // YYYY-MM-DD
      // mando os dois formatos para compatibilidade com sua página
      valorTotal: valorNum, // número (ex.: 6000)
      valorNf: valorStr || "", // string (ex.: "6.000,00")
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
    return NextResponse.json(
      { message: error.message || "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
