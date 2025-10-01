import { jsPDF } from 'jspdf';
import { format, addDays } from 'date-fns';
import { formatBRLNumber, formatCnpjCpf } from '../utils/formatters';
import fs from 'fs';
import path from 'path';

// Carrega logo Itaú (coloque public/itau.png)
const getItauLogoBase64 = () => {
  try {
    const imagePath = path.resolve(process.cwd(), 'public', 'itau.png');
    const imageBuffer = fs.readFileSync(imagePath);
    return `data:image/png;base64,${imageBuffer.toString('base64')}`;
  } catch (error) {
    console.error("Erro ao carregar a imagem do logo Itaú:", error);
    return null;
  }
};

// Código de barras Interleaved 2 of 5
function drawInterleaved2of5(doc, x, y, code, width = 160, height = 15) {
  if (!code) return;
  const patterns = ['00110','10001','01001','11000','00101','10100','01100','00011','10010','01010'];
  const start = '0000';
  const stop = '100';
  if (code.length % 2 !== 0) { code = '0' + code; }
  let binaryCode = start;
  for (let i = 0; i < code.length; i += 2) {
    const p1 = patterns[parseInt(code[i], 10)];
    const p2 = patterns[parseInt(code[i + 1], 10)];
    for (let j = 0; j < 5; j++) binaryCode += p1[j] + p2[j];
  }
  binaryCode += stop;
  const wideToNarrowRatio = 3;
  const numNarrow = (binaryCode.match(/0/g) || []).length;
  const numWide = (binaryCode.match(/1/g) || []).length;
  const totalUnits = numNarrow + numWide * wideToNarrowRatio;
  const narrowWidth = width / totalUnits;
  const wideWidth = narrowWidth * wideToNarrowRatio;
  let currentX = x;
  doc.setFillColor(0,0,0);
  for (let i = 0; i < binaryCode.length; i++) {
    const isBar = i % 2 === 0;
    const barWidth = binaryCode[i] === '1' ? wideWidth : narrowWidth;
    if (isBar) doc.rect(currentX, y, barWidth, height, 'F');
    currentX += barWidth;
  }
}

// Campo com label e valor (similar ao safra)
const drawField = (doc, label, value, x, y, width, height, valueAlign = 'left', valueSize = 9, labelSize = 6) => {
  doc.setFontSize(labelSize).setTextColor(100,100,100);
  if (label) doc.text(label, x + 1.5, y + 2.5);
  doc.setFontSize(valueSize).setTextColor(0,0,0);
  const textX = valueAlign === 'right' ? x + width - 1.5 : x + 1.5;
  const lines = Array.isArray(value) ? value : [value === undefined || value === null ? '' : value];
  lines.forEach((line, i) => {
    doc.text(String(line), textX, y + height - 1.5 - (lines.length - 1 - i) * 3.5, { align: valueAlign, baseline: 'bottom' });
  });
};

