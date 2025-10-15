import { jsPDF } from 'jspdf';
import { format, differenceInDays } from 'date-fns';
import { formatBRLNumber, formatCnpjCpf } from '../utils/formatters';
import fs from 'fs';
import path from 'path';



function modulo10(bloco) {
    const multiplicadores = [2, 1];
    let soma = 0;
    for (let i = bloco.length - 1; i >= 0; i--) {
        let produto = parseInt(bloco[i], 10) * multiplicadores[(bloco.length - 1 - i) % 2];
        if (produto > 9) {
            produto = Math.floor(produto / 10) + (produto % 10);
        }
        soma += produto;
    }
    const resto = soma % 10;
    return resto === 0 ? 0 : 10 - resto;
}

function modulo11(bloco) {
    const multiplicadores = [2, 3, 4, 5, 6, 7, 8, 9];
    let soma = 0;
    for (let i = bloco.length - 1; i >= 0; i--) {
        soma += parseInt(bloco[i], 10) * multiplicadores[(bloco.length - 1 - i) % 8];
    }
    const resto = soma % 11;
    const dac = 11 - resto;
    return (dac === 0 || dac === 10 || dac === 11) ? 1 : dac;
}

const getAgenciaContaDAC = (agencia, conta) => modulo10(`${agencia}${conta}`);

// CORREÇÃO: A função PRECISA ser exportada para ser utilizada na API route.js
export const getNossoNumeroDAC = (agencia, conta, carteira, nossoNumero) => { 
    let sequencia;
    if (carteira === '109') {
        // Para a carteira 109, o cálculo NÃO inclui a carteira.
        sequencia = `${agencia}${conta}${nossoNumero}`;
    } else {
        // Para as demais carteiras (como a 157), o cálculo INCLUI a carteira.
        sequencia = `${agencia}${conta}${carteira}${nossoNumero}`;
    }
    return modulo10(sequencia);
};

function gerarLinhaDigitavelECodigoBarras(dados) {
    const { agencia, conta, carteira, nossoNumero, valor, vencimento } = dados;
    const banco = "341";
    const moeda = "9";
    
    const dataBase = new Date('1997-10-07T12:00:00Z');
    const dataVenc = new Date(vencimento + 'T12:00:00Z');
    
    const diasCorridos = Math.ceil((dataVenc - dataBase) / (1000 * 60 * 60 * 24));
    let fatorVencimento;

    if (diasCorridos > 9999) {
        fatorVencimento = (diasCorridos - 9000).toString().padStart(4, '0');
    } else {
        fatorVencimento = diasCorridos.toString().padStart(4, '0');
    }

    const valorFormatado = Math.round(valor * 100).toString().padStart(10, '0');
    const nossoNumeroSemDac = nossoNumero.padStart(8, '0');
    const contaSemDac = (conta || '').split('-')[0].padStart(5, '0');

    // A função getNossoNumeroDAC é usada aqui dentro também
    const dacNossoNumero = getNossoNumeroDAC(agencia, contaSemDac, carteira, nossoNumeroSemDac);
    const dacAgenciaConta = getAgenciaContaDAC(agencia, contaSemDac);

    const campoLivre = `${carteira}${nossoNumeroSemDac}${dacNossoNumero}${agencia}${contaSemDac}${dacAgenciaConta}000`;
    const blocoParaDAC = `${banco}${moeda}${fatorVencimento}${valorFormatado}${campoLivre}`;
    const dacGeral = modulo11(blocoParaDAC);
    
    if (dacGeral === 0) throw new Error("O cálculo do DAC geral resultou em zero, o que é inválido.");
    
    const codigoBarras = `${banco}${moeda}${dacGeral}${fatorVencimento}${valorFormatado}${campoLivre}`;
    
    const campo1 = `${banco}${moeda}${campoLivre.substring(0, 5)}`;
    const dv1 = modulo10(campo1);
    const campo2 = campoLivre.substring(5, 15);
    const dv2 = modulo10(campo2);
    const campo3 = campoLivre.substring(15, 25);
    const dv3 = modulo10(campo3);
    const campo4 = dacGeral;
    const campo5 = `${fatorVencimento}${valorFormatado}`;
    
    const linhaDigitavel = 
        `${campo1.substring(0,5)}.${campo1.substring(5)}${dv1} ` +
        `${campo2.substring(0,5)}.${campo2.substring(5)}${dv2} ` +
        `${campo3.substring(0,5)}.${campo3.substring(5)}${dv3} ` +
        `${campo4}  ${campo5}`;

    return { linhaDigitavel, codigoBarras };
}

