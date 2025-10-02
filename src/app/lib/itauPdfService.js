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

// Função para formatar a linha digitável
const formatLinhaDigitavel = (linha) => {
  if (!linha || linha.length < 47) {
    return linha;
  }
  return `${linha.substring(0, 5)}.${linha.substring(5, 10)} ${linha.substring(10, 15)}.${linha.substring(15, 21)} ${linha.substring(21, 26)}.${linha.substring(26, 32)} ${linha.substring(32, 33)} ${linha.substring(33)}`;
};

// Função para desenhar um campo com label e valor
const drawField = (doc, label, value, x, y, width, height, valueAlign = 'left', valueSize = 9, labelSize = 6.5) => {
  doc.setFontSize(labelSize).setTextColor(0,0,0);
  doc.text(label, x + 1, y + 2.5);
  doc.setFontSize(valueSize).setTextColor(0,0,0);
  const textX = valueAlign === 'right' ? x + width - 1 : x + 1;
  const textY = label ? y + height - 1.5 : y + (height / 2) + 1.5;

  const valueToPrint = Array.isArray(value) ? value : [value || ''];
  valueToPrint.forEach((line, index) => {
      doc.text(String(line), textX, textY + (index * 3.5), { align: valueAlign, charSpace: 0.5 });
  });
};

