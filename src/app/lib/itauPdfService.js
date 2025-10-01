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
    } catch (error) {
        console.error("Erro ao carregar a imagem do logo Itaú:", error);
        return null;
    }
};

// Código de Barras
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

// Campo com label + valor
const drawField = (doc, label, value, x, y, width, height, valueAlign = 'left', valueSize = 9, labelSize = 6) => {
    doc.setFontSize(labelSize).setTextColor(100, 100, 100);
    doc.text(label, x + 1.5, y + 2.5);
    doc.setFontSize(valueSize).setTextColor(0, 0, 0);
    const textX = valueAlign === 'right' ? x + width - 1.5 : x + 1.5;
    const lines = Array.isArray(value) ? value : [value];
    lines.forEach((line, i) => {
        doc.text(String(line || ''), textX, y + height - 1.5 - (lines.length - 1 - i) * 3.5, {
            align: valueAlign,
            baseline: 'bottom'
        });
    });
};

// Função principal
export function gerarPdfBoletoItau(listaBoletos) {
    const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
    const itauLogoBase64 = getItauLogoBase64();

    listaBoletos.forEach((dadosBoleto, index) => {
        if (index > 0) doc.addPage();

        const { linha_digitavel, codigo_barras } = dadosBoleto.boletoInfo;
        const vencimentoDate = new Date(dadosBoleto.data_vencimento + 'T12:00:00Z');

        // ================= RECIBO DO PAGADOR =================
        if (itauLogoBase64) doc.addImage(itauLogoBase64, 'PNG', 15, 12, 25, 8);
        doc.setFont('helvetica', 'bold').setFontSize(10).text('RECIBO DO PAGADOR', 195, 15, { align: 'right' });
        doc.line(15, 20, 195, 20);

        const xRecibo = 15, yRecibo = 22, wRecibo = 180;
        drawField(doc, 'Beneficiário', `${dadosBoleto.cedente.nome} CNPJ/CPF: ${formatCnpjCpf(dadosBoleto.cedente.cnpj)}`, xRecibo, yRecibo, 100, 10);
        drawField(doc, 'Nosso Número', dadosBoleto.nosso_numero, xRecibo + 100, yRecibo, 40, 10);
        drawField(doc, 'Vencimento', format(vencimentoDate, 'dd/MM/yyyy'), xRecibo + 140, yRecibo, 40, 10, 'right');
        doc.line(xRecibo, yRecibo + 10, xRecibo + wRecibo, yRecibo + 10);

        drawField(doc, 'Pagador', `${dadosBoleto.sacado.nome} CNPJ/CPF: ${formatCnpjCpf(dadosBoleto.sacado.cnpj)}`, xRecibo, yRecibo + 10, 140, 10);
        drawField(doc, 'Valor do Documento', formatBRLNumber(dadosBoleto.valor_bruto), xRecibo + 140, yRecibo + 10, 40, 10, 'right');

        doc.setFontSize(8).text('Autenticação Mecânica', 195, yRecibo + 25, { align: 'right' });
        doc.setLineDashPattern([2, 1], 0).line(15, 88, 195, 88).setLineDashPattern([], 0);

        // ================= FICHA DE COMPENSAÇÃO =================
        if (itauLogoBase64) doc.addImage(itauLogoBase64, 'PNG', 15, 92, 25, 8);

        doc.setLineWidth(0.5).line(40, 92, 40, 99);
        doc.setFont('helvetica', 'bold').setFontSize(12).text('341-7', 47.5, 96, { align: 'center' });
        doc.setLineWidth(0.5).line(55, 92, 55, 99);
        doc.setFontSize(11).setFont('courier', 'bold').text(linha_digitavel, 125, 96, { align: 'center' });

        const x = 15, y = 101, w = 180;
        doc.setLineWidth(0.2);
        doc.rect(x, y, w, 105);

        // Linha 1: Local de Pagamento e Vencimento
        drawField(doc, 'Local de Pagamento', 'PAGÁVEL PREFERENCIALMENTE NO BANCO ITAÚ', x, y, 130, 10);
        drawField(doc, 'Vencimento', format(vencimentoDate, 'dd/MM/yyyy'), x + 130, y, 50, 10, 'right', 10);
        doc.line(x, y + 10, x + w, y + 10);

        // Linha 2: Beneficiário
        drawField(doc, 'Beneficiário', `${dadosBoleto.cedente.nome} CNPJ/CPF: ${formatCnpjCpf(dadosBoleto.cedente.cnpj)}`, x, y + 10, 130, 10);
        drawField(doc, 'Agência/Código Beneficiário', `${dadosBoleto.agencia}/${dadosBoleto.conta}`, x + 130, y + 10, 50, 10, 'right');
        doc.line(x, y + 20, x + w, y + 20);

        // Linha 3: Documento
        drawField(doc, 'Data do Documento', format(new Date(dadosBoleto.data_operacao + 'T12:00:00Z'), 'dd/MM/yyyy'), x, y + 20, 25, 10);
        drawField(doc, 'Nº do Doc.', dadosBoleto.nf_cte, x + 25, y + 20, 35, 10);
        drawField(doc, 'Espécie Doc.', 'DM', x + 60, y + 20, 15, 10);
        drawField(doc, 'Aceite', 'N', x + 75, y + 20, 15, 10);
        drawField(doc, 'Nosso Número', dadosBoleto.nosso_numero, x + 130, y + 20, 50, 10, 'right');
        doc.line(x, y + 30, x + w, y + 30);

        // Linha 4: Carteira / Espécie / Quantidade / Valor
        drawField(doc, 'Carteira', dadosBoleto.carteira, x, y + 30, 25, 10);
        drawField(doc, 'Espécie', 'R$', x + 25, y + 30, 20, 10);
        drawField(doc, 'Quantidade', '', x + 45, y + 30, 35, 10);
        drawField(doc, 'Valor', '', x + 80, y + 30, 35, 10);
        drawField(doc, '(=) Valor do Documento', formatBRLNumber(dadosBoleto.valor_bruto), x + 130, y + 30, 50, 10, 'right', 10);
        doc.line(x, y + 40, x + w, y + 40);

        // Instruções
        const dataVencida = format(addDays(vencimentoDate, 1), 'dd/MM/yyyy');
        const instrucoes = [
            'Instruções de responsabilidade do BENEFICIÁRIO.',
            dadosBoleto.operacao.tipo_operacao.taxa_juros_mora ? `A partir de ${dataVencida}, COBRAR JUROS DE ${dadosBoleto.operacao.tipo_operacao.taxa_juros_mora}% AO MÊS` : '',
            dadosBoleto.operacao.tipo_operacao.taxa_multa ? `A partir de ${dataVencida}, COBRAR MULTA DE ${dadosBoleto.operacao.tipo_operacao.taxa_multa}%` : '',
            `REFERENTE A NF ${dadosBoleto.nf_cte}`
        ].filter(Boolean);

        drawField(doc, 'Instruções', instrucoes, x, y + 40, 130, 20, 'left', 8, 6);

        // Pagador
        drawField(doc, 'Pagador', [
            `${dadosBoleto.sacado.nome}`,
            `${dadosBoleto.sacado.endereco}, ${dadosBoleto.sacado.bairro}`,
            `${dadosBoleto.sacado.municipio} - ${dadosBoleto.sacado.uf} CEP: ${dadosBoleto.sacado.cep}`,
            `CNPJ/CPF: ${formatCnpjCpf(dadosBoleto.sacado.cnpj)}`
        ], x, y + 65, 180, 15, 'left', 9, 6);

        // Beneficiário Final
        drawField(doc, 'Beneficiário Final', '', x, y + 80, 180, 5);
        doc.line(x, y + 85, x + w, y + 85);

        // Código de barras
        if (codigo_barras) {
            drawInterleaved2of5(doc, 15, 190, codigo_barras, 160, 15);
        }
        doc.setFont('helvetica', 'normal').setFontSize(8).text('Autenticação Mecânica - Ficha de Compensação', 195, 210, { align: 'right' });
    });

    return doc.output('arraybuffer');
}
