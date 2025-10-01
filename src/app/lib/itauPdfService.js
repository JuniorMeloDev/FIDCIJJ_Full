import { jsPDF } from 'jspdf';
import { format } from 'date-fns';
import { formatBRLNumber, formatCnpjCpf } from '../utils/formatters';
import fs from 'fs';
import path from 'path';

const getItauLogoBase64 = () => {
    try {
        const imagePath = path.resolve(process.cwd(), 'public', 'itau.png');
        const imageBuffer = fs.readFileSync(imagePath);
        return `data:image/png;base64,${imageBuffer.toString('base64')}`;
    } catch (error) { return null; }
};

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

// Função para formatar a linha digitável a partir do código de barras numérico
function formatarLinhaDigitavel(codigo) {
    if (!codigo || codigo.length !== 47) return 'Linha digitável indisponível';
    const campo1 = codigo.substring(0, 10);
    const campo2 = codigo.substring(10, 21);
    const campo3 = codigo.substring(21, 32);
    const campo4 = codigo.substring(32, 33);
    const campo5 = codigo.substring(33, 47);
    return `${campo1.slice(0, 5)}.${campo1.slice(5)}  ${campo2.slice(0, 5)}.${campo2.slice(5)}  ${campo3.slice(0, 5)}.${campo3.slice(5)}  ${campo4}  ${campo5}`;
}


export function gerarPdfBoletoItau(listaBoletos) {
    const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
    const itauLogoBase64 = getItauLogoBase64();

    const drawField = (label, value, x, y, width, height, valueAlign = 'left', valueSize = 9, labelSize = 6) => {
        doc.setFontSize(labelSize); doc.setTextColor(100, 100, 100);
        doc.text(label, x + 1.5, y + 2.5);
        doc.setFontSize(valueSize); doc.setTextColor(0, 0, 0);
        const textX = valueAlign === 'right' ? x + width - 1.5 : x + 1.5;
        const lines = Array.isArray(value) ? value : [value];
        lines.forEach((line, i) => {
            doc.text(String(line || ''), textX, y + height - 1.5 - (lines.length - 1 - i) * 3.5, { align: valueAlign, baseline: 'bottom' });
        });
    };

    listaBoletos.forEach((dadosBoleto, index) => {
        if (index > 0) doc.addPage();
        
        // Usa a linha digitável que vem do banco e o código de barras salvo
        const linhaDigitavel = dadosBoleto.boletoInfo.linha_digitavel;
        const codigoBarras = dadosBoleto.boletoInfo.codigo_barras;
        const vencimentoDate = new Date(dadosBoleto.data_vencimento + 'T12:00:00Z');

        // Ficha de Compensação
        if (itauLogoBase64) doc.addImage(itauLogoBase64, 'PNG', 15, 12, 25, 8);
        
        doc.setLineWidth(0.5).line(40, 12, 40, 19);
        doc.setFont('helvetica', 'bold').setFontSize(12).text('341-7', 47.5, 16, { align: 'center' });
        doc.setLineWidth(0.5).line(55, 12, 55, 19);
        doc.setFontSize(11).setFont('courier', 'bold').text(linhaDigitavel, 125, 16, { align: 'center' });
        
        const x = 15, y = 21, w = 180;
        doc.setLineWidth(0.2);
        
        doc.rect(x, y, w, 105);
        doc.line(x, y, x + w, y);
        doc.line(x + 130, y, x + 130, y + 65);
        
        drawField('Local de pagamento', 'PAGUE PREFERENCIALMENTE NO BANCO ITAÚ', x, y, 130, 10);
        drawField('Vencimento', format(vencimentoDate, 'dd/MM/yyyy'), x + 130, y, 50, 10, 'right', 10);
        
        drawField('Beneficiário', `${dadosBoleto.cedente.nome} - ${formatCnpjCpf(dadosBoleto.cedente.cnpj)}`, x, y + 10, 130, 10);
        drawField('Agência/Código Beneficiário', `${dadosBoleto.agencia}/${dadosBoleto.conta}`, x + 130, y + 10, 50, 10, 'right');
        
        drawField('Data do Doc.', format(new Date(dadosBoleto.data_operacao + 'T12:00:00Z'), 'dd/MM/yyyy'), x, y + 20, 25, 10);
        drawField('Nº do Doc.', dadosBoleto.nf_cte, x + 25, y + 20, 35, 10);
        drawField('Esp. Doc.', 'DM', x + 60, y + 20, 15, 10);
        drawField('Aceite', 'N', x + 75, y + 20, 15, 10);
        drawField('Data Process.', format(new Date(dadosBoleto.data_operacao + 'T12:00:00Z'), 'dd/MM/yyyy'), x + 90, y + 20, 40, 10);
        drawField('Nosso Número', `${dadosBoleto.carteira}/${dadosBoleto.nosso_numero}`, x + 130, y + 20, 50, 10, 'right');
        
        drawField('Uso do Banco', '', x, y+30, 25, 10);
        drawField('Carteira', dadosBoleto.carteira, x + 25, y + 30, 20, 10);
        drawField('Espécie', 'R$', x + 45, y + 30, 20, 10);
        drawField('Quantidade', '', x + 65, y + 30, 30, 10);
        drawField('Valor', '', x + 95, y + 30, 35, 10);
        drawField('(=) Valor do Documento', formatBRLNumber(dadosBoleto.valor_bruto), x + 130, y + 30, 50, 10, 'right', 10);

        const instrucoes = [`REFERENTE A NF ${dadosBoleto.nf_cte}`];
        drawField('Instruções de responsabilidade do BENEFICIARIO.', instrucoes, x, y + 40, 130, 25);
        
        drawField('Pagador', [
            `${dadosBoleto.sacado.nome}`,
            `${dadosBoleto.sacado.endereco}, ${dadosBoleto.sacado.bairro}`,
            `${dadosBoleto.sacado.municipio} - ${dadosBoleto.sacado.uf} CEP: ${dadosBoleto.sacado.cep}`,
            `CNPJ/CPF: ${formatCnpjCpf(dadosBoleto.sacado.cnpj)}`
        ], x, y + 65, 180, 20, 'left', 8);
        
        if (codigoBarras) {
          drawInterleaved2of5(doc, 15, 110, codigoBarras, 103, 15);
        }
    });
    
    return doc.output('arraybuffer');
}