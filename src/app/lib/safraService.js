import { jsPDF } from 'jspdf';
import { format } from 'date-fns';
import { formatBRLNumber, formatCnpjCpf } from '../utils/formatters';

// --- Funções de Cálculo (Módulo 10 e Módulo 11) ---
// (Estas funções permanecem as mesmas da versão anterior)
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
    return resto === 0 ? 0 : 10 - resto;
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
    if (dac === 0 || dac === 10 || dac === 11) dac = 1;
    return dac;
}

// --- Função Principal de Geração de PDF ---
export function gerarPdfBoletoSafra(listaBoletos) {
    const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });

    listaBoletos.forEach((dadosBoleto, index) => {
        if (index > 0) {
            doc.addPage();
        }

        const { linhaDigitavel } = gerarLinhaDigitavelEDAC({
            agencia: dadosBoleto.agencia,
            conta: dadosBoleto.conta,
            nossoNumero: dadosBoleto.documento.numero,
            valor: dadosBoleto.documento.valor,
            vencimento: dadosBoleto.documento.dataVencimento
        });

        // --- Layout do Boleto (Padrão Safra) ---
        const drawField = (label, value, x, y, labelWidth, valueWidth, valueAlign = 'left') => {
            doc.setFontSize(7).setTextColor(100, 100, 100);
            doc.text(label, x, y);
            doc.setFontSize(8).setTextColor(0, 0, 0).setFont(undefined, 'bold');
            doc.text(value, valueAlign === 'right' ? x + labelWidth + valueWidth : x, y + 4, { align: valueAlign, maxWidth: valueWidth });
        };
        
        // Linhas de separação
        doc.setDrawColor(0, 0, 0);
        doc.line(10, 30, 200, 30); // Linha superior
        doc.line(10, 100, 200, 100); // Linha que separa recibo da ficha
        
        // Cabeçalho
        doc.setFontSize(14).setFont(undefined, 'bold');
        doc.text('Safra', 25, 20);
        doc.setFontSize(12);
        doc.line(50, 15, 50, 25); // |
        doc.text('422-7', 55, 21);
        doc.setFontSize(10).setFont(undefined, 'normal');
        doc.text(linhaDigitavel, 125, 21, { align: 'center', charSpace: 1 });

        // --- Recibo do Pagador ---
        doc.setFontSize(8).setFont(undefined, 'bold');
        doc.text('Recibo do Pagador', 10, 34);

        drawField('Beneficiário', `${dadosBoleto.cedente.nome} CNPJ/CPF: ${formatCnpjCpf(dadosBoleto.cedente.cnpj)}`, 10, 40, 180, 180);
        drawField('Data do documento', format(new Date(dadosBoleto.documento.dataEmissao + 'T12:00:00Z'), 'dd/MM/yyyy'), 10, 50, 30, 30);
        drawField('Número do documento', dadosBoleto.documento.numeroCliente, 45, 50, 30, 30);
        drawField('Agência/Cód. Beneficiário', `${dadosBoleto.agencia}/${dadosBoleto.conta}`, 150, 35, 40, 40, 'right');
        drawField('Nosso Número', dadosBoleto.documento.numero, 150, 42, 40, 40, 'right');
        drawField('Vencimento', format(new Date(dadosBoleto.documento.dataVencimento + 'T12:00:00Z'), 'dd/MM/yyyy'), 150, 49, 40, 40, 'right');
        drawField('Valor', formatBRLNumber(dadosBoleto.documento.valor), 150, 56, 40, 40, 'right');
        
        drawField('Pagador', `${dadosBoleto.documento.pagador.nome} CNPJ/CPF: ${formatCnpjCpf(dadosBoleto.documento.pagador.numeroDocumento)}`, 10, 65, 180, 180);
        
        doc.text('Autenticação Mecânica', 150, 95);

        // --- Ficha de Compensação ---
        drawField('Local de Pagamento', 'Pagável em qualquer banco', 10, 105, 130, 130);
        drawField('Vencimento', format(new Date(dadosBoleto.documento.dataVencimento + 'T12:00:00Z'), 'dd/MM/yyyy'), 150, 105, 40, 40, 'right');
        drawField('Beneficiário', `${dadosBoleto.cedente.nome} CNPJ/CPF: ${formatCnpjCpf(dadosBoleto.cedente.cnpj)}`, 10, 115, 130, 130);
        drawField('Agência/Cód. Beneficiário', `${dadosBoleto.agencia}/${dadosBoleto.conta}`, 150, 115, 40, 40, 'right');

        // Detalhes do documento
        doc.rect(10, 125, 190, 25);
        drawField('Data do Doc.', format(new Date(dadosBoleto.documento.dataEmissao + 'T12:00:00Z'), 'dd/MM/yyyy'), 10, 130, 30, 30);
        drawField('Nº do Doc.', dadosBoleto.documento.numeroCliente, 45, 130, 25, 25);
        drawField('Esp. Doc.', dadosBoleto.documento.especie, 75, 130, 15, 15);
        drawField('Aceite', 'Não', 95, 130, 15, 15);
        drawField('Data do Movto', format(new Date(dadosBoleto.documento.dataEmissao + 'T12:00:00Z'), 'dd/MM/yyyy'), 115, 130, 30, 30);
        drawField('Nosso Número', dadosBoleto.documento.numero, 150, 130, 40, 40, 'right');
        
        // Valores
        drawField('(=) Valor do Documento', formatBRLNumber(dadosBoleto.documento.valor), 150, 155, 40, 40, 'right');
        drawField('(-) Desconto/Abatimento', '', 150, 165, 40, 40, 'right');
        drawField('(+) Mora/Multa', '', 150, 175, 40, 40, 'right');
        drawField('(=) Valor Cobrado', '', 150, 185, 40, 40, 'right');

        // Instruções
        doc.text('Instruções (As informações contidas neste boleto, são de exclusiva responsabilidade do beneficiário)', 10, 155);
        const dataJurosMulta = new Date(dadosBoleto.documento.dataVencimento + 'T12:00:00Z');
        dataJurosMulta.setDate(dataJurosMulta.getDate() + 1);
        const dataFormatada = format(dataJurosMulta, 'dd/MM/yyyy');
        doc.text(`JUROS DE R$${(dadosBoleto.documento.valor * 0.00033).toFixed(2).replace('.',',')} AO DIA A PARTIR DE ${dataFormatada}`, 12, 160);
        doc.text(`MULTA DE 2,00% A PARTIR DE ${dataFormatada}`, 12, 165);

        // Pagador
        doc.text('Pagador', 10, 195);
        doc.text(dadosBoleto.documento.pagador.nome, 10, 200);
        doc.text(`${dadosBoleto.documento.pagador.endereco.logradouro}, ${dadosBoleto.documento.pagador.endereco.bairro}`, 10, 205);
        doc.text(`${dadosBoleto.documento.pagador.endereco.cep} ${dadosBoleto.documento.pagador.endereco.cidade} ${dadosBoleto.documento.pagador.endereco.uf}`, 10, 210);

        doc.text('Autenticação Mecânica', 150, 220);
        doc.setFontSize(8).setFont(undefined, 'bold');
        doc.text('Ficha de Compensação', 165, 225);
    });
    
    return doc.output('arraybuffer');
}