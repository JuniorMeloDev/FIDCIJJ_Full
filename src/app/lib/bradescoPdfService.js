import { jsPDF } from "jspdf";
import { promises as fs } from "fs";
import path from "path";
import { format } from "date-fns";
import { formatBRLNumber, formatCnpjCpf } from "../utils/formatters";

let logoCache = null;
const BOLETO_RIGHT_PANEL_WIDTH = 68;
const BOLETO_LEFT_PANEL_WIDTH = 112;

async function getBradescoLogoDataUrl() {
  if (logoCache) return logoCache;
  const filePath = path.join(process.cwd(), "public", "logoBradesco.png");
  const buffer = await fs.readFile(filePath);
  logoCache = `data:image/png;base64,${buffer.toString("base64")}`;
  return logoCache;
}

function modulo10(bloco) {
  const multiplicadores = [2, 1];
  let soma = 0;
  let i = bloco.length - 1;
  let m = 0;
  while (i >= 0) {
    const produto = parseInt(bloco.charAt(i), 10) * multiplicadores[m % 2];
    soma += produto > 9 ? Math.floor(produto / 10) + (produto % 10) : produto;
    i -= 1;
    m += 1;
  }
  const resto = soma % 10;
  return resto === 0 ? 0 : 10 - resto;
}

function modulo11Bradesco(base) {
  const pesos = [2, 3, 4, 5, 6, 7];
  let soma = 0;
  let pesoIndex = 0;
  for (let i = base.length - 1; i >= 0; i -= 1) {
    soma += parseInt(base.charAt(i), 10) * pesos[pesoIndex];
    pesoIndex = (pesoIndex + 1) % pesos.length;
  }
  const resto = soma % 11;
  const dv = 11 - resto;
  if (dv === 10) return "P";
  if (dv === 11) return "0";
  return String(dv);
}

function modulo11CodigoBarras(base) {
  const pesos = [2, 3, 4, 5, 6, 7, 8, 9];
  let soma = 0;
  let pesoIndex = 0;
  for (let i = base.length - 1; i >= 0; i -= 1) {
    soma += parseInt(base.charAt(i), 10) * pesos[pesoIndex];
    pesoIndex = (pesoIndex + 1) % pesos.length;
  }
  const resto = soma % 11;
  const dv = 11 - resto;
  if (dv === 0 || dv === 10 || dv === 11) return "1";
  return String(dv);
}

function linhaDigitavelParaCodigoBarras(linhaDigitavel) {
  const digits = String(linhaDigitavel || "").replace(/\D/g, "");
  if (digits.length === 44) return digits;
  if (digits.length !== 47) return "";
  return (
    digits.slice(0, 4) +
    digits.slice(32, 33) +
    digits.slice(33, 47) +
    digits.slice(4, 9) +
    digits.slice(10, 20) +
    digits.slice(21, 31)
  );
}

function codigoBarrasParaLinhaDigitavel(codigoBarras) {
  const digits = String(codigoBarras || "").replace(/\D/g, "");
  if (digits.length !== 44) return "";
  const bancoMoeda = digits.slice(0, 4);
  const dac = digits.slice(4, 5);
  const fatorValor = digits.slice(5, 19);
  const campoLivre = digits.slice(19);

  const campo1 = `${bancoMoeda}${campoLivre.slice(0, 5)}`;
  const campo2 = campoLivre.slice(5, 15);
  const campo3 = campoLivre.slice(15, 25);

  return `${campo1.slice(0, 5)}.${campo1.slice(5)}${modulo10(campo1)} ${campo2.slice(0, 5)}.${campo2.slice(5)}${modulo10(campo2)} ${campo3.slice(0, 5)}.${campo3.slice(5)}${modulo10(campo3)} ${dac} ${fatorValor}`;
}

function fatorVencimento(dateString) {
  const due = new Date(`${dateString}T12:00:00Z`);
  const resetBase = new Date("2025-02-22T12:00:00Z");
  const classicBase = new Date("1997-10-07T12:00:00Z");
  const msPerDay = 24 * 60 * 60 * 1000;

  if (due >= resetBase) {
    const diff = Math.floor((due - resetBase) / msPerDay);
    return String(1000 + diff).padStart(4, "0");
  }

  const diff = Math.floor((due - classicBase) / msPerDay);
  return String(diff).padStart(4, "0");
}

function valorCampoBarras(value) {
  const cents = Math.round(Number(value || 0) * 100);
  return String(cents).padStart(10, "0");
}