const getItauLogoBase64 = () => {
  try {
    const imagePath = path.resolve(process.cwd(), 'public', 'itau.png');
    return `data:image/png;base64,${fs.readFileSync(imagePath).toString('base64')}`;
  } catch { return null; }
};

function drawInterleaved2of5(doc, x, y, code, width = 103, height = 13) {
  if (!code || !/^\d+$/.test(code)) return;
  const patterns = ['00110','10001','01001','11000','00101','10100','01100','00011','10010','01010'];
  const start = '0000', stop = '100';
  let binaryCode = start;
  if (code.length % 2 !== 0) code = '0' + code;
  for (let i = 0; i < code.length; i += 2) {
    const p1 = patterns[parseInt(code[i], 10)], p2 = patterns[parseInt(code[i+1], 10)];
    for (let j = 0; j < 5; j++) binaryCode += p1[j] + p2[j];
  }
  binaryCode += stop;
  const ratio = 3;
  const numNarrow = (binaryCode.match(/0/g) || []).length, numWide = (binaryCode.match(/1/g) || []).length;
  const narrowWidth = width / (numNarrow + numWide * ratio);
  let currentX = x;
  doc.setFillColor(0,0,0);
  for (let i = 0; i < binaryCode.length; i++) {
    const isBar = i % 2 === 0;
    const barWidth = binaryCode[i] === '1' ? narrowWidth * ratio : narrowWidth;
    if (isBar) doc.rect(currentX, y, barWidth, height, 'F');
    currentX += barWidth;
  }
}

const drawField = (doc, label, value, x, y, width, height, valueAlign = 'left', valueSize = 9, labelSize = 6.5) => {
    doc.setFontSize(labelSize).setTextColor(0,0,0);
    doc.text(label || '', x + 1, y + 2.5);
    doc.setFont('helvetica', 'normal').setFontSize(valueSize).setTextColor(0,0,0);
    const textX = valueAlign === 'right' ? x + width - 1 : (valueAlign === 'center' ? x + width / 2 : x + 1);
    const textY = label ? y + 6.5 : y + height / 2 + 1.5;
    const lines = (Array.isArray(value) ? value : [value]).filter(line => line !== null && line !== undefined && String(line).trim() !== '').map(line => String(line));
    if (lines.length > 0) {
        doc.text(lines, textX, textY, { align: valueAlign, lineHeightFactor: 1.15 });
    }
};

