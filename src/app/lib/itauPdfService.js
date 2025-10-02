import { jsPDF } from 'jspdf';
import { format, addDays } from 'date-fns';
import { formatBRLNumber, formatCnpjCpf } from '../utils/formatters';
import fs from 'fs';
import path from 'path';

// Logo Itaú
const getItauLogoBase64 = () => {
  try {
    const imagePath = path.resolve(process.cwd(), 'public', 'itau.png');
    const imageBuffer = fs.readFileSync(imagePath);
    return `data:image/png;base64,${imageBuffer.toString('base64')}`;
  } catch {
    return null;
  }
};

// Código de barras Interleaved 2 of 5
function drawInterleaved2of5(doc, x, y, code, width = 160, height = 15) {
  if (!code) return;
  const patterns = ['00110','10001','01001','11000','00101','10100','01100','00011','10010','01010'];
  const start = '0000';
  const stop = '100';
  if (code.length % 2 !== 0) code = '0' + code;
  let binaryCode = start;
  for (let i = 0; i < code.length; i += 2) {
    const p1 = patterns[parseInt(code[i], 10)];
    const p2 = patterns[parseInt(code[i + 1], 10)];
    for (let j = 0; j < 5; j++) binaryCode += p1[j] + p2[j];
  }
  binaryCode += stop;
  const ratio = 3;
  const numNarrow = (binaryCode.match(/0/g) || []).length;
  const numWide = (binaryCode.match(/1/g) || []).length;
  const totalUnits = numNarrow + numWide * ratio;
  const narrowWidth = width / totalUnits;
  const wideWidth = narrowWidth * ratio;
  let currentX = x;
  doc.setFillColor(0,0,0);
  for (let i = 0; i < binaryCode.length; i++) {
    const isBar = i % 2 === 0;
    const barWidth = binaryCode[i] === '1' ? wideWidth : narrowWidth;
    if (isBar) doc.rect(currentX, y, barWidth, height, 'F');
    currentX += barWidth;
  }
}

