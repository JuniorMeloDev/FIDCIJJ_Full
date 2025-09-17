import { jsPDF } from 'jspdf';
import { format, addDays } from 'date-fns';
import { formatBRLNumber, formatCnpjCpf } from '../utils/formatters';

// --- Funções de Cálculo do Boleto (Baseado no Manual) ---

function modulo10(bloco) {
    const multiplicadores = [2, 1];
    let soma = 0;
    let i = bloco.length - 1;
    let m = 0;

    while (i >= 0) {
        let produto = parseInt(bloco.charAt(i), 10) * multiplicadores[m % 2];
        if (produto > 9) {
            produto = Math.floor(produto / 10) + (produto % 10);
        }
        soma += produto;
        i--;
        m++;
    }

    const resto = soma % 10;
    const dv = resto === 0 ? 0 : 10 - resto;
    return dv;
}

function modulo11(bloco) {
    const multiplicadores = [2, 3, 4, 5, 6, 7, 8, 9];
    let soma = 0;
    let i = bloco.length - 1;
    let m = 0;

    while (i >= 0) {
        soma += parseInt(bloco.charAt(i), 10) * multiplicadores[m % 8];
        i--;
        m++;
    }

    const resto = soma % 11;
    let dac = 11 - resto;
    if (dac === 0 || dac === 10 || dac === 11) {
        dac = 1;
    }
    return dac;
}

function gerarLinhaDigitavelEDAC(dados) {
    const { agencia, conta, nossoNumero, valor, vencimento } = dados;

    const banco = "422";
    const moeda = "9";
    const tipoCobranca = "2";

    const dataBase = new Date('2022-05-29T12:00:00Z');
    const dataVenc = new Date(vencimento + 'T12:00:00Z');
    const diffTime = Math.abs(dataVenc - dataBase);
    const fatorVencimento = Math.ceil(diffTime / (1000 * 60 * 60 * 24)).toString().padStart(4, '0');

    const valorFormatado = Math.round(valor * 100).toString().padStart(10, '0');
    const sistema = "7";
    const campoLivre = `${sistema}${agencia}${conta}${nossoNumero}${tipoCobranca}`;

    const blocoParaDAC = `${banco}${moeda}${fatorVencimento}${valorFormatado}${campoLivre}`;
    const dac = modulo11(blocoParaDAC);

    const codigoBarras = `${banco}${moeda}${dac}${fatorVencimento}${valorFormatado}${campoLivre}`;

    const campo1 = `${banco}${moeda}${campoLivre.substring(0, 5)}`;
    const dv1 = modulo10(campo1);
    const campo1Formatado = `${campo1.substring(0, 5)}.${campo1.substring(5)}${dv1}`;

    const campo2 = campoLivre.substring(5, 15);
    const dv2 = modulo10(campo2);
    const campo2Formatado = `${campo2.substring(0, 5)}.${campo2.substring(5)}${dv2}`;

    const campo3 = campoLivre.substring(15, 25);
    const dv3 = modulo10(campo3);
    const campo3Formatado = `${campo3.substring(0, 5)}.${campo3.substring(5)}${dv3}`;

    const campo4 = dac.toString();
    const campo5 = `${fatorVencimento}${valorFormatado}`;

    const linhaDigitavel = `${campo1Formatado}  ${campo2Formatado}  ${campo3Formatado}  ${campo4}  ${campo5}`;

    return { linhaDigitavel, codigoBarras };
}

// --- Função para desenhar o código de barras ---
function drawInterleaved2of5(doc, x, y, code, width = 103, height = 12) {
    const patterns = [
        '00110', '10001', '01001', '11000', '00101',
        '10100', '01100', '00011', '10010', '01010'
    ];
    const start = '0000';
    const stop = '100';

    if (code.length % 2 !== 0) {
       // O código de barras I2of5 requer um número par de dígitos
       code = '0' + code;
    }

    let binaryCode = start;
    for (let i = 0; i < code.length; i += 2) {
        const digit1 = parseInt(code[i], 10);
        const digit2 = parseInt(code[i + 1], 10);
        const pattern1 = patterns[digit1];
        const pattern2 = patterns[digit2];
        for (let j = 0; j < 5; j++) {
            binaryCode += pattern1[j] + pattern2[j];
        }
    }
    binaryCode += stop;

    // Ajuste no cálculo da largura da barra para evitar distorções
    const wideToNarrowRatio = 3;
    const numNarrowBars = binaryCode.match(/0/g).length;
    const numWideBars = binaryCode.match(/1/g).length;
    const narrowBarWidth = width / (numNarrowBars + numWideBars * wideToNarrowRatio);
    const wideBarWidth = narrowBarWidth * wideToNarrowRatio;
    
    let currentX = x;
    doc.setFillColor(0, 0, 0); // Preto
    for (let i = 0; i < binaryCode.length; i++) {
        const isBar = i % 2 === 0; // Pares são barras, ímpares são espaços
        const isWide = binaryCode[i] === '1';
        const barWidth = isWide ? wideBarWidth : narrowBarWidth;

        if (isBar) {
            doc.rect(currentX, y, barWidth, height, 'F');
        }
        currentX += barWidth;
    }
}

