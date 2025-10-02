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

// Nova função para formatar a linha digitável
const formatLinhaDigitavel = (linha) => {
  if (!linha || linha.length !== 47) {
    return linha;
  }
  return `${linha.substring(0, 5)}.${linha.substring(5, 10)} ${linha.substring(10, 15)}.${linha.substring(15, 21)} ${linha.substring(21, 26)}.${linha.substring(26, 32)} ${linha.substring(32, 33)} ${linha.substring(33)}`;
};


// Campo com label + valor (espaçamento entre linhas ajustado)
const drawField = (doc, label, value, x, y, width, height, valueAlign = 'left', valueSize = 9, labelSize = 6) => {
  if (label) {
    doc.setFontSize(labelSize).setTextColor(100, 100, 100);
    doc.text(label, x + 1.5, y + 2.5);
  }
  doc.setFontSize(valueSize).setTextColor(0, 0, 0);
  const textX = valueAlign === 'right' ? x + width - 1.5 : x + 1.5;
  const lines = Array.isArray(value) ? value : [value || ''];
  lines.forEach((line, i) => {
    // AJUSTE: Aumentado o espaçamento vertical de 3.5 para 4 para evitar sobreposição
    doc.text(String(line), textX, y + height - 1.5 - (lines.length - 1 - i) * 4, { align: valueAlign });
  });
};