// Campo com label + valor
const drawField = (doc, label, value, x, y, width, height, valueAlign = 'left', valueSize = 9, labelSize = 6) => {
  if (label) {
    doc.setFontSize(labelSize).setTextColor(100,100,100);
    doc.text(label, x + 1.5, y + 2.5);
  }
  doc.setFontSize(valueSize).setTextColor(0,0,0);
  const textX = valueAlign === 'right' ? x + width - 1.5 : x + 1.5;
  const lines = Array.isArray(value) ? value : [value || ''];
  lines.forEach((line, i) => {
    doc.text(String(line), textX, y + height - 1.5 - (lines.length - 1 - i) * 3.5, { align: valueAlign });
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

    // ---------- RECIBO ----------
    if (itauLogoBase64) doc.addImage(itauLogoBase64, 'PNG', 15, 12, 25, 8);
    doc.setFont('helvetica','bold').setFontSize(10).text('RECIBO DO PAGADOR', 195, 15, { align: 'right' });
    doc.line(15, 20, 195, 20);

    // Caixa principal do recibo
    doc.rect(15, 22, 180, 30);
    doc.line(15, 32, 195, 32);
    doc.line(15, 42, 195, 42);

    drawField(doc, 'Beneficiário', `${dadosBoleto.cedente.nome} - CNPJ/CPF: ${formatCnpjCpf(dadosBoleto.cedente.cnpj)}`, 15, 22, 100, 10);
    drawField(doc, 'Agência/Código Beneficiário', `${dadosBoleto.agencia}/${dadosBoleto.conta}`, 115, 22, 40, 10, 'right');
    drawField(doc, 'Vencimento', format(vencimentoDate, 'dd/MM/yyyy'), 155, 22, 40, 10, 'right');
    drawField(doc, 'Pagador', dadosBoleto.sacado.nome, 15, 32, 140, 10);
    drawField(doc, 'Valor do Documento', formatBRLNumber(dadosBoleto.valor_bruto), 155, 32, 40, 10, 'right');

    // Linha carteira/espécie/quantidade/valor
    drawField(doc, 'Carteira', dadosBoleto.carteira, 15, 42, 30, 10);
    drawField(doc, 'Espécie', 'R$', 45, 42, 20, 10);
    drawField(doc, 'Quantidade', '-', 65, 42, 40, 10);
    drawField(doc, 'Valor', formatBRLNumber(dadosBoleto.valor_bruto), 105, 42, 90, 10, 'right');

    doc.setFontSize(8).text('Autenticação mecânica', 195, 53, { align: 'right' });

    // Separador tracejado
    doc.setLineDashPattern([2,1],0).line(15, 58, 195, 58).setLineDashPattern([],0);

    // ---------- FICHA ----------
    const y = 65;
    if (itauLogoBase64) doc.addImage(itauLogoBase64, 'PNG', 15, y, 25, 8);
    doc.setFont('helvetica','bold').setFontSize(12).text('341-7', 47.5, y + 5, { align: 'center' });
    doc.setFontSize(11).setFont('courier','bold').text(linha_digitavel, 125, y + 5, { align: 'center' });

    // Caixa principal
    doc.rect(15, y + 10, 180, 105);
    doc.line(145, y + 10, 145, y + 115); // divide esquerda/direita

    // Linha: Local de pagamento
    doc.line(15, y + 20, 195, y + 20);
    drawField(doc, 'Local de Pagamento', 'PAGÁVEL PREFERENCIALMENTE NO BANCO ITAÚ', 15, y + 10, 130, 10);
    drawField(doc, 'Vencimento', format(vencimentoDate, 'dd/MM/yyyy'), 145, y + 10, 50, 10, 'right');

    // Linha: Beneficiário
    doc.line(15, y + 30, 195, y + 30);
    drawField(doc, 'Beneficiário', `${dadosBoleto.cedente.nome} - CNPJ/CPF: ${formatCnpjCpf(dadosBoleto.cedente.cnpj)}`, 15, y + 20, 130, 10);
    drawField(doc, 'Agência/Código Beneficiário', `${dadosBoleto.agencia}/${dadosBoleto.conta}`, 145, y + 20, 50, 10, 'right');

    // Linha: Documento
    doc.line(15, y + 40, 195, y + 40);
    doc.line(40, y + 30, 40, y + 40);
    doc.line(75, y + 30, 75, y + 40);
    doc.line(95, y + 30, 95, y + 40);
    doc.line(115, y + 30, 115, y + 40);
    drawField(doc, 'Data do Documento', format(new Date(dadosBoleto.data_operacao + 'T12:00:00Z'), 'dd/MM/yyyy'), 15, y + 30, 25, 10);
    drawField(doc, 'Nº Doc.', dadosBoleto.nf_cte, 40, y + 30, 35, 10);
    drawField(doc, 'Espécie Doc.', 'DM', 75, y + 30, 20, 10);
    drawField(doc, 'Aceite', 'N', 95, y + 30, 20, 10);
    drawField(doc, 'Data Process.', format(new Date(), 'dd/MM/yyyy'), 115, y + 30, 30, 10);
    drawField(doc, 'Nosso Número', `${dadosBoleto.carteira} / ${dadosBoleto.nosso_numero}`, 145, y + 30, 50, 10, 'right');

    // Linha: Carteira
    doc.line(15, y + 50, 195, y + 50);
    doc.line(35, y + 40, 35, y + 50);
    doc.line(55, y + 40, 55, y + 50);
    doc.line(95, y + 40, 95, y + 50);
    drawField(doc, 'Carteira', dadosBoleto.carteira, 15, y + 40, 20, 10);
    drawField(doc, 'Espécie', 'R$', 35, y + 40, 20, 10);
    drawField(doc, 'Quantidade', '-', 55, y + 40, 40, 10);
    drawField(doc, 'Valor', '-', 95, y + 40, 50, 10);
    drawField(doc, '(=) Valor Documento', formatBRLNumber(dadosBoleto.valor_bruto), 145, y + 40, 50, 10, 'right');

    // Caixa direita: descontos/juros/valor cobrado
    doc.line(145, y + 60, 195, y + 60);
    doc.line(145, y + 70, 195, y + 70);
    doc.line(145, y + 80, 195, y + 80);
    drawField(doc, '(-) Desconto/Abatimento', '', 145, y + 50, 50, 10);
    drawField(doc, '(+) Juros/Multa', '', 145, y + 60, 50, 10);
    drawField(doc, '(=) Valor Cobrado', formatBRLNumber(dadosBoleto.valor_bruto), 145, y + 70, 50, 10, 'right');

    // Instruções (sem cabeçalho fixo)
    const dataVencida = format(addDays(vencimentoDate, 1), 'dd/MM/yyyy');
    const instrucoes = [
      dadosBoleto.operacao?.tipo_operacao?.taxa_juros_mora ? `A partir de ${dataVencida}, COBRAR JUROS DE ${dadosBoleto.operacao.tipo_operacao.taxa_juros_mora}% AO MÊS` : '',
      dadosBoleto.operacao?.tipo_operacao?.taxa_multa ? `A partir de ${dataVencida}, COBRAR MULTA DE ${dadosBoleto.operacao.tipo_operacao.taxa_multa}%` : '',
      `REFERENTE A NF ${dadosBoleto.nf_cte}`
    ].filter(Boolean);
    drawField(doc, '', instrucoes, 15, y + 50, 130, 30, 'left', 8);

    // Pagador
    drawField(doc, 'Pagador', [
      dadosBoleto.sacado.nome,
      `${dadosBoleto.sacado.endereco}, ${dadosBoleto.sacado.bairro}`,
      `${dadosBoleto.sacado.municipio} - ${dadosBoleto.sacado.uf} CEP: ${dadosBoleto.sacado.cep}`,
      `CNPJ/CPF: ${formatCnpjCpf(dadosBoleto.sacado.cnpj)}`
    ], 15, y + 80, 130, 25, 'left', 9);

    // Linha digitável antes do código de barras
    doc.setFont('courier','bold').setFontSize(12).text(linha_digitavel || '', 105, y + 115, { align: 'center' });

    // Código de barras (embaixo, bem posicionado)
    drawInterleaved2of5(doc, 20, y + 120, codigo_barras, 160, 15);

    doc.setFontSize(8).text('Autenticação Mecânica - Ficha de Compensação', 195, y + 140, { align: 'right' });
  });

  return doc.output('arraybuffer');
}