// Função principal para gerar o PDF
export function gerarPdfBoletoItau(listaBoletos) {
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  const itauLogoBase64 = getItauLogoBase64();

  listaBoletos.forEach((dadosBoleto) => {
    const { linha_digitavel, codigo_barras } = dadosBoleto.boletoInfo || {};
    const linhaDigitavelFormatada = formatLinhaDigitavel(linha_digitavel);
    const vencimentoDate = new Date(dadosBoleto.data_vencimento + 'T12:00:00Z');
    
    const drawSection = (yOffset) => {
        // Bloco Header
        if (itauLogoBase64) doc.addImage(itauLogoBase64, 'PNG', 15, yOffset, 20, 10);
        doc.setFont('helvetica', 'bold').setFontSize(14).text('341-7', 45, yOffset + 7);
        doc.setFont('helvetica', 'bold', 'courier').setFontSize(12).text(linhaDigitavelFormatada, 130, yOffset + 7, { align: 'center', charSpace: 1.5 });
        doc.line(38, yOffset, 38, yOffset + 10);
        doc.line(52, yOffset, 52, yOffset + 10);

        // Bloco 1
        const y1 = yOffset + 10;
        doc.line(15, y1, 195, y1);
        doc.setFont('helvetica', 'normal').setFontSize(6.5).text('Local de pagamento:', 16, y1 + 2.5);
        doc.setFontSize(9).text('Pague pelo aplicativo, internet ou em agências e correspondentes.', 43, y1 + 2.5);
        drawField(doc, 'Vencimento', format(vencimentoDate, 'dd/MM/yyyy'), 150, y1, 45, 10, 'right');
        doc.line(150, y1, 150, y1 + 20);

        // Bloco 2
        const y2 = y1 + 10;
        doc.line(15, y2, 195, y2);
        drawField(doc, 'Beneficiário', [dadosBoleto.cedente.nome, dadosBoleto.cedente.endereco, `CNPJ/CPF: ${formatCnpjCpf(dadosBoleto.cedente.cnpj)}`], 15, y2, 135, 10, 'left', 8);
        drawField(doc, 'Agência/Código Beneficiário', `${dadosBoleto.agencia}/${dadosBoleto.conta}`, 150, y2, 45, 10, 'right');

        // Bloco 3
        const y3 = y2 + 10;
        doc.line(15, y3, 195, y3);
        drawField(doc, 'Data do documento', format(new Date(dadosBoleto.data_operacao + 'T12:00:00Z'), 'dd/MM/yyyy'), 15, y3, 30, 10);
        drawField(doc, 'Núm. do documento', dadosBoleto.nf_cte, 45, y3, 25, 10);
        drawField(doc, 'Espécie Doc.', 'DM', 70, y3, 20, 10);
        drawField(doc, 'Aceite', 'N', 90, y3, 15, 10);
        drawField(doc, 'Data Processamento', format(new Date(), 'dd/MM/yyyy'), 105, y3, 30, 10);
        drawField(doc, 'Nosso Número', `${dadosBoleto.carteira}/${dadosBoleto.nosso_numero}`, 150, y3, 45, 10, 'right');
        
        // Bloco 4
        const y4 = y3 + 10;
        doc.line(15, y4, 150, y4);
        drawField(doc, 'Uso do Banco', '', 15, y4, 25, 10);
        drawField(doc, 'Carteira', dadosBoleto.carteira, 40, y4, 20, 10);
        drawField(doc, 'Espécie', 'R$', 60, y4, 15, 10);
        drawField(doc, 'Quantidade', '', 75, y4, 37.5, 10);
        drawField(doc, 'Valor', '', 112.5, y4, 37.5, 10);
        
        // Caixa Direita (Valores)
        doc.line(150, y1, 150, y4 + 40);
        drawField(doc, '(=) Valor do Documento', formatBRLNumber(dadosBoleto.valor_bruto), 150, y4, 45, 10, 'right');
        doc.line(150, y4 + 10, 195, y4 + 10);
        drawField(doc, '(-) Descontos/Abatimento', '', 150, y4 + 10, 45, 10, 'right');
        doc.line(150, y4 + 20, 195, y4 + 20);
        drawField(doc, '(+) Juros/Multa', '', 150, y4 + 20, 45, 10, 'right');
        doc.line(150, y4 + 30, 195, y4 + 30);
        drawField(doc, '(=) Valor Cobrado', '', 150, y4 + 30, 45, 10, 'right');
        
        // Bloco 5 - Instruções e Pagador
        const y5 = y4 + 10;
        const instrucoesLines = [
            `Instruções de responsabilidade do BENEFICIÁRIO. Qualquer dúvida sobre este boleto contate o BENEFICIÁRIO.`,
            dadosBoleto.operacao?.tipo_operacao?.taxa_juros_mora ? `APÓS 1 DIA(S) CORRIDO(S) DO VENCIMENTO COBRAR JUROS DE ${dadosBoleto.operacao.tipo_operacao.taxa_juros_mora.toFixed(2).replace('.',',')}% AO MES` : null,
            dadosBoleto.operacao?.tipo_operacao?.taxa_multa ? `APOS 1 DIA(S) CORRIDO(S) DO VENCIMENTO COBRAR MULTA DE ${dadosBoleto.operacao.tipo_operacao.taxa_multa.toFixed(2).replace('.',',')}%` : null,
            `REFERENTE A NF ${dadosBoleto.nf_cte}`
        ].filter(Boolean);
        drawField(doc, '', instrucoesLines, 15, y5, 135, 30, 'left', 8);

        const pagadorLines = [
            `Pagador: ${dadosBoleto.sacado.nome}`,
            `${dadosBoleto.sacado.endereco}, ${dadosBoleto.sacado.cep} - ${dadosBoleto.sacado.bairro} - ${dadosBoleto.sacado.municipio} - ${dadosBoleto.sacado.uf}`,
            `CNPJ/CPF: ${formatCnpjCpf(dadosBoleto.sacado.cnpj)}`,
        ];
        drawField(doc, '', pagadorLines, 15, y5 + 20, 135, 10, 'left', 8);
        doc.setFontSize(6.5).text('Beneficiário final:', 16, y5 + 32);
        doc.setFontSize(8).text('CNPJ/CPF:', 32, y5 + 32);

        // Barcode e Autenticação
        drawInterleaved2of5(doc, 15, y5 + 45, codigo_barras, 180, 20);
        doc.setFontSize(8).text('Autenticação mecânica', 195, yOffset + 138, {align: 'right'});
    };

    // --- Seção 1: Recibo do Pagador ---
    drawSection(15);
    doc.setFont('helvetica', 'bold').setFontSize(10).text('RECIBO DO PAGADOR', 195, 12, { align: 'right' });
    doc.setLineDashPattern([2, 1], 0).line(15, 150, 195, 150).setLineDashPattern([], 0);
    
    // --- Seção 2: Ficha de Compensação ---
    drawSection(155);
    doc.setFont('helvetica', 'bold').setFontSize(10).text('Ficha de Compensação', 195, 152, { align: 'right' });

    // Rodapé
    doc.setFontSize(6).setTextColor(100,100,100);
    const footerText = 'Em caso de dúvidas, de posse do comprovante, contate seu gerente ou a Central no 4004 1685 (capitais e regiões metropolitanas) ou 0800 770 1685 (demais localidades). Reclamações, informações e cancelamentos: SAC 0800 728 0728, 24 horas por dia. Fale Conosco: www.itau.com.br/empresas. Se não ficar satisfeito com a solução, contate a Ouvidoria: 0800 570 0011, em dias úteis, das 9h às 18h. Deficiente auditivo/fala: 0800 722 1722.';
    doc.text(footerText, 15, 288, { maxWidth: 180 });

  });

  return doc.output('arraybuffer');
}