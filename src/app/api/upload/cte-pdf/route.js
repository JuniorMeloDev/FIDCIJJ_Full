import { NextResponse } from "next/server";
import { supabase } from "@/app/utils/supabaseClient";
import jwt from "jsonwebtoken";
import PDFParser from "pdf2json";

export const runtime = "nodejs";

// --- utils de normalização e busca ---
function normalize(str) {
  return (str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

// captura CNPJ formatado ou 14 dígitos; NÃO usa \b no fim (pois às vezes vem colado em "IE")
const CNPJ_ANY_RE = /(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}|\d{14})(?!\d)/;

// procura um CNPJ até `winFwd` chars DEPOIS do índice e, se falhar, até `winBack` ANTES
function findCnpjAround(normText, idx, winFwd = 1200, winBack = 500) {
  // para frente
  const forward = normText.slice(idx, idx + winFwd);
  const f = forward.match(CNPJ_ANY_RE);
  if (f) return f[1].replace(/\D/g, "");

  // para trás (pega o último CNPJ antes do rótulo, se houver)
  const back = normText.slice(Math.max(0, idx - winBack), idx + 50);
  const allBack = [...back.matchAll(new RegExp(CNPJ_ANY_RE, "g"))];
  if (allBack.length) return allBack[allBack.length - 1][1].replace(/\D/g, "");

  return null;
}

function cnpjNearLabel(originalText, labels, winFwd = 1200, winBack = 500) {
  const norm = normalize(originalText);
  for (const rawLabel of labels) {
    const label = normalize(rawLabel);
    const idx = norm.indexOf(label);
    if (idx !== -1) {
      const found = findCnpjAround(norm, idx + label.length, winFwd, winBack);
      if (found) return found;
    }
  }
  return null;
}

function extrairValorTotal(text) {
  const m = text.match(/VALOR TOTAL DA PRESTA[ÇC][ÃA]O DO SERVI[ÇC]O\s*([\d.,]+)/i);
  if (!m) return { valorStr: "", valorNum: 0 };
  const valorStr = m[1];
  const num = parseFloat(valorStr.replace(/\./g, "").replace(",", "."));
  return { valorStr, valorNum: Number.isFinite(num) ? num : 0 };
}

function extrairDataEmissao(text) {
  const m = text.match(/DATA E HORA DE EMISS[ÃA]O\s*([0-3]?\d\/[01]?\d\/\d{4})/i);
  return m ? m[1].split("/").reverse().join("-") : "";
}

function extrairCnpjEmitente(text) {
  const m = text.match(/CNPJ[:\s]*([\d./-]{14,18})/i);
  return m ? m[1].replace(/\D/g, "") : null;
}

// tenta extrair o NOME do tomador (opcional, ajuda seu front caso não exista no banco)
function extrairNomeTomador(originalText) {
  const norm = normalize(originalText);
  // pega tudo entre o rótulo e "ENDERECO|MUNICIPIO|UF|CEP|CPF/CNPJ"
  const r = /TOMADOR DO SERVIC[O]\s*([A-Z0-9 .,&\-]+?)\s+(ENDERECO|MUNICIPIO|UF|CEP|CPF\/CNPJ)/i;
  const m = norm.match(r);
  if (m && m[1]) {
    // volta para o texto original aproximando pelos mesmos limites (melhor esforço)
    const rough = m[1].trim();
    // como fallback, retorna a versão normalizada mesmo
    return rough;
  }
  return "";
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
        // mantém quebras de linha; compacta apenas espaços/tabs
        pdfText = pdfParser.getRawTextContent().replace(/[ \t]+/g, " ").trim();
        console.log("Texto extraído do PDF:", pdfText);
        resolve();
      });
      pdfParser.parseBuffer(buffer);
    });

    // --- Emitente (cliente/cedente) pelo CNPJ do cabeçalho ---
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

    if (!cedenteData) {
      // fallback por nome fixo
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

    // --- Sacado (Tomador ou Remetente) por CNPJ ---
    let cnpjSacado =
      cnpjNearLabel(pdfText, ["TOMADOR DO SERVIÇO", "TOMADOR DO SERVICO"], 1400, 600) ||
      cnpjNearLabel(pdfText, ["REMETENTE"], 1400, 600);

    // fallback global com janela limitada (evita pegar CNPJ do emitente)
    if (!cnpjSacado) {
      const norm = normalize(pdfText);
      // pega CNPJ até 1500 chars após TOMADOR
      const tomIdx = norm.indexOf("TOMADOR DO SERVICO");
      if (tomIdx !== -1) {
        const slice = norm.slice(tomIdx, tomIdx + 1500);
        const m = slice.match(CNPJ_ANY_RE);
        if (m) cnpjSacado = m[1].replace(/\D/g, "");
      }
    }
    if (!cnpjSacado) {
      const norm = normalize(pdfText);
      const remIdx = norm.indexOf("REMETENTE");
      if (remIdx !== -1) {
        const slice = norm.slice(remIdx, remIdx + 1500);
        const m = slice.match(CNPJ_ANY_RE);
        if (m) cnpjSacado = m[1].replace(/\D/g, "");
      }
    }

    if (!cnpjSacado) {
      throw new Error("Não foi possível extrair o CNPJ do Tomador ou Remetente do CT-e.");
    }

    const { data: sacadoData } = await supabase
      .from("sacados")
      .select("*, condicoes_pagamento(*)")
      .eq("cnpj", cnpjSacado)
      .single();

    const nomeTomador = sacadoData?.nome || extrairNomeTomador(pdfText) || "";

    // --- Dados do CT-e ---
    const numeroCteMatch = pdfText.match(/N[ÚU]MERO\s*([0-9]{1,10})\s*DATA E HORA DE EMISS[ÃA]O/i);
    const numeroNf = numeroCteMatch ? numeroCteMatch[1] : "";
    const dataNf = extrairDataEmissao(pdfText);
    const { valorStr, valorNum } = extrairValorTotal(pdfText);

    const responseData = {
      numeroNf,
      dataNf, // YYYY-MM-DD
      valorTotal: valorNum,  // number
      valorNf: valorStr || "", // string
      parcelas: "1",
      prazos: "",
      peso: "",
      clienteSacado: nomeTomador,
      emitente: {
        id: cedenteData.id,
        nome: cedenteData.nome,
        cnpj: cedenteData.cnpj,
      },
      emitenteExiste: true,
      sacado: {
        id: sacadoData?.id || null,
        nome: nomeTomador,
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
