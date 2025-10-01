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

// Função para formatar a linha digitável no formato humanizado solicitado
function formatLinhaDigitavelFrom44(cod44) {
  if (!cod44 || typeof cod44 !== 'string') return '';
  const s = cod44.replace(/\D/g, '');
  if (s.length !== 44) return cod44;
  // Montagem visual aproximada no estilo pedido: 34195.12510 00000.000000 00000.000000 0 00000000000000
  const part1 = s.slice(0, 4) + s.slice(19, 24); // banco+moeda + primeiros 5 do livre
  const p1 = part1.slice(0, 5) + '.' + part1.slice(5);
  const part2 = s.slice(24, 34);
  const p2 = part2.slice(0, 5) + '.' + part2.slice(5);
  const part3 = s.slice(34, 44);
  const p3 = part3.slice(0, 5) + '.' + part3.slice(5);
  const dv = s[4];
  const resto = s.slice(5, 19);
  return `${p1} ${p2} ${p3} ${dv} ${resto}`;
}

// Código de barras Interleaved 2 of 5 (desenho por barras) — melhor controle sobre largura/alto
function drawInterleaved2of5(doc, x, y, code, width = 160, height = 15, scaleRatio = 3) {
  if (!code) return;
  let c = String(code).replace(/\D/g, '');
  if (c.length % 2 !== 0) c = '0' + c;

  const patterns = ['00110','10001','01001','11000','00101','10100','01100','00011','10010','01010'];
  const start = '0000';
  const stop = '100';
  let binary = start;
  for (let i = 0; i < c.length; i += 2) {
    const p1 = patterns[parseInt(c[i], 10)];
    const p2 = patterns[parseInt(c[i + 1], 10)];
    for (let j = 0; j < 5; j++) binary += p1[j] + p2[j];
  }
  binary += stop;

  // calcular largura baseada em unidades estreitas/largas
  const ratio = scaleRatio;
  const counts = { narrow: 0, wide: 0 };
  for (const ch of binary) {
    if (ch === '0') counts.narrow++;
    else counts.wide++;
  }
  const totalUnits = counts.narrow + counts.wide * ratio;
  const narrowWidth = width / totalUnits;
  const wideWidth = narrowWidth * ratio;

  let curX = x;
  doc.setFillColor(0, 0, 0);
  for (let i = 0; i < binary.length; i++) {
    const isBar = i % 2 === 0;
    const wUnit = binary[i] === '1' ? wideWidth : narrowWidth;
    if (isBar) {
      // desenha barra (um pouco mais alta para ficar nítido)
      doc.rect(curX, y, wUnit, height, 'F');
    }
    curX += wUnit;
  }
}

// Campo com label + valor (ajustado para evitar overflow e alinhar textos)
const drawField = (doc, label, value, x, y, width, height, valueAlign = 'left', valueSize = 9, labelSize = 6) => {
  if (label) {
    doc.setFontSize(labelSize).setTextColor(100, 100, 100).setFont('helvetica', 'normal');
    // label posicionada no topo do campo
    doc.text(label, x + 1.5, y + 2.8);
  }
  doc.setFontSize(valueSize).setTextColor(0, 0, 0).setFont('helvetica', 'normal');

  const lines = Array.isArray(value) ? value : [value || ''];
  // medir largura do texto e ajustar se for maior que a área disponível (encolhe fonte levemente)
  lines.forEach((line, i) => {
    let txt = String(line);
    let fSize = valueSize;
    while (doc.getTextWidth(txt) > width - 3 && fSize > 6) {
      fSize -= 0.5;
      doc.setFontSize(fSize);
    }
    const textX = valueAlign === 'right' ? x + width - 1.5 : x + 1.5;
    const textY = y + height - 1.7 - (lines.length - 1 - i) * (fSize + 0.8);
    doc.text(txt, textX, textY, { align: valueAlign });
    doc.setFontSize(valueSize); // reset para próxima linha
  });
};

