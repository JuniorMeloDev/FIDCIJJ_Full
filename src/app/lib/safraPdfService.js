import { jsPDF } from 'jspdf';
import { format, addDays } from 'date-fns';
import { formatBRLNumber, formatCnpjCpf } from '../utils/formatters';
import fs from 'fs';
import path from 'path';

const getSafraLogoBase64 = () => {
    try {
        const imagePath = path.resolve(process.cwd(), 'public', 'safra.png');
        const imageBuffer = fs.readFileSync(imagePath);
        return `data:image/png;base64,${imageBuffer.toString('base64')}`;
    } catch (error) {
        console.error("Erro ao carregar a imagem do logo Safra:", error);
        return null;
    }
};


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
    const dataBase = new Date('1997-10-07T12:00:00Z');
    const dataVenc = new Date(vencimento + 'T12:00:00Z');
    let fatorVencimento;

    if (dataVenc >= new Date('2025-02-22T12:00:00Z')) {
        const novaDataBase = new Date('2025-02-21T12:00:00Z');
        const diffTime = dataVenc - novaDataBase;
        fatorVencimento = (1000 + Math.ceil(diffTime / (1000 * 60 * 60 * 24))).toString().padStart(4, '0');
    } else {
        const diffTime = dataVenc - dataBase;
        fatorVencimento = Math.ceil(diffTime / (1000 * 60 * 60 * 24)).toString().padStart(4, '0');
    }

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