// --- Função Principal de Geração de PDF ---
export function gerarPdfBoletoSafra(listaBoletos) {
    const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });

    const drawField = (label, value, x, y, width, height, valueAlign = 'left', valueSize = 9, labelSize = 6) => {
        doc.setFontSize(labelSize);
        doc.setTextColor(100, 100, 100);
        doc.text(label, x + 1.5, y + 2.5);
        doc.setFontSize(valueSize);
        doc.setTextColor(0, 0, 0);
        
        const textX = valueAlign === 'right' ? x + width - 1.5 : x + 1.5;
        const textOptions = { align: valueAlign, baseline: 'bottom' };
        
        const lines = Array.isArray(value) ? value : [value];
        lines.forEach((line, i) => {
            doc.text(String(line || ''), textX, y + height - 1.5 - (lines.length - 1 - i) * 3.5, textOptions);
        });
    };

    listaBoletos.forEach((dadosBoleto, index) => {
        if (index > 0) doc.addPage();
        
        const { linhaDigitavel, codigoBarras } = gerarLinhaDigitavelEDAC({
            agencia: dadosBoleto.agencia,
            conta: dadosBoleto.conta,
            nossoNumero: dadosBoleto.documento.numero,
            valor: dadosBoleto.documento.valor,
            vencimento: dadosBoleto.documento.dataVencimento
        });

        const vencimentoDate = new Date(dadosBoleto.documento.dataVencimento + 'T12:00:00Z');

        // --- Recibo do Pagador ---
        doc.setFont('helvetica', 'bold').setFontSize(10).text('Recibo do Pagador', 15, 15);
        doc.setFont('helvetica', 'normal').setFontSize(8);

        doc.text('Beneficiário', 15, 22);
        doc.text(`${dadosBoleto.cedente.nome} - CNPJ/CPF: ${formatCnpjCpf(dadosBoleto.cedente.cnpj)}`, 15, 26);
        doc.text('Pagador', 15, 32);
        const pagadorRecibo = doc.splitTextToSize(`${dadosBoleto.documento.pagador.nome} - CNPJ/CPF: ${formatCnpjCpf(dadosBoleto.documento.pagador.numeroDocumento)}`, 130);
        doc.text(pagadorRecibo, 15, 36);

        doc.text('Vencimento', 150, 22);
        doc.text('Agência/Cód. Beneficiário', 150, 29);
        doc.text('Nosso Número', 150, 36);
        doc.text('Nº do Documento', 150, 43);
        doc.text('Valor do Documento', 150, 50);

        doc.setFont('helvetica', 'bold');
        doc.text(format(vencimentoDate, 'dd/MM/yyyy'), 195, 22, { align: 'right' });
        doc.text(`${dadosBoleto.agencia}/${dadosBoleto.conta}`, 195, 29, { align: 'right' });
        doc.text(dadosBoleto.documento.numero, 195, 36, { align: 'right' });
        doc.text(dadosBoleto.documento.numeroCliente, 195, 43, { align: 'right' });
        doc.text(formatBRLNumber(dadosBoleto.documento.valor), 195, 50, { align: 'right' });
        doc.setFont('helvetica', 'normal');

        doc.text('Autenticação Mecânica', 195, 70, { align: 'right' });
        doc.setLineDashPattern([2, 1], 0);
        doc.line(15, 80, 195, 80);
        doc.setLineDashPattern([], 0);

        // --- Ficha de Compensação ---
        doc.setLineWidth(0.5).line(40, 86, 40, 93);
        doc.setFont('helvetica', 'bold').setFontSize(12).text('422-7', 45, 90);
        doc.setLineWidth(0.5).line(55, 86, 55, 93);
        doc.setFontSize(11).setFont('courier', 'bold');
        doc.text(linhaDigitavel, 125, 90, { align: 'center' });
        
        const x = 15, y = 95, w = 180;
        doc.setLineWidth(0.2).rect(x, y, w, 55); 

        drawField('Local de Pagamento', 'Pagável em qualquer banco', x, y, 130, 10);
        doc.line(x + 130, y, x + 130, y + 55); 
        drawField('Vencimento', format(vencimentoDate, 'dd/MM/yyyy'), x + 130, y, 50, 10, 'right', 10);

        doc.line(x, y + 10, x + w, y + 10);
        drawField('Beneficiário', `${dadosBoleto.cedente.nome}`, x, y + 10, 130, 10);
        drawField('Agência/Cód. Beneficiário', `${dadosBoleto.agencia}/${dadosBoleto.conta}`, x + 130, y + 10, 50, 10, 'right');

        doc.line(x, y + 20, x + w, y + 20);
        drawField('Data do Doc.', format(new Date(dadosBoleto.documento.dataEmissao + 'T12:00:00Z'), 'dd/MM/yyyy'), x, y + 20, 25, 10);
        doc.line(x + 25, y + 20, x + 25, y + 30);
        drawField('Nº do Doc.', dadosBoleto.documento.numeroCliente, x + 25, y + 20, 35, 10);
        doc.line(x + 60, y + 20, x + 60, y + 30);
        drawField('Esp. Doc.', dadosBoleto.documento.especie, x + 60, y + 20, 15, 10);
        doc.line(x + 75, y + 20, x + 75, y + 30);
        drawField('Aceite', 'Não', x + 75, y + 20, 15, 10);
        doc.line(x + 90, y + 20, x + 90, y + 30);
        drawField('Data do Movto', format(new Date(dadosBoleto.documento.dataEmissao + 'T12:00:00Z'), 'dd/MM/yyyy'), x + 90, y + 20, 40, 10);
        drawField('Nosso Número', dadosBoleto.documento.numero, x + 130, y + 20, 50, 10, 'right');

        doc.line(x, y + 30, x + w, y + 30);
        drawField('Carteira', '60', x + 30, y + 30, 20, 10);
        doc.line(x + 30, y + 30, x + 30, y + 40);
        doc.line(x + 50, y + 30, x + 50, y + 40);
        drawField('Espécie', 'R$', x + 50, y + 30, 20, 10);
        drawField('(=) Valor do Documento', formatBRLNumber(dadosBoleto.documento.valor), x + 130, y + 30, 50, 10, 'right', 10);

        doc.line(x, y + 40, x + 130, y + 40);
        const dataJurosMulta = format(addDays(vencimentoDate, 1), 'dd/MM/yyyy');
        drawField('Instruções', [`JUROS DE R$ 22,40 AO DIA A PARTIR DE ${dataJurosMulta}`, `MULTA DE 2,00% A PARTIR DE ${dataJurosMulta}`], x, y + 40, 130, 15);

        drawField('(-) Desconto/Abatimento', '', x + 130, y + 40, 50, 7.5);
        doc.line(x + 130, y + 47.5, x + w, y + 47.5);
        drawField('(-) Outras Deduções', '', x + 130, y + 47.5, 50, 7.5);

        doc.line(x, y + 55, x + w, y + 55);
        const pagadorAddressFicha = `${dadosBoleto.documento.pagador.endereco.logradouro}\n${dadosBoleto.documento.pagador.endereco.cidade} ${dadosBoleto.documento.pagador.endereco.uf} CEP: ${dadosBoleto.documento.pagador.endereco.cep}`;
        const pagadorLinesFicha = doc.splitTextToSize(`${dadosBoleto.documento.pagador.nome}\n${pagadorAddressFicha}`, 128);
        drawField('Pagador', pagadorLinesFicha, x, y + 55, 130, 25);
        
        drawField('(+) Mora/Multa', '', x + 130, y + 55, 50, 7.5);
        doc.line(x + 130, y + 62.5, x + w, y + 62.5);
        drawField('(+) Outros Acréscimos', '', x + 130, y + 62.5, 50, 7.5);
        doc.line(x + 130, y + 70, x + w, y + 70);
        drawField('(=) Valor Cobrado', '', x + 130, y + 70, 50, 10);

        // Desenha o código de barras
        drawInterleaved2of5(doc, x + 15, 155, codigoBarras);

        doc.setFont('helvetica', 'normal').setFontSize(8);
        doc.text('Autenticação Mecânica - Ficha de Compensação', 195, 185, { align: 'right' });
    });
    
    return doc.output('arraybuffer');
}