// Principal
export function gerarPdfBoletoItau(listaBoletos) {
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  const itauLogoBase64 = getItauLogoBase64();

  listaBoletos.forEach((dadosBoleto, index) => {
    if (index > 0) doc.addPage();

    const { linha_digitavel, codigo_barras } = dadosBoleto.boletoInfo || {};
    const vencimentoDate = new Date(dadosBoleto.data_vencimento + 'T12:00:00Z');

    // ---------- RECIBO DO PAGADOR ----------
    if (itauLogoBase64) doc.addImage(itauLogoBase64, 'PNG', 15, 12, 25, 8);
    // título alinhado à direita com margem
    doc.setFont('helvetica', 'bold').setFontSize(10).text('RECIBO DO PAGADOR', 195, 15, { align: 'right' });

    // contorno principal do recibo (reforçado)
    doc.setDrawColor(0, 0, 0).setLineWidth(0.6);
    doc.rect(15, 18, 180, 36); // retângulo maior cobrindo cabeçalho + campos
    // linhas internas horizontais para separar seções (posições ajustadas)
    doc.line(15, 26, 195, 26);
    doc.line(15, 34, 195, 34);
    doc.line(15, 46, 195, 46);

    // Campos do recibo (ajustados)
    drawField(doc, 'Beneficiário', `${dadosBoleto.cedente.nome} - CNPJ/CPF: ${formatCnpjCpf(dadosBoleto.cedente.cnpj)}`, 16, 19, 98, 10);
    // Aqui fix: se o texto do CNPJ ou beneficiário extrapolar, reduzimos fonte ou movemos campo
    const agenciaConta = `${dadosBoleto.agencia}/${dadosBoleto.conta}`;
    // calcula largura disponível dinâmica e alinha corretamente à direita
    drawField(doc, 'Agência/Código Beneficiário', agenciaConta, 115, 19, 80, 10, 'right', 9);
    drawField(doc, 'Vencimento', format(vencimentoDate, 'dd/MM/yyyy'), 155, 19, 40, 10, 'right', 9);

    drawField(doc, 'Pagador', dadosBoleto.sacado.nome, 16, 29, 120, 10);
    drawField(doc, 'Valor do Documento', formatBRLNumber(dadosBoleto.valor_bruto), 155, 29, 40, 10, 'right');

    // linha carteira/espécie/quantidade/valor
    drawField(doc, 'Carteira', dadosBoleto.carteira, 16, 39, 30, 10);
    drawField(doc, 'Espécie', 'R$', 46, 39, 20, 10);
    drawField(doc, 'Quantidade', '-', 66, 39, 40, 10);
    drawField(doc, 'Valor', formatBRLNumber(dadosBoleto.valor_bruto), 106, 39, 90, 10, 'right');

    // Autenticação mecânica afastada (abaixo das linhas internas)
    doc.setFontSize(8).setFont('helvetica', 'normal');
    doc.text('Autenticação mecânica', 195, 52, { align: 'right' });

    // Separador tracejado reforçado entre recibo e ficha
    doc.setDrawColor(100, 100, 100).setLineWidth(0.4);
    doc.setLineDashPattern([1.5, 1.5], 0);
    doc.line(15, 58, 195, 58);
    doc.setLineDashPattern([], 0);

    // ---------- FICHA (parte abaixo) ----------
    const y = 65;
    if (itauLogoBase64) doc.addImage(itauLogoBase64, 'PNG', 15, y, 25, 8);

    // código do banco (modelo) e linha digitável (centralizado)
    doc.setFontSize(12).setFont('helvetica', 'bold').text('341-7', 47.5, y + 5, { align: 'center' });
    // Se linha_digitavel não vier, faz fallback usando codigo_barras convertido (se disponível)
    const linhaParaMostrar = linha_digitavel || formatLinhaDigitavelFrom44(codigo_barras || '');
    doc.setFontSize(11).setFont('courier', 'bold').text(linhaParaMostrar, 125, y + 5, { align: 'center' });

    // caixa principal da ficha
    doc.setDrawColor(0, 0, 0).setLineWidth(0.5);
    doc.rect(15, y + 10, 180, 105);
    // divisão vertical para separar área do código de barras (ajustada)
    doc.line(145, y + 10, 145, y + 115);

    // Linha: Local de pagamento + Vencimento
    doc.line(15, y + 20, 195, y + 20);
    drawField(doc, 'Local de Pagamento', 'PAGÁVEL PREFERENCIALMENTE NO BANCO ITAÚ', 16, y + 10, 126, 10);
    drawField(doc, 'Vencimento', format(vencimentoDate, 'dd/MM/yyyy'), 145, y + 10, 50, 10, 'right');

    // Linha: Beneficiário + Agência/Código Beneficiário
    doc.line(15, y + 30, 195, y + 30);
    drawField(doc, 'Beneficiário', `${dadosBoleto.cedente.nome} - CNPJ/CPF: ${formatCnpjCpf(dadosBoleto.cedente.cnpj)}`, 16, y + 20, 126, 10);
    // fix: deslocamento para garantir que CNPJ longo não empurre campo para fora
    drawField(doc, 'Agência/Código Beneficiário', agenciaConta, 145, y + 20, 50, 10, 'right', 9);

    // Linha: Documento (vários campos pequenos)
    doc.line(15, y + 40, 195, y + 40);
    // colunas verticais auxiliares
    doc.line(40, y + 30, 40, y + 40);
    doc.line(75, y + 30, 75, y + 40);
    doc.line(95, y + 30, 95, y + 40);
    doc.line(115, y + 30, 115, y + 40);

    drawField(doc, 'Data do Documento', format(new Date(dadosBoleto.data_operacao + 'T12:00:00Z'), 'dd/MM/yyyy'), 16, y + 30, 24, 10);
    drawField(doc, 'Nº Doc.', dadosBoleto.nf_cte, 40, y + 30, 35, 10);
    drawField(doc, 'Espécie Doc.', 'DM', 75, y + 30, 20, 10);
    drawField(doc, 'Aceite', 'N', 95, y + 30, 20, 10);
    drawField(doc, 'Data Process.', format(new Date(), 'dd/MM/yyyy'), 115, y + 30, 30, 10);
    drawField(doc, 'Nosso Número', `${dadosBoleto.carteira} / ${dadosBoleto.nosso_numero}`, 145, y + 30, 50, 10, 'right');

    // Linha Carteira (com pequenas colunas)
    doc.line(15, y + 50, 195, y + 50);
    doc.line(35, y + 40, 35, y + 50);
    doc.line(55, y + 40, 55, y + 50);
    doc.line(95, y + 40, 95, y + 50);

    drawField(doc, 'Carteira', dadosBoleto.carteira, 16, y + 40, 19, 10);
    drawField(doc, 'Espécie', 'R$', 35, y + 40, 19, 10);
    drawField(doc, 'Quantidade', '-', 55, y + 40, 39, 10);
    drawField(doc, 'Valor', '-', 95, y + 40, 49, 10);
    drawField(doc, '(=) Valor Documento', formatBRLNumber(dadosBoleto.valor_bruto), 145, y + 40, 50, 10, 'right');

    // Caixa direita: descontos/juros/valor cobrado
    doc.line(145, y + 60, 195, y + 60);
    doc.line(145, y + 70, 195, y + 70);
    doc.line(145, y + 80, 195, y + 80);
    drawField(doc, '(-) Desconto/Abatimento', '', 145, y + 50, 50, 10);
    drawField(doc, '(+) Juros/Multa', '', 145, y + 60, 50, 10);
    drawField(doc, '(=) Valor Cobrado', formatBRLNumber(dadosBoleto.valor_bruto), 145, y + 70, 50, 10, 'right');

    // Instruções (com quebras se necessário)
    const dataVencida = format(addDays(vencimentoDate, 1), 'dd/MM/yyyy');
    const instrucoes = [
      dadosBoleto.operacao?.tipo_operacao?.taxa_juros_mora ? `A partir de ${dataVencida}, COBRAR JUROS DE ${dadosBoleto.operacao.tipo_operacao.taxa_juros_mora}% AO MÊS` : '',
      dadosBoleto.operacao?.tipo_operacao?.taxa_multa ? `A partir de ${dataVencida}, COBRAR MULTA DE ${dadosBoleto.operacao.tipo_operacao.taxa_multa}%` : '',
      `REFERENTE A NF ${dadosBoleto.nf_cte}`
    ].filter(Boolean);
    drawField(doc, '', instrucoes, 16, y + 50, 126, 30, 'left', 8);

    // Pagador (bloco)
    drawField(doc, 'Pagador', [
      dadosBoleto.sacado.nome,
      `${dadosBoleto.sacado.endereco}, ${dadosBoleto.sacado.bairro}`,
      `${dadosBoleto.sacado.municipio} - ${dadosBoleto.sacado.uf} CEP: ${dadosBoleto.sacado.cep}`,
      `CNPJ/CPF: ${formatCnpjCpf(dadosBoleto.sacado.cnpj)}`
    ], 16, y + 80, 126, 25, 'left', 9);

    // Linha digitável acima do código de barras (centralizada) — usamos o formato humanizado
    const linhaFormatada = linha_digitavel || formatLinhaDigitavelFrom44(codigo_barras || '');
    doc.setFont('courier', 'bold').setFontSize(12);
    doc.text(linhaFormatada, 105, y + 115, { align: 'center' });

    // Código de barras: desenha em posição controlada e com largura proporcional
    // Ajuste de altura para que as barras não se sobreponham ao texto
    const barcodeX = 20;
    const barcodeY = y + 120;
    const barcodeWidth = 160;
    const barcodeHeight = 15;
    drawInterleaved2of5(doc, barcodeX, barcodeY, codigo_barras || '', barcodeWidth, barcodeHeight, 3);

    // Autenticação Mecânica (Ficha) — deslocada para não encostar
    doc.setFontSize(8).setFont('helvetica', 'normal');
    doc.text('Autenticação Mecânica - Ficha de Compensação', 195, y + 140, { align: 'right' });
  });

  return doc.output('arraybuffer');
}