// Função principal
export function gerarPdfBoletoItau(listaBoletos) {
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  const itauLogoBase64 = getItauLogoBase64();

  listaBoletos.forEach((dadosBoleto, index) => {
    if (index > 0) doc.addPage();

    const { linha_digitavel, codigo_barras } = dadosBoleto.boletoInfo || {};
    const vencimentoDate = new Date(dadosBoleto.data_vencimento + 'T12:00:00Z');

    // ---------- RECIBO DO PAGADOR ----------
    if (itauLogoBase64) doc.addImage(itauLogoBase64, 'PNG', 15, 12, 25, 8);
    doc.setFont('helvetica','bold').setFontSize(10).text('RECIBO DO PAGADOR', 195, 15, { align: 'right' });
    doc.line(15, 20, 195, 20);

    const xRecibo = 15, yRecibo = 22, wRecibo = 180, hRecibo = 10;
    // Caixa do recibo (contorno externo)
    doc.rect(xRecibo, yRecibo - 2, wRecibo, hRecibo * 3); // altura adaptada

    // Linhas internas do recibo
    doc.line(xRecibo, yRecibo + hRecibo - 2, xRecibo + wRecibo, yRecibo + hRecibo - 2);
    doc.line(xRecibo, yRecibo + hRecibo * 2 - 2, xRecibo + wRecibo, yRecibo + hRecibo * 2 - 2);

    // Conteúdo recibo
    drawField(doc, 'Beneficiário', `${dadosBoleto.cedente.nome} - CNPJ/CPF: ${formatCnpjCpf(dadosBoleto.cedente.cnpj)}`, xRecibo, yRecibo - 2, 100, hRecibo);
    drawField(doc, 'Agência/Código Beneficiário', `${dadosBoleto.agencia}/${dadosBoleto.conta}`, xRecibo + 100, yRecibo - 2, 40, hRecibo, 'right');
    drawField(doc, 'Vencimento', format(vencimentoDate, 'dd/MM/yyyy'), xRecibo + 140, yRecibo - 2, 40, hRecibo, 'right');

    drawField(doc, 'Pagador', `${dadosBoleto.sacado.nome}`, xRecibo, yRecibo + hRecibo - 2, 140, hRecibo);
    drawField(doc, 'Valor do Documento', formatBRLNumber(dadosBoleto.valor_bruto), xRecibo + 140, yRecibo + hRecibo - 2, 40, hRecibo, 'right');

    // Linha carteira/espécie/quantidade/valor no recibo
    const yReciboLinha = yRecibo + hRecibo * 2 - 2;
    // pequenas colunas
    drawField(doc, 'Carteira', dadosBoleto.carteira, xRecibo, yReciboLinha, 30, hRecibo);
    drawField(doc, 'Espécie', 'R$', xRecibo + 30, yReciboLinha, 20, hRecibo);
    drawField(doc, 'Quantidade', '-', xRecibo + 50, yReciboLinha, 40, hRecibo);
    drawField(doc, 'Valor', formatBRLNumber(dadosBoleto.valor_bruto), xRecibo + 90, yReciboLinha, 90, hRecibo, 'right');

    doc.setFontSize(8).text('Autenticação mecânica', xRecibo + wRecibo, yRecibo + hRecibo * 3 - 1, { align: 'right' });

    // Separador tracejado
    doc.setLineDashPattern([2,1],0).line(15, yRecibo + hRecibo * 3 + 6, 195, yRecibo + hRecibo * 3 + 6).setLineDashPattern([],0);

    // ---------- FICHA DE COMPENSAÇÃO ----------
    const x = 15, y = yRecibo + hRecibo * 3 + 10, w = 180;
    if (itauLogoBase64) doc.addImage(itauLogoBase64, 'PNG', x, y - 7, 25, 8);

    // Banco e linha digitavel
    doc.setLineWidth(0.5).line(40, y - 7, 40, y + 1);
    doc.setFont('helvetica','bold').setFontSize(12).text('341-7', 47.5, y - 3, { align: 'center' });
    doc.setLineWidth(0.5).line(55, y - 7, 55, y + 1);
    if (linha_digitavel) {
      doc.setFontSize(11).setFont('courier','bold').text(linha_digitavel, 125, y - 3, { align: 'center' });
    }

    // Caixa principal da ficha
    doc.setLineWidth(0.2);
    doc.rect(x, y, w, 105);

    // Desenha a coluna vertical que separa dados da direita (valores)
    doc.line(x + 130, y, x + 130, y + 105);

    // Linhas horizontais principais (para separar seções)
    const hField = 10;
    doc.line(x, y + hField, x + w, y + hField);         // top
    doc.line(x, y + hField * 2, x + w, y + hField * 2); // beneficiario
    doc.line(x, y + hField * 3, x + w, y + hField * 3); // doc linha
    doc.line(x, y + hField * 4, x + w, y + hField * 4); // carteira linha
    doc.line(x, y + hField * 7, x + w, y + hField * 7); // após instrucoes (aprox)

    // Linha 1: Local de pagamento e Vencimento (linha y)
    drawField(doc, 'Local de Pagamento', 'PAGÁVEL PREFERENCIALMENTE NO BANCO ITAÚ', x, y, 130, hField);
    drawField(doc, 'Vencimento', format(vencimentoDate, 'dd/MM/yyyy'), x + 130, y, 50, hField, 'right', 10);

    // Linha 2: Beneficiário e agência/código
    drawField(doc, 'Beneficiário', `${dadosBoleto.cedente.nome} - CNPJ/CPF: ${formatCnpjCpf(dadosBoleto.cedente.cnpj)}`, x, y + hField, 130, hField);
    drawField(doc, 'Agência/Código Beneficiário', `${dadosBoleto.agencia}/${dadosBoleto.conta}`, x + 130, y + hField, 50, hField, 'right');

    // Linha 3: Data do Documento / Nº Doc / Espécie / Aceite / Nosso Número
    drawField(doc, 'Data do Documento', format(new Date(dadosBoleto.data_operacao + 'T12:00:00Z'), 'dd/MM/yyyy'), x, y + hField * 2, 25, hField);
    drawField(doc, 'Nº do Doc.', dadosBoleto.nf_cte, x + 25, y + hField * 2, 35, hField);
    drawField(doc, 'Espécie Doc.', 'DM', x + 60, y + hField * 2, 15, hField);
    drawField(doc, 'Aceite', 'N', x + 75, y + hField * 2, 15, hField);
    drawField(doc, 'Data Process.', format(new Date(), 'dd/MM/yyyy'), x + 90, y + hField * 2, 40, hField);
    drawField(doc, 'Nosso Número', dadosBoleto.nosso_numero, x + 130, y + hField * 2, 50, hField, 'right');

    // Linha 4: Carteira / Espécie / Quantidade / Valor (esquerda) + (=) Valor do Documento (direita)
    drawField(doc, 'Carteira', dadosBoleto.carteira, x, y + hField * 3, 25, hField);
    drawField(doc, 'Espécie', 'R$', x + 25, y + hField * 3, 20, hField);
    drawField(doc, 'Quantidade', '-', x + 45, y + hField * 3, 35, hField);
    drawField(doc, 'Valor', '-', x + 80, y + hField * 3, 50, hField);
    drawField(doc, '(=) Valor do Documento', formatBRLNumber(dadosBoleto.valor_bruto), x + 130, y + hField * 3, 50, hField, 'right', 10);

    // Agora: caixas da direita para Descontos / Juros / Valor Cobrado
    const yRightStart = y + hField * 3; // começa na mesma altura da linha de carteira
    const hCampoValor = 8; // altura de cada pequena caixa
    // Desenha caixa e o label + valor
    drawField(doc, '(-) Desconto/Abatimento', '', x + 130, yRightStart + 10, 50, hCampoValor);
    doc.line(x + 130, yRightStart + 10 + hCampoValor, x + w, yRightStart + 10 + hCampoValor);

    drawField(doc, '(+) Juros/Multa', '', x + 130, yRightStart + 10 + hCampoValor, 50, hCampoValor);
    doc.line(x + 130, yRightStart + 10 + hCampoValor * 2, x + w, yRightStart + 10 + hCampoValor * 2);

    drawField(doc, '(=) Valor Cobrado', formatBRLNumber(dadosBoleto.valor_bruto), x + 130, yRightStart + 10 + hCampoValor * 2, 50, hCampoValor, 'right', 9);
    doc.line(x + 130, yRightStart + 10 + hCampoValor * 3, x + w, yRightStart + 10 + hCampoValor * 3);

    // Instruções (à esquerda)
    const dataVencida = format(addDays(vencimentoDate, 1), 'dd/MM/yyyy');
    const instrucoes = [
      'Instruções de responsabilidade do BENEFICIÁRIO.',
      dadosBoleto.operacao && dadosBoleto.operacao.tipo_operacao && dadosBoleto.operacao.tipo_operacao.taxa_juros_mora ? `A partir de ${dataVencida}, COBRAR JUROS DE ${dadosBoleto.operacao.tipo_operacao.taxa_juros_mora}% AO MÊS` : '',
      dadosBoleto.operacao && dadosBoleto.operacao.tipo_operacao && dadosBoleto.operacao.tipo_operacao.taxa_multa ? `A partir de ${dataVencida}, COBRAR MULTA DE ${dadosBoleto.operacao.tipo_operacao.taxa_multa}%` : '',
      `REFERENTE A NF ${dadosBoleto.nf_cte}`
    ].filter(Boolean);

    drawField(doc, 'Instruções', instrucoes, x, y + hField * 4, 120, hField * 3, 'left', 8, 6);

    // Pagador (abaixo das instruções)
    const yPagador = y + hField * 7 - 4;
    const pagadorLines = doc.splitTextToSize(
      `${dadosBoleto.sacado.nome}\n${dadosBoleto.sacado.endereco}, ${dadosBoleto.sacado.bairro}\n${dadosBoleto.sacado.municipio} - ${dadosBoleto.sacado.uf} CEP: ${dadosBoleto.sacado.cep}\nCNPJ/CPF: ${formatCnpjCpf(dadosBoleto.sacado.cnpj)}`,
      118
    );
    drawField(doc, 'Pagador', pagadorLines, x, yPagador, 118, 22, 'left', 9, 6);

    // Beneficiário Final (linha embaixo)
    drawField(doc, 'Beneficiário Final', '', x, yPagador + 22, 180, 5);
    doc.line(x, yPagador + 27, x + w, yPagador + 27);

    // Código de barras (embaixo, sem sobreposição)
    if (codigo_barras) {
      drawInterleaved2of5(doc, 15, y + 85, codigo_barras, 160, 16);
    }

    doc.setFont('helvetica', 'normal').setFontSize(8).text('Autenticação mecânica - Ficha de Compensação', 195, y + 100, { align: 'right' });
  });

  return doc.output('arraybuffer');
}