function drawInterleaved2of5(doc, x, y, code, width = 103, height = 13) {
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

export function gerarPdfBoletoSafra(listaBoletos) {
    const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
    const safraLogoBase64 = getSafraLogoBase64();

    const drawField = (label, value, x, y, width, height, valueAlign = 'left', valueSize = 9, labelSize = 6) => {
        doc.setFontSize(labelSize);
        doc.setTextColor(100, 100, 100);
        doc.text(label, x + 1.5, y + 2.5);
        doc.setFontSize(valueSize);
        doc.setTextColor(0, 0, 0);
        const textX = valueAlign === 'right' ? x + width - 1.5 : x + 1.5;
        const lines = Array.isArray(value) ? value : [value];
        lines.forEach((line, i) => {
            doc.text(String(line || ''), textX, y + height - 1.5 - (lines.length - 1 - i) * 3.5, { align: valueAlign, baseline: 'bottom' });
        });
    };

    listaBoletos.forEach((dadosBoleto, index) => {
        if (index > 0) doc.addPage();
        const { linhaDigitavel, codigoBarras } = gerarLinhaDigitavelEDAC({
            agencia: dadosBoleto.agencia, conta: dadosBoleto.conta, nossoNumero: dadosBoleto.documento.numero,
            valor: dadosBoleto.documento.valor, vencimento: dadosBoleto.documento.dataVencimento
        });
        const vencimentoDate = new Date(dadosBoleto.documento.dataVencimento + 'T12:00:00Z');

        // --- Recibo do Pagador (Layout com caixas) ---
        if (safraLogoBase64) doc.addImage(safraLogoBase64, 'PNG', 15, 12, 25, 8);
        doc.setFont('helvetica', 'bold').setFontSize(10).text('Recibo do Pagador', 195, 15, { align: 'right' });
        doc.line(15, 20, 195, 20);
        
        const xRecibo = 15, yRecibo = 22, wRecibo = 180;
        drawField('Beneficiário', dadosBoleto.cedente.nome, xRecibo, yRecibo, 100, 10);
        drawField('Nosso Número', dadosBoleto.documento.numero, xRecibo + 100, yRecibo, 40, 10);
        doc.line(xRecibo + 100, yRecibo, xRecibo + 100, yRecibo + 10);
        drawField('Vencimento', format(vencimentoDate, 'dd/MM/yyyy'), xRecibo + 140, yRecibo, 40, 10);
        doc.line(xRecibo + 140, yRecibo, xRecibo + 140, yRecibo + 10);
        
        doc.line(xRecibo, yRecibo + 10, xRecibo + wRecibo, yRecibo + 10);
        drawField('Data do documento', format(new Date(dadosBoleto.documento.dataEmissao + 'T12:00:00Z'), 'dd/MM/yyyy'), xRecibo, yRecibo + 10, 30, 10);
        doc.line(xRecibo + 30, yRecibo + 10, xRecibo + 30, yRecibo + 20);
        drawField('Número do documento', dadosBoleto.documento.numeroCliente, xRecibo + 30, yRecibo + 10, 30, 10);
        doc.line(xRecibo + 60, yRecibo + 10, xRecibo + 60, yRecibo + 20);
        drawField('Carteira', '60', xRecibo + 60, yRecibo + 10, 15, 10);
        doc.line(xRecibo + 75, yRecibo + 10, xRecibo + 75, yRecibo + 20);
        drawField('Agência/Cód. Beneficiário', `${dadosBoleto.agencia}/${dadosBoleto.conta}`, xRecibo + 75, yRecibo + 10, 65, 10);
        doc.line(xRecibo + 140, yRecibo + 10, xRecibo + 140, yRecibo + 20);
        drawField('Valor', formatBRLNumber(dadosBoleto.documento.valor), xRecibo + 140, yRecibo + 10, 40, 10);

        doc.line(xRecibo, yRecibo + 20, xRecibo + wRecibo, yRecibo + 20);
        drawField('Pagador', `${dadosBoleto.documento.pagador.nome} CNPJ/CPF: ${formatCnpjCpf(dadosBoleto.documento.pagador.numeroDocumento)}`, xRecibo, yRecibo + 20, 180, 10);
        
        const yFornecedor = yRecibo + 30;
        doc.line(xRecibo, yFornecedor, xRecibo + wRecibo, yFornecedor);
        const cedenteAddr = `END: ${dadosBoleto.cedente.endereco || ''} ${dadosBoleto.cedente.municipio || ''} ${dadosBoleto.cedente.cep || ''} ${dadosBoleto.cedente.uf || ''}`;
        doc.setFontSize(8).setTextColor(0,0,0);
        doc.text(`FORNECEDOR: ${dadosBoleto.cedente.nome}`, xRecibo + 2, yFornecedor + 4);
        doc.text(`CNPJ/CPF: ${formatCnpjCpf(dadosBoleto.cedente.cnpj)}`, 193, yFornecedor + 4, { align: 'right' });
        doc.text(cedenteAddr, xRecibo + 2, yFornecedor + 8);
        doc.text(`REFERENTE A NF ${dadosBoleto.documento.numeroCliente.split('.')[0]}`, xRecibo + 2, yFornecedor + 12);
        doc.line(xRecibo, yFornecedor + 15, xRecibo + wRecibo, yFornecedor + 15);
        
        // ALTERAÇÃO FINAL: Texto e linha de autenticação removidos
        // doc.text('Boleto impresso eletronicamente através do Canal Safra Empresas', xRecibo, yFornecedor + 18);
        doc.text('Autenticação Mecânica', 195, yFornecedor + 18, { align: 'right' });
        // doc.line(160, yFornecedor + 18.5, 195, yFornecedor + 18.5);
        
        doc.setLineDashPattern([2, 1], 0).line(15, 88, 195, 88).setLineDashPattern([], 0);

        // --- Ficha de Compensação ---
        if (safraLogoBase64) doc.addImage(safraLogoBase64, 'PNG', 15, 92, 25, 8);
        
        doc.setLineWidth(0.5).line(40, 92, 40, 99);
        doc.setFont('helvetica', 'bold').setFontSize(12).text('422-7', 47.5, 96, { align: 'center' });
        doc.setLineWidth(0.5).line(55, 92, 55, 99);
        doc.setFontSize(11).setFont('courier', 'bold').text(linhaDigitavel, 125, 96, { align: 'center' });
        
        const x = 15, y = 101, w = 180;
        
        doc.setLineWidth(0.2);
        doc.line(x, y, x + w, y);
        doc.line(x + 130, y, x + 130, y + 65);
        
        drawField('Local de Pagamento', 'Pagável em qualquer banco', x, y, 130, 10);
        drawField('Vencimento', format(vencimentoDate, 'dd/MM/yyyy'), x + 130, y, 50, 10, 'right', 10);
        doc.line(x, y + 10, x + w, y + 10);
        
        drawField('Beneficiário', `${dadosBoleto.cedente.nome} CNPJ/CPF: ${formatCnpjCpf(dadosBoleto.cedente.cnpj)}`, x, y + 10, 130, 10);
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
        
        drawField('Data do Oper.', format(new Date(dadosBoleto.documento.dataEmissao + 'T12:00:00Z'), 'dd/MM/yyyy'), x, y+30, 25, 10);
        doc.line(x + 25, y + 30, x + 25, y + 40);
        drawField('Carteira', '60', x + 25, y + 30, 20, 10);
        doc.line(x + 45, y + 30, x + 45, y + 40);
        drawField('Espécie', 'R$', x + 45, y + 30, 20, 10);
        doc.line(x + 65, y + 30, x + 65, y + 40);
        drawField('Quantidade', '', x + 65, y + 30, 30, 10);
        doc.line(x + 95, y + 30, x + 95, y + 40);
        drawField('Valor', '', x + 95, y + 30, 35, 10);
        drawField('(=)Valor do Documento', formatBRLNumber(dadosBoleto.documento.valor), x + 130, y + 30, 50, 10, 'right', 10);
        doc.line(x, y + 40, x + w, y + 40);
        
        // ALTERAÇÃO FINAL: Calcula juros dinamicamente
        const jurosAoDia = (dadosBoleto.documento.valor * 0.02) / 30;
        const dataJurosMulta = format(addDays(vencimentoDate, 1), 'dd/MM/yyyy');
        const instrucoes = [`JUROS DE ${formatBRLNumber(jurosAoDia)} AO DIA A PARTIR DE ${dataJurosMulta}`, `MULTA DE 2,00% A PARTIR DE ${dataJurosMulta}`];
        doc.setFontSize(6).setTextColor(100, 100, 100).text('Instruções', x + 1.5, y + 40 + 2.5);
        doc.setFontSize(9).setTextColor(0, 0, 0).text(instrucoes, x + 1.5, y + 40 + 7);
        
        const hCampoValor = 5;
        drawField('(-)Desconto/Abatimento', '', x + 130, y + 40, 50, hCampoValor);
        doc.line(x + 130, y + 40 + hCampoValor, x + w, y + 40 + hCampoValor);
        drawField('(-)Outras Deduções', '', x + 130, y + 45, 50, hCampoValor);
        doc.line(x + 130, y + 45 + hCampoValor, x + w, y + 45 + hCampoValor);
        drawField('(+)Mora/Multa', '', x + 130, y + 50, 50, hCampoValor);
        doc.line(x + 130, y + 50 + hCampoValor, x + w, y + 50 + hCampoValor);
        drawField('(+)Outros Acréscimos', '', x + 130, y + 55, 50, hCampoValor);
        doc.line(x + 130, y + 55 + hCampoValor, x + w, y + 55 + hCampoValor);
        drawField('(=)Valor Cobrado', '', x + 130, y + 60, 50, hCampoValor);

        doc.line(x, y + 65, x + w, y + 65);
        
        const pagadorAddressFicha = `${dadosBoleto.documento.pagador.endereco.logradouro}\n${dadosBoleto.documento.pagador.endereco.cidade} ${dadosBoleto.documento.pagador.endereco.uf} CEP: ${dadosBoleto.documento.pagador.endereco.cep}`;
        const pagadorLinesFicha = doc.splitTextToSize(`${dadosBoleto.documento.pagador.nome} CNPJ/CPF: ${formatCnpjCpf(dadosBoleto.documento.pagador.numeroDocumento)}\n${pagadorAddressFicha}`, 178);
        drawField('Pagador', pagadorLinesFicha, x, y + 65, 180, 15, 'left', 9, 6);
        
        // ALTERAÇÃO FINAL: Remove a linha acima de "Beneficiário Final"
        // doc.line(x, y + 80, x + w, y + 80);
        drawField('Beneficiário Final', '', x, y + 80, 180, 5);
        doc.line(x, y + 85, x + w, y + 85);
        
        drawInterleaved2of5(doc, 15, 190, codigoBarras, 103, 15);
        doc.setFont('helvetica', 'normal').setFontSize(8).text('Autenticação Mecânica - Ficha de Compensação', 195, 210, { align: 'right' });
    });
    
    return doc.output('arraybuffer');
}