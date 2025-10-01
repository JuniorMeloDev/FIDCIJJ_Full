import { jsPDF } from 'jspdf';
import { format, addDays } from 'date-fns';
import { formatBRLNumber, formatCnpjCpf } from '../utils/formatters';
import fs from 'fs';
import path from 'path';

// Função para carregar o logo do Itaú
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

// Função para desenhar o código de barras
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
        
        const { linha_digitavel, codigo_barras } = dadosBoleto.boletoInfo;
        const vencimentoDate = new Date(dadosBoleto.data_vencimento + 'T12:00:00Z');
        const tipoOperacao = dadosBoleto.operacao.tipo_operacao;

        // --- INÍCIO: Seção Recibo do Pagador (Layout Completo) ---
        if (itauLogoBase64) doc.addImage(itauLogoBase64, 'PNG', 15, 12, 25, 8);
        doc.setFont('helvetica', 'bold').setFontSize(10).text('Recibo do Pagador', 195, 15, { align: 'right' });
        doc.line(15, 20, 195, 20);
        
        const xRecibo = 15, yRecibo = 22;
        drawField('Beneficiário', [dadosBoleto.cedente.nome, `CNPJ/CPF: ${formatCnpjCpf(dadosBoleto.cedente.cnpj)}`], xRecibo, yRecibo, 100, 10, 'left', 8);
        drawField('Agência/Código Beneficiário', `${dadosBoleto.agencia}/${dadosBoleto.conta}`, xRecibo + 100, yRecibo, 40, 10, 'right');
        drawField('Vencimento', format(vencimentoDate, 'dd/MM/yyyy'), xRecibo + 140, yRecibo, 40, 10, 'right');
        
        drawField('Pagador', `${dadosBoleto.sacado.nome} - ${formatCnpjCpf(dadosBoleto.sacado.cnpj)}`, xRecibo, yRecibo + 10, 140, 10, 'left', 8);
        drawField('Valor do Documento', formatBRLNumber(dadosBoleto.valor_bruto), xRecibo + 140, yRecibo + 10, 40, 10, 'right');

        drawField('Nosso Número', `${dadosBoleto.carteira}/${dadosBoleto.nosso_numero}`, xRecibo, yRecibo + 20, 60, 10);
        drawField('Nº do Documento', dadosBoleto.nf_cte, xRecibo + 60, yRecibo + 20, 60, 10);
        
        doc.setFontSize(8).text('Autenticação mecânica', 195, yRecibo + 40, { align: 'right' });
        doc.setLineDashPattern([2, 1], 0).line(15, 88, 195, 88).setLineDashPattern([], 0);
        // --- FIM: Seção Recibo do Pagador ---

        // --- INÍCIO: Ficha de Compensação (Layout Completo) ---
        doc.setFontSize(8).text('Ficha de Compensação', 15, 125, { align: 'left' });
        if (itauLogoBase64) doc.addImage(itauLogoBase64, 'PNG', 15, 92, 25, 8);
        
        doc.setLineWidth(0.5).line(40, 92, 40, 99);
        doc.setFont('helvetica', 'bold').setFontSize(12).text('341-7', 47.5, 96, { align: 'center' });
        doc.setLineWidth(0.5).line(55, 92, 55, 99);
        doc.setFontSize(11).setFont('courier', 'bold').text(linha_digitavel, 125, 96, { align: 'center' });
        
        const x = 15, y = 101, w = 180, h_field = 8;
        doc.setLineWidth(0.2);
        
        // Estrutura Vertical
        doc.rect(x, y, w, 85);
        doc.line(x + 130, y, x + 130, y + 80);

        // Estrutura Horizontal
        doc.line(x, y + h_field, x + w, y + h_field);
        doc.line(x, y + h_field * 2, x + w, y + h_field * 2);
        doc.line(x, y + h_field * 3, x + w, y + h_field * 3);
        doc.line(x, y + h_field * 4 + 13, x + 130, y + h_field * 4 + 13);
        doc.line(x, y + h_field * 4 + 13 + 15, x + w, y + h_field * 4 + 13 + 15);
        
        // Campos da tabela (com posições e tamanhos ajustados)
        drawField('Local de pagamento', 'PAGUE PREFERENCIALMENTE NO BANCO ITAÚ', x, y, 130, h_field);
        drawField('Vencimento', format(vencimentoDate, 'dd/MM/yyyy'), x + 130, y, 50, h_field, 'right', 10);
        
        drawField('Beneficiário', `${dadosBoleto.cedente.nome} - ${formatCnpjCpf(dadosBoleto.cedente.cnpj)}`, x, y + h_field, 130, h_field, 'left', 8);
        drawField('Agência/Código Beneficiário', `${dadosBoleto.agencia}/${dadosBoleto.conta}`, x + 130, y + h_field, 50, h_field, 'right');
        
        drawField('Data do Doc.', format(new Date(dadosBoleto.data_operacao + 'T12:00:00Z'), 'dd/MM/yyyy'), x, y + h_field*2, 25, h_field);
        drawField('Nº do Doc.', dadosBoleto.nf_cte, x + 25, y + h_field*2, 35, h_field);
        drawField('Espécie Doc.', 'DM', x + 60, y + h_field*2, 15, h_field);
        drawField('Aceite', 'N', x + 75, y + h_field*2, 15, h_field);
        drawField('Data Process.', format(new Date(), 'dd/MM/yyyy'), x + 90, y + h_field*2, 40, h_field);
        drawField('Nosso Número', `${dadosBoleto.carteira}/${dadosBoleto.nosso_numero}`, x + 130, y + h_field*2, 50, h_field, 'right');

        // NOVO: Bloco de Instruções corrigido
        const dataVencida = format(addDays(vencimentoDate, 1), 'dd/MM/yyyy');
        const jurosMoraTxt = tipoOperacao.taxa_juros_mora > 0 ? `A partir de ${dataVencida}, COBRAR JUROS DE ${tipoOperacao.taxa_juros_mora.toFixed(2).replace('.',',')}% AO MÊS` : '';
        const multaTxt = tipoOperacao.taxa_multa > 0 ? `A partir de ${dataVencida}, COBRAR MULTA DE ${tipoOperacao.taxa_multa.toFixed(2).replace('.',',')}%` : '';
        const instrucoes = [jurosMoraTxt, multaTxt, `REFERENTE A NF ${dadosBoleto.nf_cte}`].filter(Boolean);
        drawField('Instruções de responsabilidade do BENEFICIÁRIO.', instrucoes, x, y + h_field*3, 130, 21, 'left', 8);

        // NOVO: Bloco financeiro com contornos
        const y_financeiro = y + h_field*3;
        drawField('(-) Desconto/Abatimento', '', x + 130, y_financeiro, 50, h_field);
        doc.line(x + 130, y_financeiro + h_field, x + w, y_financeiro + h_field);
        drawField('(+) Juros/Multa', '', x + 130, y_financeiro + h_field, 50, h_field);
        doc.line(x + 130, y_financeiro + h_field*2, x + w, y_financeiro + h_field*2);
        drawField('(=) Valor Cobrado', '', x + 130, y_financeiro + h_field*2, 50, h_field);
        
        // NOVO: Corrigindo texto "Valor do Documento"
        drawField('(=) Valor do Documento', formatBRLNumber(dadosBoleto.valor_bruto), x + 130, y + h_field*2 + 8, 50, 15, 'right', 10);

        drawField('Pagador', [
            `${dadosBoleto.sacado.nome}`,
            `${dadosBoleto.sacado.endereco}, ${dadosBoleto.sacado.bairro}`,
            `${dadosBoleto.sacado.municipio} - ${dadosBoleto.sacado.uf} CEP: ${dadosBoleto.sacado.cep}`,
            `CNPJ/CPF: ${formatCnpjCpf(dadosBoleto.sacado.cnpj)}`
        ], x, y + h_field * 4 + 13, 180, 15, 'left', 8);
        
        drawField('Beneficiário Final', 'CNPJ/CPF:', x, y + h_field * 4 + 13 + 15, 180, 5);
        
        if (codigo_barras) {
          drawInterleaved2of5(doc, 15, 170, codigo_barras, 103, 15);
        }
        doc.setFont('helvetica', 'normal').setFontSize(8).text('Autenticação mecânica - Ficha de Compensação', 195, 190, { align: 'right' });
    });
    
    return doc.output('arraybuffer');
}