import { jsPDF } from 'jspdf';
import { format } from 'date-fns';
import { formatBRLNumber } from '../utils/formatters';

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
    const dataBase = new Date('2022-05-29T12:00:00Z');
    const dataVenc = new Date(vencimento + 'T12:00:00Z');
    const diffTime = Math.abs(dataVenc - dataBase);
    const fatorVencimento = Math.ceil(diffTime / (1000 * 60 * 60 * 24)).toString().padStart(4, '0');

    const valorFormatado = Math.round(valor * 100).toString().padStart(10, '0');

    // Campo Livre (25 posições)
    const sistema = "7"; // Dígito do Banco Safra
    const campoLivre = `${sistema}${agencia}${conta}${nossoNumero}${tipoCobranca}`;

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


// --- Função Principal de Geração de PDF ---
export function gerarPdfBoletoSafra(listaBoletos) {
    const doc = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4'
    });

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

        // --- Layout do Boleto (simplificado para demonstração) ---
        doc.setFontSize(10);
        doc.text('Local de Pagamento', 10, 20);
        doc.text('Pagável em qualquer Banco do Sistema de Compensação', 10, 25);

        doc.text('Beneficiário', 10, 35);
        doc.text(dadosBoleto.cedente.nome, 10, 40);

        doc.text('Vencimento', 150, 20);
        doc.setFontSize(12).setFont(undefined, 'bold');
        doc.text(format(new Date(dadosBoleto.documento.dataVencimento + 'T12:00:00Z'), 'dd/MM/yyyy'), 150, 25);
        doc.setFontSize(10).setFont(undefined, 'normal');

        doc.text('Agência / Código Beneficiário', 150, 35);
        doc.text(`${dadosBoleto.agencia} / ${dadosBoleto.conta}`, 150, 40);

        doc.text('Nosso Número', 150, 50);
        doc.text(dadosBoleto.documento.numero, 150, 55);

        doc.text('(=) Valor do Documento', 150, 65);
        doc.text(formatBRLNumber(dadosBoleto.documento.valor), 150, 70);

        doc.text('Pagador', 10, 80);
        doc.text(dadosBoleto.documento.pagador.nome, 10, 85);
        doc.text(`${dadosBoleto.documento.pagador.endereco.logradouro}`, 10, 90);
        doc.text(`${dadosBoleto.documento.pagador.endereco.cidade} - ${dadosBoleto.documento.pagador.endereco.uf} - CEP: ${dadosBoleto.documento.pagador.endereco.cep}`, 10, 95);


        // Linha digitável
        doc.setFontSize(12).setFont(undefined, 'bold');
        doc.text('422-7', 150, 10, { align: 'center' });
        doc.text(linhaDigitavel, 105, 15, { align: 'center' });

        // Placeholder para código de barras (requer biblioteca externa)
        doc.rect(10, 120, 100, 20);
        doc.text('Espaço para Código de Barras', 35, 130);
    });
    
    return doc.output('arraybuffer');
}