function buildFreeField({ agencia, carteira, nossoNumero, conta }) {
  const agenciaDigits = String(agencia || "").replace(/\D/g, "").padStart(4, "0").slice(-4);
  const carteiraDigits = String(carteira || "").replace(/\D/g, "").padStart(2, "0").slice(-2);
  const nossoDigits = String(nossoNumero || "").replace(/\D/g, "").padStart(11, "0").slice(-11);
  const contaDigits = String(conta || "").replace(/\D/g, "").padStart(7, "0").slice(-7);
  return `${agenciaDigits}${carteiraDigits}${nossoDigits}${contaDigits}0`;
}

function buildBradescoCodesFromDocument(boleto) {
  const nossoNumero = String(
    boleto.nossoNumero || boleto.nuTituloGerado || boleto.id || ""
  )
    .replace(/\D/g, "")
    .padStart(11, "0")
    .slice(-11);
  const freeField = buildFreeField({
    agencia: process.env.BRADESCO_AGENCIA,
    carteira: boleto.carteira || process.env.BRADESCO_CARTEIRA || "09",
    nossoNumero,
    conta: process.env.BRADESCO_CONTA,
  });
  const body = `2379${fatorVencimento(boleto.data_vencimento)}${valorCampoBarras(
    boleto.valor_bruto
  )}${freeField}`;
  const dac = modulo11CodigoBarras(body);
  const codigoBarras = `${body.slice(0, 4)}${dac}${body.slice(4)}`;
  const linhaDigitavel = codigoBarrasParaLinhaDigitavel(codigoBarras);

  return {
    linhaDigitavel,
    codigoBarras,
    barcodeText: "",
    nossoNumero,
  };
}

function sanitizeBarcodeText(value) {
  return String(value || "")
    .replace(/^<|>$/g, "")
    .replace(/[^NnWw]/g, "");
}

function decodeBradescoBarcode(linhaOuCodigo) {
  const numericCode = linhaDigitavelParaCodigoBarras(linhaOuCodigo);
  const barcodeText = sanitizeBarcodeText(linhaOuCodigo);

  if (numericCode.length === 44) {
    const linhaDigitavel = codigoBarrasParaLinhaDigitavel(numericCode);
    const campoLivre = numericCode.substring(19, 44);
    const nossoNumero = campoLivre.substring(6, 17);
    return {
      linhaDigitavel,
      codigoBarras: numericCode,
      barcodeText: "",
      nossoNumero,
    };
  }

  if (barcodeText.length >= 20) {
    return {
      linhaDigitavel: "",
      codigoBarras: "",
      barcodeText,
      nossoNumero: "",
    };
  }

  return {
    linhaDigitavel: "",
    codigoBarras: "",
    barcodeText: "",
    nossoNumero: "",
  };
}