export function gerarPdfBoletoItau(listaBoletos) {
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  const itauLogoBase64 = getItauLogoBase64();

  listaBoletos.forEach((dadosBoleto, index) => {
    if (index > 0) doc.addPage();

    const valorFinalBoleto = dadosBoleto.valor_bruto - (dadosBoleto.abatimento || 0);
    
    const { linhaDigitavel, codigoBarras } = gerarLinhaDigitavelECodigoBarras({
        agencia: dadosBoleto.agencia, conta: dadosBoleto.conta, carteira: dadosBoleto.carteira,
        nossoNumero: dadosBoleto.nosso_numero, valor: valorFinalBoleto,
        vencimento: dadosBoleto.data_vencimento
    });
    const vencimentoDate = new Date(dadosBoleto.data_vencimento + 'T12:00:00Z');

    // Recupera a informação do "Nosso Número" com o DV que foi calculado na rota
    const nossoNumeroImpresso = `${dadosBoleto.carteira}/${dadosBoleto.nosso_numero}-${dadosBoleto.dac_nosso_numero}`;
    
    const drawSection = (yOffset) => {
        doc.setLineWidth(0.2);
        if (itauLogoBase64) doc.addImage(itauLogoBase64, 'PNG', 15, yOffset + 1, 30, 8);
        doc.setLineWidth(0.5).line(48, yOffset, 48, yOffset + 10);
        doc.setFont('helvetica', 'bold').setFontSize(14).text('341-7', 55.5, yOffset + 7, { align: 'center' });
        doc.setLineWidth(0.5).line(63, yOffset, 63, yOffset + 10);
        doc.setFont('helvetica', 'bold').setFontSize(10).text(linhaDigitavel, 65, yOffset + 7, { charSpace: 0.5 });

        const y1 = yOffset + 10;
        drawField(doc, 'Local de pagamento', 'Pague pelo aplicativo, internet ou em agências e correspondentes.', 15, y1, 140, 10, 'left', 8);
        drawField(doc, 'Vencimento', format(vencimentoDate, 'dd/MM/yyyy'), 155, y1, 40, 10, 'right', 9);

        const y2 = y1 + 10;
        const beneficiarioLine1 = `${dadosBoleto.cedente?.nome || ''}    CNPJ/CPF: ${formatCnpjCpf(dadosBoleto.cedente?.cnpj)}`;
        const beneficiarioLine2 = dadosBoleto.cedente?.endereco;
        drawField(doc, 'Beneficiário', [beneficiarioLine1, beneficiarioLine2], 15, y2, 140, 15, 'left', 8);
        drawField(doc, 'Agência/Código Beneficiário', `${dadosBoleto.agencia}/${dadosBoleto.conta}`, 155, y2, 40, 15, 'right');

        const y3 = y2 + 15;
        drawField(doc, 'Data do documento', format(new Date(dadosBoleto.data_operacao + 'T12:00:00Z'), 'dd/MM/yyyy'), 15, y3, 30, 10, 'left', 8);
        drawField(doc, 'Núm. do documento', (dadosBoleto.nf_cte || '').split('.')[0], 45, y3, 30, 10, 'left', 8);
        drawField(doc, 'Espécie Doc.', 'DM', 75, y3, 20, 10, 'left', 8);
        drawField(doc, 'Aceite', 'N', 95, y3, 15, 10, 'left', 8);
        drawField(doc, 'Data Processamento', format(new Date(), 'dd/MM/yyyy'), 110, y3, 45, 10, 'left', 8);
        
        // Usa a variável 'nossoNumeroImpresso' que contém o dígito
        drawField(doc, 'Nosso Número', nossoNumeroImpresso, 155, y3, 40, 10, 'right');

        const y4 = y3 + 10;
        drawField(doc, 'Uso do Banco', '', 15, y4, 25, 10);
        drawField(doc, 'Carteira', dadosBoleto.carteira, 40, y4, 15, 10, 'center');
        drawField(doc, 'Espécie', 'R$', 55, y4, 15, 10, 'center');
        drawField(doc, 'Quantidade', '', 70, y4, 30, 10);
        drawField(doc, 'Valor', '', 100, y4, 55, 10);
        
        const y5 = y4 + 10;
        const tipoOp = dadosBoleto.operacao?.tipo_operacao;
        
        const jurosText = tipoOp?.taxa_juros_mora > 0 ? `APÓS 1 DIA(S) CORRIDO(S) DO VENCIMENTO COBRAR JUROS DE ${tipoOp.taxa_juros_mora.toFixed(2).replace('.',',')}% AO MÊS` : null;
        const multaText = tipoOp?.taxa_multa > 0 ? `APÓS 1 DIA(S) CORRIDO(S) DO VENCIMENTO COBRAR MULTA DE ${tipoOp.taxa_multa.toFixed(2).replace('.',',')}%` : null;
        const abatimentoText = (dadosBoleto.abatimento && dadosBoleto.abatimento > 0) ? `CONCEDER ABATIMENTO DE ${formatBRLNumber(dadosBoleto.abatimento)}` : null;

        const instrucoes = [
            'Instruções de responsabilidade do BENEFICIÁRIO. Qualquer dúvida sobre este boleto contate o BENEFICIÁRIO.',
            '',
            jurosText,
            multaText,
            (jurosText || multaText) ? '' : null,
            'PROTESTAR APÓS 5 DIAS DO VENCIMENTO',
            abatimentoText ? '' : null,
            abatimentoText,
            abatimentoText ? '' : null,
            `REFERENTE A NF ${(dadosBoleto.nf_cte || '').split('.')[0]}`
        ];
        doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(0,0,0);
        doc.text(instrucoes.filter(item => item !== null), 16, y5 + 3, { lineHeightFactor: 1.15, maxWidth: 135 });

        drawField(doc, '(=) Valor do Documento', formatBRLNumber(valorFinalBoleto), 155, y4, 40, 10, 'right', 9);
        drawField(doc, '(-) Descontos/Abatimento', '', 155, y5, 40, 10);
        drawField(doc, '(+) Juros/Multa', '', 155, y5 + 10, 40, 10);
        drawField(doc, '(=) Valor Cobrado', '', 155, y5 + 20, 40, 10);
        
        const y6 = y5 + 30;
        const sacado = dadosBoleto.sacado || {};
        const pagadorLine1 = `${sacado.nome || ''}    CNPJ/CPF: ${formatCnpjCpf(sacado.cnpj)}`;
        const pagadorLine2 = `${sacado.endereco || ''}, ${sacado.bairro || ''}`;
        const pagadorLine3 = `${sacado.cep || ''} ${sacado.municipio || ''} - ${sacado.uf || ''}`;
        drawField(doc, 'Pagador', null, 15, y6, 180, 20);
        doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(0,0,0);
        doc.text([pagadorLine1, pagadorLine2, pagadorLine3], 16, y6 + 5, { lineHeightFactor: 1.15 });

        const y7 = y6 + 20;
        drawInterleaved2of5(doc, 15, y7 + 2, codigoBarras, 103, 13);
        doc.setFontSize(8).text('Autenticação mecânica', 195, y7 + 18, {align: 'right'});

        doc.setLineWidth(0.2);
        const allY = [yOffset, y1, y2, y3, y4, y5, y6, y7];
        allY.forEach(yPos => doc.line(15, yPos, 195, yPos)); 
        doc.line(15, yOffset, 15, y7);
        doc.line(195, yOffset, 195, y7);
        doc.line(155, y1, 155, y6);
        doc.line(45, y3, 45, y4); doc.line(75, y3, 75, y4); doc.line(95, y3, 95, y4); doc.line(110, y3, 110, y4);
        doc.line(40, y4, 40, y5); doc.line(55, y4, 55, y5); doc.line(70, y4, 70, y5); doc.line(100, y4, 100, y5);
        doc.line(155, y5 + 10, 195, y5 + 10);
        doc.line(155, y5 + 20, 195, y5 + 20);
    };

    drawSection(15);
    doc.setFont('helvetica', 'bold').setFontSize(9).text('RECIBO DO PAGADOR', 15, 12);
    doc.setLineDashPattern([2, 1], 0).line(15, 148, 195, 148).setLineDashPattern([], 0);
    
    drawSection(155);
    doc.setFont('helvetica', 'bold').setFontSize(9).text('Ficha de Compensação', 15, 152);

    doc.setFontSize(6).setTextColor(100,100,100);
    const footerText = 'Em caso de dúvidas, de posse do comprovante, contate seu gerente ou a Central no 4004 1685 (capitais e regiões metropolitanas) ou 0800 770 1685 (demais localidades). Reclamações, informações e cancelamentos: SAC 0800 728 0728, 24 horas por dia. Fale Conosco: www.itau.com.br/empresas. Se não ficar satisfeito com a solução, contate a Ouvidoria: 0800 570 0011, em dias úteis, das 9h às 18h. Deficiente auditivo/fala: 0800 722 1722.';
    doc.text(footerText, 15, 288, { maxWidth: 180, align: 'justify' });
  });

  return doc.output('arraybuffer');
}