// Função principal
export function gerarPdfBoletoItau(listaBoletos) {
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  const itauLogoBase64 = getItauLogoBase64();

  listaBoletos.forEach((dadosBoleto, index) => {
    if (index > 0) doc.addPage();

    const { linha_digitavel, codigo_barras } = dadosBoleto.boletoInfo || {};
    // AJUSTE: Formata a linha digitável antes de usá-la
    const linhaDigitavelFormatada = formatLinhaDigitavel(linha_digitavel);
    const vencimentoDate = new Date(dadosBoleto.data_vencimento + 'T12:00:00Z');
    
    // =================================================================
    // RECIBO DO PAGADOR (Layout revisado)
    // =================================================================
    const yRecibo = 10;
    if (itauLogoBase64) doc.addImage(itauLogoBase64, 'PNG', 15, yRecibo + 2, 25, 8);
    doc.setFont('helvetica','normal').setFontSize(10).text('341-7', 45, yRecibo + 6);
    doc.setFont('helvetica','bold').setFontSize(10).text('RECIBO DO PAGADOR', 195, yRecibo + 5, { align: 'right' });
    
    // Campos do Recibo
    const yCamposRecibo = yRecibo + 12;
    drawField(doc, 'Beneficiário', [dadosBoleto.cedente.nome, `${dadosBoleto.cedente.endereco}`, `CNPJ/CPF: ${formatCnpjCpf(dadosBoleto.cedente.cnpj)}`], 15, yCamposRecibo, 140, 15, 'left', 8);
    drawField(doc, 'Vencimento', format(vencimentoDate, 'dd/MM/yyyy'), 155, yCamposRecibo, 40, 8, 'right');
    drawField(doc, 'Agência/Código Beneficiário', `${dadosBoleto.agencia}/${dadosBoleto.conta}`, 155, yCamposRecibo + 7, 40, 8, 'right');
    drawField(doc, 'Nosso Número', `${dadosBoleto.carteira}/${dadosBoleto.nosso_numero}`, 155, yCamposRecibo + 14, 40, 8, 'right');
    drawField(doc, '() Valor do Documento', formatBRLNumber(dadosBoleto.valor_bruto), 155, yCamposRecibo + 21, 40, 8, 'right');

    doc.line(15, yCamposRecibo + 29, 195, yCamposRecibo + 29);

    drawField(doc, 'Pagador', [dadosBoleto.sacado.nome, dadosBoleto.sacado.endereco, `CNPJ/CPF: ${formatCnpjCpf(dadosBoleto.sacado.cnpj)}`], 15, yCamposRecibo + 30, 140, 15, 'left', 8);
    
    doc.line(15, yCamposRecibo + 45, 195, yCamposRecibo + 45);
    
    doc.setFontSize(8).text('Autenticação mecânica', 195, yCamposRecibo + 48, { align: 'right' });
    doc.setLineDashPattern([2,1],0).line(15, yRecibo + 68, 195, yRecibo + 68).setLineDashPattern([],0);

    // =================================================================
    // FICHA DE COMPENSAÇÃO (Layout revisado)
    // =================================================================
    const y = 80;
    if (itauLogoBase64) doc.addImage(itauLogoBase64, 'PNG', 15, y, 25, 8);
    doc.setFont('helvetica','bold').setFontSize(12).text('341-7', 47.5, y + 5, { align: 'center' });
    doc.line(42, y, 42, y + 10);
    doc.line(53, y, 53, y + 10);
    // AJUSTE: Usa a variável com a linha digitável formatada
    doc.setFontSize(11).setFont('courier','bold').text(linhaDigitavelFormatada, 125, y + 5, { align: 'center' });

    doc.rect(15, y + 10, 180, 105);
    doc.line(145, y + 10, 145, y + 115);

    doc.line(15, y + 20, 195, y + 20);
    const localPgto = "Pague pelo aplicativo, internet ou em agências e correspondentes.";
    drawField(doc, 'Local de pagamento', localPgto, 15, y + 10, 130, 10, 'left', 9);
    drawField(doc, 'Vencimento', format(vencimentoDate, 'dd/MM/yyyy'), 145, y + 10, 50, 10, 'right');

    doc.line(15, y + 30, 195, y + 30);
    const beneficiarioLines = [
        dadosBoleto.cedente.nome,
        `${dadosBoleto.cedente.endereco}, ${dadosBoleto.cedente.bairro}`,
        `${dadosBoleto.cedente.municipio} - ${dadosBoleto.cedente.uf}`
    ];
    drawField(doc, 'Beneficiário', beneficiarioLines, 15, y + 20, 130, 10, 'left', 8);
    drawField(doc, 'Agência/Código Beneficiário', `${dadosBoleto.agencia}/${dadosBoleto.conta}`, 145, y + 20, 50, 10, 'right');
    
    doc.line(15, y + 40, 195, y + 40);
    doc.line(45, y + 30, 45, y + 40);
    doc.line(75, y + 30, 75, y + 40);
    doc.line(90, y + 30, 90, y + 40);
    doc.line(110, y + 30, 110, y + 40);
    drawField(doc, 'Data do documento', format(new Date(dadosBoleto.data_operacao + 'T12:00:00Z'), 'dd/MM/yyyy'), 15, y + 30, 30, 10);
    drawField(doc, 'Núm. do documento', dadosBoleto.nf_cte, 45, y + 30, 30, 10);
    drawField(doc, 'Espécie Doc.', 'DM', 75, y + 30, 15, 10);
    drawField(doc, 'Aceite', 'N', 90, y + 30, 20, 10);
    drawField(doc, 'Data Processamento', format(new Date(), 'dd/MM/yyyy'), 110, y + 30, 35, 10);
    drawField(doc, 'Nosso Número', `${dadosBoleto.carteira}/${dadosBoleto.nosso_numero}`, 145, y + 30, 50, 10, 'right');

    doc.line(15, y + 50, 145, y + 50);
    doc.line(35, y + 40, 35, y + 50);
    doc.line(55, y + 40, 55, y + 50);
    doc.line(80, y + 40, 80, y + 50);
    drawField(doc, 'Carteira', dadosBoleto.carteira, 15, y + 40, 20, 10);
    drawField(doc, 'Espécie', 'R$', 35, y + 40, 20, 10);
    drawField(doc, 'Quantidade', '', 55, y + 40, 25, 10);
    drawField(doc, 'Uso do Banco', '', 80, y + 40, 65, 10);
    drawField(doc, '(=) Valor do Documento', formatBRLNumber(dadosBoleto.valor_bruto), 145, y + 40, 50, 10, 'right');

    doc.line(145, y + 60, 195, y + 60);
    doc.line(145, y + 70, 195, y + 70);
    doc.line(145, y + 80, 195, y + 80);
    drawField(doc, '(-) Descontos/Abatimento', '', 145, y + 50, 50, 10);
    drawField(doc, '(+) Juros/Multa', '', 145, y + 60, 50, 10);
    drawField(doc, '(=) Valor Cobrado', '', 145, y + 70, 50, 10, 'right');

    // AJUSTE: Coordenada 'y' do cabeçalho das instruções para evitar sobreposição
    const instrucoesHeader = "Instruções de responsabilidade do BENEFICIARIO. Qualquer dúvida sobre este boleto contate o BENEFICIÁRIO.";
    doc.setFontSize(7).setTextColor(0, 0, 0).text(instrucoesHeader, 16.5, y + 53);
    
    const instrucoesLines = [
        dadosBoleto.operacao?.tipo_operacao?.taxa_juros_mora ? `APÓS 1 DIA(S) CORRIDO(S) DO VENCIMENTO COBRAR JUROS DE ${dadosBoleto.operacao.tipo_operacao.taxa_juros_mora.toFixed(2).replace('.',',')}% AO MES` : '',
        dadosBoleto.operacao?.tipo_operacao?.taxa_multa ? `APOS 1 DIA(S) CORRIDO(S) DO VENCIMENTO COBRAR MULTA DE ${dadosBoleto.operacao.tipo_operacao.taxa_multa.toFixed(2).replace('.',',')}%` : '',
        `REFERENTE A NF ${dadosBoleto.nf_cte}`
    ].filter(Boolean);
    // AJUSTE: Coordenada 'y' e altura do campo de instruções para evitar sobreposição
    drawField(doc, '', instrucoesLines, 15, y + 56, 130, 24, 'left', 8);

    drawField(doc, 'Pagador', [
      dadosBoleto.sacado.nome,
      `${dadosBoleto.sacado.endereco}, ${dadosBoleto.sacado.bairro}`,
      `${dadosBoleto.sacado.municipio} - ${dadosBoleto.sacado.uf} CEP: ${dadosBoleto.sacado.cep}`,
      `CNPJ/CPF: ${formatCnpjCpf(dadosBoleto.sacado.cnpj)}`
    ], 15, y + 80, 130, 25, 'left', 9);

    drawField(doc, 'Beneficiário final', 'CNPJ/CPF:', 15, y + 105, 130, 10, 'left', 8);
    
    drawInterleaved2of5(doc, 20, y + 120, codigo_barras, 160, 15);
    doc.setFontSize(8).text('Autenticação Mecânica - Ficha de Compensação', 195, y + 140, { align: 'right' });
  });

  return doc.output('arraybuffer');
}