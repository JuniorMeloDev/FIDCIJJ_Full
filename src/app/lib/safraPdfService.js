import { jsPDF } from 'jspdf';
import { format } from 'date-fns';
import { formatBRLNumber, formatCnpjCpf } from '../utils/formatters';

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

    const linhaDigitavel = `${campo1Formatado}  ${campo2Formatado}  ${campo3Formatado}  ${campo4}  ${campo5}`;

    return { linhaDigitavel, codigoBarras };
}


// --- Função Principal de Geração de PDF ---
export function gerarPdfBoletoSafra(listaBoletos) {
    const doc = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4'
    });

    const drawField = (label, value, x, y, width, height, valueAlign = 'left') => {
        doc.setFontSize(7);
        doc.setTextColor(100);
        doc.text(label, x + 1, y + 3);
        doc.setFontSize(10);
        doc.setTextColor(0);
        
        let textX = x + 2;
        if (valueAlign === 'right') {
            textX = x + width - 2;
        }
        doc.text(value, textX, y + 8, { align: valueAlign });
    };

    listaBoletos.forEach((dadosBoleto, index) => {
        if (index > 0) {
            doc.addPage();
        }
        
        const { linhaDigitavel, codigoBarras } = gerarLinhaDigitavelEDAC({
            agencia: dadosBoleto.agencia,
            conta: dadosBoleto.conta,
            nossoNumero: dadosBoleto.documento.numero,
            valor: dadosBoleto.documento.valor,
            vencimento: dadosBoleto.documento.dataVencimento
        });

        // --- Recibo do Pagador ---
        doc.setFontSize(10).setFont(undefined, 'bold');
        doc.text('Recibo do Pagador', 15, 15);
        
        doc.setFontSize(10).setFont(undefined, 'normal');
        drawField('Beneficiário', `${dadosBoleto.cedente.nome} - CNPJ/CPF: ${formatCnpjCpf(dadosBoleto.cedente.cnpj)}`, 15, 20, 180, 10);
        drawField('Data do documento', format(new Date(dadosBoleto.documento.dataEmissao + 'T12:00:00Z'), 'dd/MM/yyyy'), 15, 30, 30, 10);
        drawField('Número do documento', dadosBoleto.documento.numeroCliente, 45, 30, 30, 10);
        drawField('Carteira', '60', 75, 30, 20, 10);
        drawField('Agência/Cód. Beneficiário', `${dadosBoleto.agencia}/${dadosBoleto.conta}`, 95, 30, 55, 10);
        drawField('Vencimento', format(new Date(dadosBoleto.documento.dataVencimento + 'T12:00:00Z'), 'dd/MM/yyyy'), 150, 30, 45, 10, 'right');
        drawField('Nosso Número', dadosBoleto.documento.numero, 150, 40, 45, 10, 'right');
        drawField('(=) Valor do Documento', formatBRLNumber(dadosBoleto.documento.valor), 150, 50, 45, 10, 'right');
        
        const pagadorAddress = `${dadosBoleto.documento.pagador.endereco.logradouro || ''}\n${dadosBoleto.documento.pagador.endereco.cidade || ''} ${dadosBoleto.documento.pagador.endereco.uf || ''} CEP: ${dadosBoleto.documento.pagador.endereco.cep || ''}`;
        drawField('Pagador', `${dadosBoleto.documento.pagador.nome} - CNPJ/CPF: ${formatCnpjCpf(dadosBoleto.documento.pagador.numeroDocumento)}\n${pagadorAddress}`, 15, 60, 180, 15);

        doc.text('Autenticação Mecânica', 150, 85, { align: 'right' });
        doc.line(15, 90, 200, 90); // Linha de corte

        // --- Ficha de Compensação ---
        doc.setFontSize(12).setFont(undefined, 'bold');
        doc.text('Safra', 25, 100);
        doc.line(40, 95, 40, 102);
        doc.text('422-7', 45, 100);
        doc.line(55, 95, 55, 102);
        doc.setFontSize(14).setFont('courier', 'bold');
        doc.text(linhaDigitavel, 105, 100, { align: 'center' });
        
        doc.rect(15, 105, 185, 80); // Contorno principal da ficha

        drawField('Local de Pagamento', 'Pagável em qualquer banco', 15, 105, 130, 10);
        drawField('Vencimento', format(new Date(dadosBoleto.documento.dataVencimento + 'T12:00:00Z'), 'dd/MM/yyyy'), 145, 105, 55, 10, 'right');
        
        doc.line(15, 115, 200, 115);
        drawField('Beneficiário', `${dadosBoleto.cedente.nome} - CNPJ/CPF: ${formatCnpjCpf(dadosBoleto.cedente.cnpj)}`, 15, 115, 130, 10);
        drawField('Agência/Cód. Beneficiário', `${dadosBoleto.agencia}/${dadosBoleto.conta}`, 145, 115, 55, 10, 'right');

        doc.line(15, 125, 200, 125);
        drawField('Data do Doc.', format(new Date(dadosBoleto.documento.dataEmissao + 'T12:00:00Z'), 'dd/MM/yyyy'), 15, 125, 30, 10);
        drawField('Nº do Doc.', dadosBoleto.documento.numeroCliente, 45, 125, 30, 10);
        drawField('Esp. Doc.', dadosBoleto.documento.especie, 75, 125, 20, 10);
        drawField('Aceite', 'Não', 95, 125, 15, 10);
        drawField('Data do Movto', format(new Date(dadosBoleto.documento.dataEmissao + 'T12:00:00Z'), 'dd/MM/yyyy'), 110, 125, 35, 10);
        drawField('Nosso Número', dadosBoleto.documento.numero, 145, 125, 55, 10, 'right');

        doc.line(15, 135, 200, 135);
        drawField('Carteira', '60', 45, 135, 20, 10);
        drawField('Espécie', 'R$', 75, 135, 20, 10);
        drawField('(=) Valor do Documento', formatBRLNumber(dadosBoleto.documento.valor), 145, 135, 55, 10, 'right');

        doc.line(15, 145, 145, 145);
        drawField('Instruções', 'JUROS DE R$22,40 AO DIA A PARTIR DO VENCIMENTO\nMULTA DE 2,00% A PARTIR DO VENCIMENTO', 15, 145, 130, 20);
        
        doc.line(145, 145, 200, 145);
        drawField('(-) Desconto/Abatimento', '', 145, 145, 55, 10);
        doc.line(145, 155, 200, 155);
        drawField('(-) Outras Deduções', '', 145, 155, 55, 10);
        doc.line(145, 165, 200, 165);
        drawField('(+) Mora/Multa', '', 145, 165, 55, 10);
        doc.line(145, 175, 200, 175);
        drawField('(+) Outros Acréscimos', '', 145, 175, 55, 10);
        doc.line(15, 185, 200, 185);
        drawField('(=) Valor Cobrado', '', 145, 185, 55, 10);
        
        drawField('Pagador', `${dadosBoleto.documento.pagador.nome} - CNPJ/CPF: ${formatCnpjCpf(dadosBoleto.documento.pagador.numeroDocumento)}\n${pagadorAddress}`, 15, 185, 130, 20);
        
        doc.text('Autenticação Mecânica - Ficha de Compensação', 150, 215, { align: 'right' });
        
        // Placeholder para código de barras (requer biblioteca externa, não incluída no jsPDF)
        doc.text(`Espaço para Código de Barras: ${codigoBarras}`, 15, 200);

    });
    
    return doc.output('arraybuffer');
}