import { jsPDF } from 'jspdf';
import { format, addDays } from 'date-fns';
import { formatBRLNumber, formatCnpjCpf } from '../utils/formatters';
import fs from 'fs';
import path from 'path';

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

function drawInterleaved2of5(doc, x, y, code, width = 103, height = 13) {
  if (!code) return;
  const patterns = ['00110', '10001', '01001', '11000', '00101', '10100', '01100', '00011', '10010', '01010'];
  const start = '0000';
  const stop = '100';
  if (code.length % 2 !== 0) { code = '0' + code; }
  let binaryCode = start;
  for (let i = 0; i < code.length; i += 2) {
    const pattern1 = patterns[parseInt(code[i], 10)];
    const pattern2 = patterns[parseInt(code[i + 1], 10)];
    for (let j = 0; j < 5; j++) { binaryCode += pattern1[j] + pattern2[j]; }
  }
  binaryCode += stop;
  const wideToNarrowRatio = 3;
  const numNarrow = (binaryCode.match(/0/g) || []).length;
  const numWide = (binaryCode.match(/1/g) || []).length;
  const totalUnits = (numNarrow) + (numWide * wideToNarrowRatio);
  const narrowWidth = width / totalUnits;
  const wideWidth = narrowWidth * wideToNarrowRatio;
  let currentX = x;
  doc.setFillColor(0, 0, 0);
  for (let i = 0; i < binaryCode.length; i++) {
    const isBar = i % 2 === 0;
    const barWidth = binaryCode[i] === '1' ? wideWidth : narrowWidth;
    if (isBar) { doc.rect(currentX, y, barWidth, height, 'F'); }
    currentX += barWidth;
  }
}

