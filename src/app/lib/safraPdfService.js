import { jsPDF } from 'jspdf';
import { formatBRLNumber, formatCnpjCpf, formatDate } from '../utils/formatters';
import fs from 'fs';
import path from 'path';

// --- Funções de Cálculo do Boleto (Baseado no Manual) ---

// Módulo 10 - Usado para os dígitos verificadores da linha digitável
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

// Módulo 11 - Usado para o Dígito de Autoconferência (DAC) do código de barras
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

// Gera a linha digitável formatada e o código de barras
function gerarLinhaDigitavelEDAC(dados) {
    const { agencia, conta, nossoNumero, valor, vencimento } = dados;

    const banco = "422";
    const moeda = "9";
    const tipoCobranca = "2"; // Cobrança Registrada

    // Cálculo do Fator de Vencimento
    const dataBase = new Date('1997-10-07T12:00:00Z');
    const dataVenc = new Date(vencimento + 'T12:00:00Z');
    const diffTime = Math.abs(dataVenc - dataBase);
    const fatorVencimento = Math.ceil(diffTime / (1000 * 60 * 60 * 24)).toString().padStart(4, '0');

    const valorFormatado = Math.round(valor * 100).toString().padStart(10, '0');

    // --- CORREÇÃO APLICADA AQUI ---
    // O padrão correto para o Campo Livre do Safra é diferente.
    // Carteira(2) + NossoNumero(9) + Agencia(4) + Conta(7) + DV da Conta(1) + 000(3)
    const carteira = "223"; // Exemplo, pode variar
    const campoLivre = `${carteira}${nossoNumero.padStart(9, '0')}${agencia.padStart(4, '0')}${conta.padStart(8, '0')}000`;


    // Cálculo do DAC (Dígito de Autoconferência) do Código de Barras
    const blocoParaDAC = `${banco}${moeda}${fatorVencimento}${valorFormatado}${campoLivre}`;
    const dac = modulo11(blocoParaDAC);

    const codigoBarras = `${banco}${moeda}${dac}${fatorVencimento}${valorFormatado}${campoLivre}`;

    // Montagem da Linha Digitável
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

    const linhaDigitavel = `${campo1Formatado} ${campo2Formatado} ${campo3Formatado} ${campo4} ${campo5}`;

    return { linhaDigitavel, codigoBarras };
}

// Função para desenhar o código de barras (Intercalado 2 de 5)
function drawBarcode(doc, code, x, y, width, height) {
    const patterns = [
        '00110', '10001', '01001', '11000', '00101',
        '10100', '01100', '00011', '10010', '01010'
    ];
    
    // Start and Stop patterns
    let fullPattern = '0000'; // Start

    for (let i = 0; i < code.length; i += 2) {
        const d1 = parseInt(code[i], 10);
        const d2 = parseInt(code[i + 1], 10);
        const p1 = patterns[d1];
        const p2 = patterns[d2];

        for (let j = 0; j < 5; j++) {
            fullPattern += p1[j] + p2[j];
        }
    }

    fullPattern += '100'; // Stop

    let currentX = x;
    const narrowBarWidth = width / (fullPattern.length * 1.5 - (fullPattern.split('1').length -1) * 0.5);
    const wideBarWidth = narrowBarWidth * 2;

    for (let i = 0; i < fullPattern.length; i++) {
        const isBar = (i % 2 === 0);
        const isWide = (fullPattern[i] === '1');
        const barWidth = isWide ? wideBarWidth : narrowBarWidth;

        if (isBar) {
            doc.rect(currentX, y, barWidth, height, 'F');
        }
        currentX += barWidth;
    }
}


