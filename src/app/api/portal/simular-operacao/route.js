import { NextResponse } from "next/server";
import { supabase } from "@/app/utils/supabaseClient";
import jwt from "jsonwebtoken";
import { parseStringPromise } from "xml2js";
import PDFParser from "pdf2json";

// --- Funções de parsing de XML e PDF ---
const getVal = (obj, path) =>
  path.split(".").reduce((acc, key) => acc?.[key]?.[0], obj);

const parseXml = async (xmlText) => {
  // Modificado para não ignorar atributos, necessário para a chave da NF-e/CT-e (Id)
  const parsedXml = await parseStringPromise(xmlText, {
    explicitArray: true,
    ignoreAttrs: false, // Alterado para false
    tagNameProcessors: [
      (name) => name.replace(/^.*:/, ""),
      (name) => name.replace(/{.*}/, ""),
    ],
  });

  let numeroDoc,
    valorTotal,
    parcelas = [],
    emitNode,
    sacadoNode,
    dataEmissao,
    prazosString,
    chaveNfe;

  const infNFe =
    parsedXml?.NFe?.infNFe?.[0] ||
    parsedXml?.nfeProc?.[0]?.NFe?.[0]?.infNFe?.[0];
  if (infNFe) {
    chaveNfe = infNFe.$?.Id.replace("NFe", ""); // Extrai a chave do atributo Id
    numeroDoc = getVal(infNFe, "ide.nNF");
    valorTotal = parseFloat(getVal(infNFe, "total.ICMSTot.vNF") || 0);
    emitNode = infNFe.emit?.[0];
    sacadoNode = infNFe.dest?.[0];
    dataEmissao = getVal(infNFe, "ide.dhEmi")?.substring(0, 10);

    const cobr = infNFe.cobr?.[0];
    parcelas =
      cobr?.dup?.map((p) => ({ dataVencimento: getVal(p, "dVenc") })) || [];
  }

  const infCte =
    parsedXml?.cteProc?.CTe?.[0]?.infCte?.[0] || parsedXml?.CTe?.infCte?.[0];
  if (!infNFe && infCte) {
    chaveNfe = infCte.$?.Id.replace("CTe", ""); // Extrai a chave do atributo Id
    numeroDoc = getVal(infCte, "ide.nCT");
    valorTotal = parseFloat(getVal(infCte, "vPrest.vTPrest") || 0);
    emitNode = infCte.emit?.[0];
    dataEmissao = getVal(infCte, "ide.dhEmi")?.substring(0, 10);

    const toma =
      getVal(infCte, "ide.toma3.toma") || getVal(infCte, "ide.toma4.toma");
    switch (toma) {
      case "0":
        sacadoNode = infCte.rem?.[0];
        break;
      case "1":
        sacadoNode = infCte.exped?.[0];
        break;
      case "2":
        sacadoNode = infCte.receb?.[0];
        break;
      case "3":
        sacadoNode = infCte.dest?.[0];
        break;
      default:
        sacadoNode = infCte.rem?.[0];
    }
    parcelas = [];
  }

  if (!chaveNfe)
    throw new Error(
      "Não foi possível extrair a Chave de Acesso do documento XML."
    );

  const destCnpjCpf = getVal(sacadoNode, "CNPJ") || getVal(sacadoNode, "CPF");
  const { data: sacadoData } = await supabase
    .from("sacados")
    .select("*")
    .eq("cnpj", destCnpjCpf)
    .single();
  if (!sacadoData)
    throw new Error(
      `Sacado com CNPJ/CPF ${destCnpjCpf} não encontrado no sistema.`
    );

  // ... lógica de prazos ...
  if (
    parcelas.length === 0 &&
    sacadoData.condicoes_pagamento &&
    sacadoData.condicoes_pagamento.length > 0
  ) {
    const condicaoPadrao = sacadoData.condicoes_pagamento[0];
    prazosString = condicaoPadrao.prazos;
    parcelas = Array(condicaoPadrao.parcelas).fill({});
  } else {
    prazosString = parcelas
      .map((p) =>
        Math.ceil(
          Math.abs(new Date(p.dataVencimento) - new Date(dataEmissao)) /
            (1000 * 60 * 60 * 24)
        )
      )
      .join("/");
  }

  return {
    chave_nfe: chaveNfe,
    nfCte: numeroDoc,
    dataNf: dataEmissao,
    valorNf: valorTotal,
    clienteSacado: sacadoData.nome,
    parcelas: parcelas.length > 0 ? String(parcelas.length) : "1",
    prazos: prazosString || "0",
    cedenteCnpjVerificado: getVal(emitNode, "CNPJ"),
  };
};