export function gerarPdfBoletoItau(listaBoletos) {
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  const itauLogoBase64 = getItauLogoBase64();

  listaBoletos.forEach((dadosBoleto, index) => {
    if (index > 0) doc.addPage();

    const { linha_digitavel, codigo_barras } = dadosBoleto.boletoInfo;
    const vencimentoDate = new Date(dadosBoleto.data_vencimento + 'T12:00:00Z');
    const tipoOperacao = dadosBoleto.operacao.tipo_operacao;

    // ================= RECIBO DO PAGADOR =================
    let y = 12, x = 15, w = 180, h = 8;
    doc.rect(x, y, w, 35); // caixa principal do recibo
    if (itauLogoBase64) doc.addImage(itauLogoBase64, 'PNG', x + 1, y + 1, 25, 8);
    doc.setFont('helvetica', 'bold').setFontSize(10).text('RECIBO DO PAGADOR', 195, y + 5, { align: 'right' });

    // linhas horizontais
    doc.line(x, y + h, x + w, y + h);
    doc.line(x, y + h * 2, x + w, y + h * 2);
    doc.line(x, y + h * 3, x + w, y + h * 3);

    // Beneficiário
    doc.setFontSize(7).text('Beneficiário', x + 2, y + h - 1);
    doc.setFontSize(9).text(`${dadosBoleto.cedente.nome} - CNPJ/CPF: ${formatCnpjCpf(dadosBoleto.cedente.cnpj)}`, x + 2, y + h + 3);

    // Agência / Vencimento
    doc.setFontSize(7).text('Agência/Código Beneficiário', x + 105, y + h - 1);
    doc.setFontSize(9).text(`${dadosBoleto.agencia}/${dadosBoleto.conta}`, x + 125, y + h + 3);

    doc.setFontSize(7).text('Vencimento', x + 155, y + h - 1);
    doc.setFontSize(9).text(format(vencimentoDate, 'dd/MM/yyyy'), x + 160, y + h + 3);

    // Pagador
    doc.setFontSize(7).text('Pagador', x + 2, y + h * 2 - 1);
    doc.setFontSize(9).text(`${dadosBoleto.sacado.nome} - ${formatCnpjCpf(dadosBoleto.sacado.cnpj)}`, x + 2, y + h * 2 + 3);

    doc.setFontSize(7).text('Valor do Documento', x + 150, y + h * 2 - 1);
    doc.setFontSize(9).setFont('courier', 'bold').text(formatBRLNumber(dadosBoleto.valor_bruto), x + 175, y + h * 2 + 3, { align: 'right' });
    doc.setFont('helvetica', 'normal');

    // Carteira / Espécie / Quantidade / Valor
    doc.setFontSize(7);
    doc.text('Carteira', x + 2, y + h * 3 - 1);
    doc.text('Espécie', x + 35, y + h * 3 - 1);
    doc.text('Quantidade', x + 70, y + h * 3 - 1);
    doc.text('Valor', x + 120, y + h * 3 - 1);

    doc.setFontSize(9);
    doc.text(dadosBoleto.carteira, x + 2, y + h * 3 + 3);
    doc.text('R$', x + 35, y + h * 3 + 3);
    doc.text('-', x + 85, y + h * 3 + 3);
    doc.text(formatBRLNumber(dadosBoleto.valor_bruto), x + 175, y + h * 3 + 3, { align: 'right' });

    doc.setFontSize(7).text('Autenticação mecânica', x + w, y + 35, { align: 'right' });

    // linha tracejada separadora
    doc.setLineDashPattern([2, 1], 0).line(15, 50, 195, 50).setLineDashPattern([], 0);

    // ================= FICHA DE COMPENSAÇÃO =================
    y = 55;
    if (itauLogoBase64) doc.addImage(itauLogoBase64, 'PNG', x, y, 25, 8);
    doc.setFont('helvetica', 'bold').setFontSize(12).text('341-7', x + 35, y + 6);
    doc.setFont('courier', 'bold').setFontSize(12).text(linha_digitavel, 195, y + 6, { align: 'right' });

    y = 65; // topo da ficha
    doc.rect(x, y, w, 100);

    // linhas horizontais principais
    doc.line(x, y + h, x + w, y + h);
    doc.line(x, y + h * 2, x + w, y + h * 2);
    doc.line(x, y + h * 3, x + w, y + h * 3);
    doc.line(x, y + h * 4, x + w, y + h * 4);

    // Local pagamento + vencimento
    doc.setFontSize(7).text('Local de Pagamento', x + 2, y + h - 1);
    doc.setFontSize(9).text('PAGUE PREFERENCIALMENTE NO BANCO ITAÚ', x + 2, y + h + 3);
    doc.setFontSize(7).text('Vencimento', x + 150, y + h - 1);
    doc.setFontSize(9).text(format(vencimentoDate, 'dd/MM/yyyy'), x + 175, y + h + 3, { align: 'right' });

    // Beneficiário
    doc.setFontSize(7).text('Beneficiário', x + 2, y + h * 2 - 1);
    doc.setFontSize(9).text(`${dadosBoleto.cedente.nome} - ${formatCnpjCpf(dadosBoleto.cedente.cnpj)}`, x + 2, y + h * 2 + 3);

    // Agência + Código beneficiário
    doc.setFontSize(7).text('Agência/Código Beneficiário', x + 150, y + h * 2 - 1);
    doc.setFontSize(9).text(`${dadosBoleto.agencia}/${dadosBoleto.conta}`, x + 175, y + h * 2 + 3, { align: 'right' });

    // Documento + Nosso Número
    doc.setFontSize(7).text('Data Documento', x + 2, y + h * 3 - 1);
    doc.setFontSize(9).text(format(new Date(dadosBoleto.data_operacao + 'T12:00:00Z'), 'dd/MM/yyyy'), x + 2, y + h * 3 + 3);

    doc.setFontSize(7).text('Nº Documento', x + 50, y + h * 3 - 1);
    doc.setFontSize(9).text(dadosBoleto.nf_cte, x + 50, y + h * 3 + 3);

    doc.setFontSize(7).text('Espécie Doc.', x + 90, y + h * 3 - 1);
    doc.setFontSize(9).text('DM', x + 90, y + h * 3 + 3);

    doc.setFontSize(7).text('Aceite', x + 115, y + h * 3 - 1);
    doc.setFontSize(9).text('N', x + 115, y + h * 3 + 3);

    doc.setFontSize(7).text('Nosso Número', x + 150, y + h * 3 - 1);
    doc.setFontSize(9).text(`${dadosBoleto.carteira}/${dadosBoleto.nosso_numero}`, x + 175, y + h * 3 + 3, { align: 'right' });

    // Carteira / Espécie / Quantidade / Valor
    doc.setFontSize(7).text('Carteira', x + 2, y + h * 4 - 1);
    doc.setFontSize(9).text(dadosBoleto.carteira, x + 2, y + h * 4 + 3);

    doc.setFontSize(7).text('Espécie', x + 35, y + h * 4 - 1);
    doc.setFontSize(9).text('R$', x + 35, y + h * 4 + 3);

    doc.setFontSize(7).text('Quantidade', x + 70, y + h * 4 - 1);
    doc.setFontSize(9).text('-', x + 85, y + h * 4 + 3);

    doc.setFontSize(7).text('Valor', x + 115, y + h * 4 - 1);
    doc.setFontSize(9).text('-', x + 125, y + h * 4 + 3);

    doc.setFontSize(7).text('Valor do Documento', x + 150, y + h * 4 - 1);
    doc.setFontSize(9).setFont('courier', 'bold').text(formatBRLNumber(dadosBoleto.valor_bruto), x + 175, y + h * 4 + 3, { align: 'right' });
    doc.setFont('helvetica', 'normal');

    // Instruções
    const dataVencida = format(addDays(vencimentoDate, 1), 'dd/MM/yyyy');
    const instrucoes = [
      'Instruções de responsabilidade do BENEFICIÁRIO.',
      tipoOperacao.taxa_juros_mora ? `A partir de ${dataVencida}, COBRAR JUROS DE ${tipoOperacao.taxa_juros_mora}% AO MÊS` : '',
      tipoOperacao.taxa_multa ? `A partir de ${dataVencida}, COBRAR MULTA DE ${tipoOperacao.taxa_multa}%` : '',
      `REFERENTE A NF ${dadosBoleto.nf_cte}`
    ].filter(Boolean);

    doc.setFontSize(7).text('Instruções', x + 2, y + h * 5 - 1);
    instrucoes.forEach((line, i) => {
      doc.setFontSize(8).text(line, x + 2, y + h * 5 + 3 + (i * 4));
    });

    // Pagador
    let yPagador = y + h * 5 + 15;
    doc.setFontSize(7).text('Pagador', x + 2, yPagador - 1);
    doc.setFontSize(9).text(`${dadosBoleto.sacado.nome}`, x + 2, yPagador + 3);
    doc.text(`${dadosBoleto.sacado.endereco}, ${dadosBoleto.sacado.bairro}`, x + 2, yPagador + 8);
    doc.text(`${dadosBoleto.sacado.municipio} - ${dadosBoleto.sacado.uf} CEP: ${dadosBoleto.sacado.cep}`, x + 2, yPagador + 13);
    doc.text(`CNPJ/CPF: ${formatCnpjCpf(dadosBoleto.sacado.cnpj)}`, x + 2, yPagador + 18);

    // Beneficiário Final
    doc.setFontSize(7).text('Beneficiário Final', x + 2, yPagador + 25);
    doc.setFontSize(9).text('CNPJ/CPF:', x + 2, yPagador + 30);

    // Código de barras
    if (codigo_barras) {
      drawInterleaved2of5(doc, 15, 155, codigo_barras, 160, 15);
    }
    doc.setFontSize(7).text('Autenticação mecânica - Ficha de Compensação', 195, 180, { align: 'right' });
  });

  return doc.output('arraybuffer');
}