// --- Função Principal de Geração de PDF ---
export function gerarPdfBoletoSafra(listaBoletos) {
    const doc = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4'
    });

    const getLogoBase64 = () => {
        try {
            const imagePath = path.resolve(process.cwd(), 'public', 'safra-logo.png'); // Supondo que você tenha o logo do Safra
            if (fs.existsSync(imagePath)) {
                const imageBuffer = fs.readFileSync(imagePath);
                return `data:image/png;base64,${imageBuffer.toString('base64')}`;
            }
            return null;
        } catch (error) { return null; }
    };
    const logoBase64 = getLogoBase64();

    listaBoletos.forEach((dadosBoleto, index) => {
        if (index > 0) doc.addPage();

        const { linhaDigitavel, codigoBarras } = gerarLinhaDigitavelEDAC({
            agencia: dadosBoleto.agencia,
            conta: dadosBoleto.conta,
            nossoNumero: dadosBoleto.documento.numero,
            valor: dadosBoleto.documento.valor,
            vencimento: dadosBoleto.documento.dataVencimento
        });

        // --- Desenha o Layout ---
        const drawField = (label, value, x, y, width, height, align = 'left', valueFontSize = 10, labelFontSize = 6) => {
            doc.setFontSize(labelFontSize);
            doc.text(label, x + 1, y + 2.5);
            doc.setFontSize(valueFontSize);
            doc.text(value, align === 'right' ? x + width - 1 : x + 1, y + 7);
        };

        // --- Recibo do Pagador (Parte de cima) ---
        if (logoBase64) doc.addImage(logoBase64, 'PNG', 10, 8, 30, 7);
        else doc.text("Safra", 10, 12);
        
        doc.setFontSize(10);
        doc.text("Recibo do Pagador", 180, 12, { align: 'right' });

        doc.rect(10, 15, 190, 80); // Contorno geral
        doc.line(10, 25, 200, 25); // Linha separadora
        
        drawField('Beneficiário', `${dadosBoleto.cedente.nome} CNPJ/CPF: ${formatCnpjCpf(dadosBoleto.cedente.cnpj)}`, 10, 25, 190, 10);
        doc.line(10, 35, 200, 35);

        drawField('Data do documento', formatDate(dadosBoleto.documento.dataEmissao), 10, 35, 30, 10);
        doc.line(40, 35, 40, 45);
        drawField('Número do documento', dadosBoleto.documento.numeroCliente, 40, 35, 30, 10);
        doc.line(70, 35, 70, 45);
        drawField('Carteira', '60', 70, 35, 20, 10);
        doc.line(90, 35, 90, 45);
        drawField('Agência/Cód. Beneficiário', `${dadosBoleto.agencia}/${dadosBoleto.conta}`, 90, 35, 50, 10);
        doc.line(140, 35, 140, 45);
        drawField('Valor', formatBRLNumber(dadosBoleto.documento.valor), 140, 35, 60, 10, 'right');

        doc.line(10, 45, 200, 45);
        drawField('Nosso Número', dadosBoleto.documento.numero, 10, 45, 50, 10);
        doc.line(60, 45, 60, 55);
        drawField('Vencimento', formatDate(dadosBoleto.documento.dataVencimento), 60, 45, 50, 10);
        
        doc.line(10, 55, 200, 55);
        drawField('Pagador', `${dadosBoleto.documento.pagador.nome} CNPJ/CPF: ${formatCnpjCpf(dadosBoleto.documento.pagador.numeroDocumento)}`, 10, 55, 190, 10);

        // --- Ficha de Compensação ---
        doc.line(10, 100, 200, 100);
        if (logoBase64) doc.addImage(logoBase64, 'PNG', 10, 102, 30, 7);
        else doc.text("Safra", 10, 105);
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('422-7', 50, 107);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(12);
        doc.text(linhaDigitavel, 200, 107, { align: 'right', charSpace: 1 });
        doc.line(10, 110, 200, 110);
        
        // Corpo da Ficha
        drawField('Local de Pagamento', 'Pagável em qualquer banco', 10, 110, 140, 15);
        doc.line(150, 110, 150, 125);
        drawField('Vencimento', formatDate(dadosBoleto.documento.dataVencimento), 150, 110, 50, 15, 'right', 12);
        
        doc.line(10, 125, 200, 125);
        drawField('Beneficiário', `${dadosBoleto.cedente.nome} CNPJ/CPF: ${formatCnpjCpf(dadosBoleto.cedente.cnpj)}`, 10, 125, 140, 15);
        doc.line(150, 125, 150, 140);
        drawField('Agência/Cód. Beneficiário', `${dadosBoleto.agencia}/${dadosBoleto.conta}`, 150, 125, 50, 15, 'right');

        doc.line(10, 140, 200, 140);
        drawField('Data do Doc.', formatDate(dadosBoleto.documento.dataEmissao), 10, 140, 30, 10);
        doc.line(40, 140, 40, 150);
        drawField('Nº do Doc.', dadosBoleto.documento.numeroCliente, 40, 140, 30, 10);
        doc.line(70, 140, 70, 150);
        drawField('Esp. Doc.', dadosBoleto.documento.especie, 70, 140, 20, 10);
        doc.line(90, 140, 90, 150);
        drawField('Aceite', 'Não', 90, 140, 20, 10);
        doc.line(110, 140, 110, 150);
        drawField('Data do Movto', formatDate(dadosBoleto.documento.dataEmissao), 110, 140, 40, 10);
        doc.line(150, 140, 150, 150);
        drawField('Nosso Número', dadosBoleto.documento.numero, 150, 140, 50, 10, 'right');
        
        doc.line(10, 150, 200, 150);
        drawField('Carteira', '60', 10, 150, 30, 10);
        doc.line(40, 150, 40, 160);
        drawField('Espécie', 'R$', 40, 150, 30, 10);
        doc.line(70, 150, 70, 160);
        drawField('Quantidade', '', 70, 150, 20, 10);
        doc.line(90, 150, 90, 160);
        drawField('Valor', '', 90, 150, 60, 10);
        doc.line(150, 150, 150, 160);
        drawField('(=)Valor do Documento', formatBRLNumber(dadosBoleto.documento.valor), 150, 150, 50, 10, 'right', 12);
        
        doc.line(10, 160, 150, 160);
        drawField('Instruções', 'JUROS E MULTA CONFORME CONTRATO', 10, 160, 140, 30, 'left', 8);

        doc.line(150, 160, 200, 160);
        drawField('(-)Desconto/Abatimento', '', 150, 160, 50, 10, 'right');
        doc.line(150, 170, 200, 170);
        drawField('(-)Outras Deduções', '', 150, 170, 50, 10, 'right');
        doc.line(150, 180, 200, 180);
        drawField('(+)Mora/Multa', '', 150, 180, 50, 10, 'right');
        doc.line(150, 190, 200, 190);
        drawField('(+)Outros Acréscimos', '', 150, 190, 50, 10, 'right');
        doc.line(150, 200, 200, 200);
        drawField('(=)Valor Cobrado', '', 150, 200, 50, 10, 'right');

        doc.line(10, 210, 200, 210);
        drawField('Pagador', `${dadosBoleto.documento.pagador.nome} CNPJ/CPF: ${formatCnpjCpf(dadosBoleto.documento.pagador.numeroDocumento)}\n${dadosBoleto.documento.pagador.endereco.logradouro}\n${dadosBoleto.documento.pagador.endereco.cidade} - ${dadosBoleto.documento.pagador.endereco.uf} CEP: ${dadosBoleto.documento.pagador.endereco.cep}`, 10, 210, 190, 30, 'left', 8);

        drawBarcode(doc, codigoBarras, 10, 245, 120, 15);
        doc.text("Autenticação Mecânica - Ficha de Compensação", 180, 270, { align: 'center' });
    });
    
    return doc.output('arraybuffer');
}