function upper(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function formatCepInline(cep) {
  const digits = String(cep || "").replace(/\D/g, "").padStart(8, "0").slice(-8);
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function formatDocumentForBoleto(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return formatCnpjCpf(digits);
}

function formatNossoNumeroBradesco(nossoNumero, carteira = "09") {
  const nosso = String(nossoNumero || "")
    .replace(/\D/g, "")
    .padStart(11, "0")
    .slice(-11);
  if (!nosso) return "";
  const dv = modulo11Bradesco(`${carteira}${nosso}`);
  return `${carteira}/00/${nosso}-${dv}`;
}

function drawInterleaved2of5(doc, x, y, code, width = 118, height = 18) {
  const patterns = ["00110", "10001", "01001", "11000", "00101", "10100", "01100", "00011", "10010", "01010"];
  const start = "0000";
  const stop = "100";
  if (!code || code.length % 2 !== 0) return false;

  let binaryCode = start;
  for (let i = 0; i < code.length; i += 2) {
    const pattern1 = patterns[parseInt(code[i], 10)];
    const pattern2 = patterns[parseInt(code[i + 1], 10)];
    for (let j = 0; j < 5; j += 1) {
      binaryCode += pattern1[j] + pattern2[j];
    }
  }
  binaryCode += stop;

  const ratio = 3;
  const narrowCount = (binaryCode.match(/0/g) || []).length;
  const wideCount = (binaryCode.match(/1/g) || []).length;
  const totalUnits = narrowCount + wideCount * ratio;
  const narrowWidth = width / totalUnits;
  const wideWidth = narrowWidth * ratio;

  let cursorX = x;
  doc.setFillColor(0, 0, 0);
  for (let i = 0; i < binaryCode.length; i += 1) {
    const isBar = i % 2 === 0;
    const barWidth = binaryCode[i] === "1" ? wideWidth : narrowWidth;
    if (isBar) doc.rect(cursorX, y, barWidth, height, "F");
    cursorX += barWidth;
  }
  return true;
}

function drawTextBarcodeFallback(doc, text, x, y, width) {
  doc.rect(x, y, width, 18);
  doc.setFont("courier", "bold");
  doc.setFontSize(10);
  doc.text("CODIGO DE BARRAS RETORNADO PELO BRADESCO", x + width / 2, y + 5.5, { align: "center" });
  doc.setFontSize(8.5);
  const lines = doc.splitTextToSize(text, width - 4);
  doc.text(lines, x + 2, y + 10);
}

function drawLabel(doc, text, x, y, size = 7) {
  doc.setFont("courier", "normal");
  doc.setFontSize(size);
  doc.text(String(text || ""), x, y);
}

function drawValue(doc, text, x, y, options = {}) {
  doc.setFont("courier", options.bold === false ? "normal" : "bold");
  doc.setFontSize(options.size || 9.5);
  doc.text(String(text || ""), x, y, options);
}

function drawRect(doc, x, y, w, h, lineWidth = 0.25) {
  doc.setLineWidth(lineWidth);
  doc.rect(x, y, w, h);
}

function splitAddressLines(address = "", max = 36) {
  return String(address || "")
    .split(/\s+-\s+/)
    .join(" ")
    .match(new RegExp(`.{1,${max}}`, "g")) || [""];
}

function buildCedenteLines(boleto) {
  const nome = upper(boleto.nomeBeneficiario || boleto.cedente?.nome || "");
  const doc = formatDocumentForBoleto(boleto.cedente?.cnpj);
  const linha1 = `${nome} - CNPJ/CPF:${doc}`;
  const raw1 = upper(
    boleto.logradouroBeneficiario ||
      boleto.logradouroCedente10 ||
      boleto.cedente?.endereco ||
      ""
  );
  const raw2 = upper(
    boleto.enderecoBeneficiarioComplementar ||
      `${formatCepInline(boleto.cedente?.cep)} - ${boleto.cedente?.municipio || ""} - ${boleto.cedente?.uf || ""}`
  );
  const lines = [linha1];
  lines.push(...splitAddressLines(raw1, 42).slice(0, 2));
  if (raw2) lines.push(...splitAddressLines(raw2, 42).slice(0, 1));
  return lines.slice(0, 4);
}

function buildPagadorLines(boleto) {
  const nome = upper(boleto.sacado?.nome || "");
  const doc = formatDocumentForBoleto(boleto.sacado?.cnpj);
  const endereco = upper(boleto.sacado?.endereco || "");
  const bairro = upper(boleto.sacado?.bairro || "");
  const municipio = upper(boleto.sacado?.municipio || "");
  const uf = upper(boleto.sacado?.uf || "");
  return [
    `Pagador: ${nome}  - CNPJ/CPF: ${doc}`,
    `${endereco}${bairro ? ` - ${bairro}` : ""}`,
    `${formatCepInline(boleto.sacado?.cep)} - ${municipio}${uf ? ` - ${uf}` : ""}`,
    "Beneficiário final:  Não informado",
  ];
}

function drawHeader(doc, logoDataUrl, linhaDigitavel, x, y, width) {
  doc.addImage(logoDataUrl, "PNG", x + 1.2, y + 1.1, 18.5, 6.4);
  drawRect(doc, x + 20, y, 15, 8);
  doc.setFont("courier", "bold");
  doc.setFontSize(12);
  doc.text("237-2", x + 27.5, y + 5.9, { align: "center" });

  drawRect(doc, x + 35, y, width - 35, 8);
  drawValue(doc, linhaDigitavel || "CÓDIGO INVÁLIDO", x + width - 2, y + 7.2, {
    align: "right",
    size: 8.1,
  });
}

function drawSimpleCell(doc, x, y, w, h, label, value, options = {}) {
  drawRect(doc, x, y, w, h);
  drawLabel(doc, label, x + 1.2, y + 3.1, options.labelSize || 6.2);
  const align = options.align || "left";
  const tx = align === "right" ? x + w - 2 : align === "center" ? x + w / 2 : x + 1.5;
  const lines = Array.isArray(value) ? value : [value];
  const baseY = y + (options.valueTop || 6.6);
  lines.forEach((line, idx) => {
    drawValue(doc, line, tx, baseY + idx * 4.4, {
      align,
      size: options.size || 7.4,
      bold: options.bold,
    });
  });
}

function drawBeneficiarioBlock(doc, boleto, x, y, width, agenciaCodigo, vencimento) {
  const rightWidth = BOLETO_RIGHT_PANEL_WIDTH;
  const leftWidth = width - rightWidth;

  drawSimpleCell(
    doc,
    x,
    y,
    leftWidth,
    11,
    "Local de Pagamento",
    "Pagável Preferencialmente na Rede Bradesco ou no Bradesco Expresso.",
    { size: 7.2 }
  );
  drawSimpleCell(doc, x + leftWidth, y, rightWidth, 11, "Vencimento", vencimento, {
    align: "right",
    size: 7.8,
  });

  const lines = buildCedenteLines(boleto);
  drawSimpleCell(doc, x, y + 11, leftWidth, 22, "Beneficiário", lines, {
    valueTop: 6.5,
    size: 7.1,
  });
  drawSimpleCell(doc, x + leftWidth, y + 11, rightWidth, 22, "Agência/Código Beneficiário", agenciaCodigo, {
    align: "right",
    size: 7.5,
  });
}

function drawTituloBlock(doc, boleto, x, y, width, nossoNumero) {
  const docNumber = String(boleto.nuCliente || boleto.nf_cte || boleto.id || "")
    .replace(/[^\dA-Za-z.-]/g, "")
    .replace(/\.$/, "");
  const especieSigla = upper(boleto.especieSigla || "DM");
  const processDate = format(new Date(), "dd/MM/yyyy");
  const emitDate = format(new Date(`${boleto.data_operacao}T12:00:00Z`), "dd/MM/yyyy");

  const rightStart = BOLETO_LEFT_PANEL_WIDTH;
  const cols1 = [19, 23, 21, 15, 34, width - rightStart];
  const labels1 = ["Data do doc.", "Nº do documento", "Espécie doc.", "Aceite", "Data Proces.", "Nosso Número"];
  const values1 = [emitDate, docNumber, especieSigla, "Não", processDate, nossoNumero];
  let cx = x;
  cols1.forEach((w, idx) => {
      drawSimpleCell(doc, cx, y, w, 10, labels1[idx], values1[idx], {
        align: idx === 5 ? "right" : idx === 3 ? "center" : "left",
        size: 7.4,
      });
    cx += w;
  });

  const cols2 = [19, 19, 19, 18, 37, width - rightStart];
  const labels2 = ["Uso do Banco", "Carteira", "Espécie", "Quantidade", "Valor", "(=) Valor do Documento"];
  const values2 = [
    "",
    String(boleto.carteira || process.env.BRADESCO_CARTEIRA || "09"),
    "R$",
    "",
    "",
    formatBRLNumber(boleto.valor_bruto),
  ];
  cx = x;
  cols2.forEach((w, idx) => {
      drawSimpleCell(doc, cx, y + 10, w, 10, labels2[idx], values2[idx], {
        align: idx === 5 ? "right" : idx >= 1 && idx <= 3 ? "center" : "left",
        size: 7.4,
      });
    cx += w;
  });
}

function drawInstrucoes(doc, boleto, x, y, w, h) {
  drawRect(doc, x, y, w, h);
  drawLabel(doc, "Instruções (Texto de responsabilidade do beneficiário)", x + 1.5, y + 4);
  const jurosDia =
    (Number(boleto.valor_bruto || 0) * (Number(boleto.operacao?.tipo_operacao?.taxa_juros_mora || 0) / 100)) / 30;
  const multaValor =
    Number(boleto.valor_bruto || 0) * (Number(boleto.operacao?.tipo_operacao?.taxa_multa || 0) / 100);
  const linhas = [
    "Pagável Preferencialmente nas Agências Bradesco",
    "",
    "* VALORES EXPRESSOS EM REAIS **** *",
    `JUROS POR DIA DE ATRASO.........${formatBRLNumber(jurosDia).replace("R$", "").trim()}`,
    `APOS ${format(new Date(`${boleto.data_vencimento}T12:00:00Z`), "dd.MM.yyyy")} MULTA ............${formatBRLNumber(multaValor).replace("R$", "").trim()}`,
    `REFERENTE A NF ${String(boleto.nf_cte || boleto.nuCliente || boleto.id).replace(/[^\dA-Za-z.-]/g, "")}`,
  ];
  let cursorY = y + 7.6;
  linhas.forEach((linha) => {
    drawValue(doc, linha, x + 2, cursorY, { size: 6.8 });
    cursorY += 3.4;
  });
}

function drawValoresLaterais(doc, boleto, x, y, w, h) {
  const rows = [
    ["(-) Descontos/Abatimento", formatBRLNumber(boleto.valor_abatimento || 0)],
    ["(-) Outras Deduções", ""],
    ["(+) Mora/Multa", ""],
    ["(+) Outros Acréscimos", ""],
    ["(=) Valor Cobrado", ""],
  ];
  const rh = h / rows.length;
    rows.forEach(([label, value], idx) => {
      drawRect(doc, x, y + idx * rh, w, rh);
      drawLabel(doc, label, x + 2, y + idx * rh + 4);
      if (value) {
        drawValue(doc, value, x + w - 2, y + idx * rh + rh - 2.2, { align: "right", size: 7.8 });
      }
    });
  }

function drawPagadorBlock(doc, boleto, x, y, w, h, footerTitle) {
  drawRect(doc, x, y, w, h);
  const lines = buildPagadorLines(boleto);
  drawValue(doc, lines[0], x + 2, y + 4.8, { size: 7.1 });
  drawValue(doc, lines[1], x + 20, y + 8.8, { size: 7.1 });
  drawValue(doc, lines[2], x + 20, y + 12.6, { size: 7.1 });
  drawLabel(doc, lines[3], x + 2, y + 17.3, 7.1);
  if (footerTitle) {
    drawValue(doc, footerTitle, x + w - 2, y + h - 5.2, { align: "right", size: 7.1 });
    drawValue(doc, "Autenticação Mecânica", x + w - 2, y + h - 1.3, { align: "right", size: 7.1 });
  }
}

function drawRecibo(doc, boleto, decoded, logoDataUrl, agenciaCodigo) {
  const x = 10;
  const y = 8;
  const width = 180;
  const vencimento = format(new Date(`${boleto.data_vencimento}T12:00:00Z`), "dd/MM/yyyy");

  drawHeader(doc, logoDataUrl, decoded.linhaDigitavel, x, y, width);
  drawBeneficiarioBlock(doc, boleto, x, y + 8, width, agenciaCodigo, vencimento);
  drawTituloBlock(doc, boleto, x, y + 41, width, boleto.nossoNumeroFormatado);
  drawPagadorBlock(doc, boleto, x, y + 61, width, 22, "Recibo do Pagador");
}

function drawFooterInstitutional(doc, x, y, width) {
  drawLabel(doc, "Este boleto foi emitido por meio da API do Bradesco Empresa.", x + 2, y + 4.5, 7.1);
  const top = y + 8;
  const bottom = y + 24;
  const mid = y + 20.4;
  const col1 = x + 26;
  const col2 = x + 47;
  const col3 = x + 88;
  const col4 = x + 153;

  doc.line(x, top, x + width, top);
  doc.line(x, bottom, x + width, bottom);
  doc.line(col1, top, col1, mid);
  doc.line(col2, top, col2, mid);
  doc.line(col3, top, col3, mid);
  doc.line(col4, top, col4, bottom);
  doc.line(x, mid, col4, mid);

  drawValue(doc, "SAC - Serviço de", x + 2, y + 12.4, { size: 5.8 });
  drawValue(doc, "Apoio ao Cliente", x + 2, y + 16.0, { size: 5.8 });

  drawValue(doc, "Alô Bradesco", col1 + 2, y + 12.4, { size: 5.8 });
  drawLabel(doc, "0800 704 8383", col1 + 2, y + 16.0, 5.8);

  drawValue(doc, "Deficiente Auditivo ou de Fala", col2 + 2, y + 12.4, { size: 5.6 });
  drawLabel(doc, "0800 722 0099", col2 + 2, y + 16.0, 5.8);

  drawValue(doc, "Cancelamentos, Reclamações e", col3 + 2, y + 12.0, { size: 5.1 });
  drawLabel(doc, "Informações. Atendimento 24 horas, 7 dias", col3 + 2, y + 15.0, 4.9);
  drawLabel(doc, "por semana.", col3 + 2, y + 18.0, 4.9);

  drawValue(doc, "Demais telefones", col4 + 2, y + 12.2, { size: 5.3 });
  drawLabel(doc, "consulte o site", col4 + 2, y + 15.7, 5.1);
  drawLabel(doc, "Fale Conosco", col4 + 2, y + 19.0, 5.1);

  drawValue(doc, "Ouvidoria", x + 2, y + 27.6, { size: 6.0 });
  doc.setTextColor(200, 0, 0);
  drawValue(doc, "0800 727 9933", x + 24, y + 27.6, { size: 6.0 });
  doc.setTextColor(0, 0, 0);
  drawLabel(doc, "Atendimento de segunda a sexta-feira, das 8h às 18h, exceto feriados.", x + 46, y + 27.6, 5.9);
}

function drawFicha(doc, boleto, decoded, logoDataUrl, agenciaCodigo) {
  const x = 10;
  const y = 96;
  const width = 180;
  const vencimento = format(new Date(`${boleto.data_vencimento}T12:00:00Z`), "dd/MM/yyyy");

  drawHeader(doc, logoDataUrl, decoded.linhaDigitavel, x, y, width);
  drawBeneficiarioBlock(doc, boleto, x, y + 8, width, agenciaCodigo, vencimento);
  drawTituloBlock(doc, boleto, x, y + 41, width, boleto.nossoNumeroFormatado);
  drawInstrucoes(doc, boleto, x, y + 61, BOLETO_LEFT_PANEL_WIDTH, 36);
  drawValoresLaterais(doc, boleto, x + BOLETO_LEFT_PANEL_WIDTH, y + 61, BOLETO_RIGHT_PANEL_WIDTH, 36);
  drawPagadorBlock(doc, boleto, x, y + 97, width, 22, "Ficha de Compensação");

  const barcodeY = y + 120;
  if (decoded.codigoBarras) {
    drawInterleaved2of5(doc, x + 4, barcodeY + 3, decoded.codigoBarras, 103, 13);
  } else if (decoded.barcodeText) {
    drawTextBarcodeFallback(doc, decoded.barcodeText, x + 4, barcodeY + 1, 103);
  } else {
    drawTextBarcodeFallback(doc, "Código de barras não disponível para este título.", x + 4, barcodeY + 1, 103);
  }

  drawFooterInstitutional(doc, x, barcodeY + 16, width);
}

function resolveLinhaDigitavelFromBoleto(boleto) {
  return (
    boleto.linhaDigitavel ||
    boleto.linha_digitavel ||
    boleto.lineDig10 ||
    boleto.linhaDig10 ||
    boleto.codigo_barras ||
    boleto.codigoBarras ||
    boleto.codBarras10 ||
    boleto.codBarras ||
    ""
  );
}

function resolveBradescoCodes(boleto) {
  const decoded = decodeBradescoBarcode(resolveLinhaDigitavelFromBoleto(boleto));
  if (decoded.linhaDigitavel || decoded.codigoBarras || decoded.barcodeText) {
    return decoded;
  }
  return buildBradescoCodesFromDocument(boleto);
}

export async function gerarPdfBoletoBradesco(listaBoletos) {
  const doc = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
  const logoDataUrl = await getBradescoLogoDataUrl();
  const agencia = String(process.env.BRADESCO_AGENCIA || "").replace(/\D/g, "").padStart(5, "0");
  const conta = String(process.env.BRADESCO_CONTA || "").replace(/\D/g, "");
  const contaDv = String(process.env.BRADESCO_CONTA_DV || "").trim();
  const agenciaCodigo = `${agencia}/${conta}${contaDv ? `-${contaDv}` : ""}`;
  const carteira = String(process.env.BRADESCO_CARTEIRA || "09");

  listaBoletos.forEach((boleto, index) => {
    if (index > 0) doc.addPage();
    const decoded = resolveBradescoCodes(boleto);
    const nossoNumeroBase =
      String(boleto.nossoNumero || boleto.nuTituloGerado || boleto.id || "")
        .replace(/\D/g, "")
        .padStart(11, "0")
        .slice(-11);
    const boletoFinal = {
      ...boleto,
      nossoNumeroFormatado: formatNossoNumeroBradesco(
        decoded.nossoNumero || nossoNumeroBase,
        carteira
      ),
    };

    drawRecibo(doc, boletoFinal, decoded, logoDataUrl, agenciaCodigo);
    doc.setLineDashPattern([1.2, 1.2], 0);
    doc.line(10, 92, 190, 92);
    doc.setLineDashPattern([], 0);
    drawFicha(doc, boletoFinal, decoded, logoDataUrl, agenciaCodigo);
  });

  return doc.output("arraybuffer");
}