const parsePdf = async (buffer) => {
  const pdfParser = new PDFParser(this, 1);
  let pdfText = "";
  await new Promise((resolve, reject) => {
    pdfParser.on("pdfParser_dataError", (err) =>
      reject(new Error("Erro ao ler o ficheiro PDF."))
    );
    pdfParser.on("pdfParser_dataReady", () => {
      pdfText = pdfParser.getRawTextContent().replace(/\s+/g, ""); // Remove todos os espaços para encontrar a chave
      resolve();
    });
    pdfParser.parseBuffer(buffer);
  });

  const chaveMatch = pdfText.match(/\d{44}/); // Procura por uma sequência de 44 dígitos
  const chaveNfe = chaveMatch ? chaveMatch[0] : null;

  if (!chaveNfe) {
    throw new Error(
      "Não foi possível extrair a Chave de Acesso de 44 dígitos do PDF."
    );
  }

  // A lógica de extração de outros dados continua a mesma...
  const rawText = pdfParser
    .getRawTextContent()
    .replace(/[ \t]+/g, " ")
    .trim();
  // ... (restante da lógica de parsing do PDF como estava) ...

  const numeroCteMatch = rawText.match(
    /N[ÚU]MERO\s*([0-9]{1,10})\s*DATA E HORA DE EMISS[ÃA]O/i
  );
  const dataEmissaoMatch = rawText.match(
    /DATA E HORA DE EMISS[ÃA]O\s*([0-3]?\d\/[01]?\d\/\d{4})/i
  );
  const valorTotalMatch = rawText.match(
    /VALOR TOTAL DA PRESTA[ÇC][ÃA]O DO SERVI[ÇC]O\s*([\d.,]+)/i
  );

  return {
    chave_nfe: chaveNfe,
    nfCte: numeroCteMatch ? numeroCteMatch[1] : "",
    dataNf: dataEmissaoMatch
      ? dataEmissaoMatch[1].split("/").reverse().join("-")
      : "",
    valorNf: valorTotalMatch
      ? parseFloat(valorTotalMatch[1].replace(/\./g, "").replace(",", "."))
      : 0,
    // ... restante dos dados extraídos do PDF
  };
};

// Rota Principal (com verificações e extração da chave)
export async function POST(request) {
  try {
    // ... (lógica de autenticação e busca de cliente) ...
    const token = request.headers.get("Authorization")?.split(" ")[1];
    if (!token)
      return NextResponse.json({ message: "Não autorizado" }, { status: 401 });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const clienteId = decoded.cliente_id;

    const { data: clienteAtual } = await supabase
      .from("clientes")
      .select("cnpj")
      .eq("id", clienteId)
      .single();
    if (!clienteAtual) throw new Error("Cliente não encontrado.");

    const formData = await request.formData();
    const file = formData.get("file");
    const tipoOperacaoId = formData.get("tipoOperacaoId");

    if (!file || !tipoOperacaoId)
      return NextResponse.json(
        { message: "Arquivo e tipo de operação são obrigatórios." },
        { status: 400 }
      );

    let parsedData;
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    if (file.type === "text/xml" || file.name.endsWith(".xml")) {
      parsedData = await parseXml(fileBuffer.toString("utf-8"));
    } else if (file.type === "application/pdf") {
      parsedData = await parsePdf(fileBuffer);
    } else {
      throw new Error("Formato de arquivo não suportado.");
    }

    // ... (resto da lógica da função POST continua, agora com `parsedData.chave_nfe` disponível) ...
  } catch (error) {
    console.error("Erro na simulação:", error);
    return NextResponse.json(
      { message: error.message || "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
