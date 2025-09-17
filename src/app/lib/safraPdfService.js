import { jsPDF } from 'jspdf';
import bwipjs from 'bwip-js';
import { format } from 'date-fns';
import { formatBRLNumber, formatCnpjCpf } from '../utils/formatters';

// Módulo 10
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

// Módulo 11
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

// Geração da linha digitável e código de barras
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

// Geração da imagem do código de barras
async function gerarImagemCodigoBarras(codigo) {
  return new Promise((resolve, reject) => {
    bwipjs.toBuffer({
      bcid: 'code128',
      text: codigo,
      scale: 3,
      height: 10,
      includetext: false,
      textxalign: 'center',
    }, (err, png) => {
      if (err) reject(err);
      else {
        const base64 = png.toString('base64');
        resolve(`data:image/png;base64,${base64}`);
      }
    });
  });
}

// Geração do PDF
export async function gerarPdfBoletoSafra(listaBoletos) {
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });

  const drawField = (label, value, x, y, width, height, valueAlign = 'left') => {
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    doc.text(label, x + 1, y + 3);
    doc.setFontSize(10);
    doc.setTextColor(0);
    let textX = valueAlign === 'right' ? x + width - 2 : x + 2;
    doc.text(value, textX, y + 8, { align: valueAlign });
  };

  for (let index = 0; index < listaBoletos.length; index++) {
    const dadosBoleto = listaBoletos[index];
    if (index > 0) doc.addPage();

    const { linhaDigitavel, codigoBarras } = gerarLinhaDigitavelEDAC({
      agencia: dadosBoleto.agencia,
      conta: dadosBoleto.conta,
      nossoNumero: dadosBoleto.documento.numero,
      valor: dadosBoleto.documento.valor,
      vencimento: dadosBoleto.documento.dataVencimento
    });

    const imagemBase64 = await gerarImagemCodigoBarras(codigoBarras);

    // Recibo do Pagador
    doc.setFontSize(10).setFont('helvetica', 'bold');
    doc.text('Recibo do Pagador', 17, 20);
    drawField('Beneficiário', `${dadosBoleto.cedente.nome} - CNPJ/CPF: ${formatCnpjCpf(dadosBoleto.cedente.cnpj)}`, 17, 25, 180, 10);
    drawField('Data do documento', format(new Date(dadosBoleto.documento.dataEmissao), 'dd/MM/yyyy'), 17, 35, 30, 10);
    drawField('Número do documento', dadosBoleto.documento.numeroCliente, 47, 35, 30, 10);
    drawField('Carteira', '60', 77, 35, 20, 10);
    drawField('Agência/Cód. Beneficiário', `${dadosBoleto.agencia}/${dadosBoleto.conta}`, 97, 35, 55, 10);
    drawField('Vencimento', format(new Date(dadosBoleto.documento.dataVencimento), 'dd/MM/yyyy'), 152, 35, 45, 10, 'right');
    drawField('Nosso Número', dadosBoleto.documento.numero, 152, 45, 45, 10, 'right');
    drawField('(=) Valor do Documento', formatBRLNumber(dadosBoleto.documento.valor), 152, 55, 45, 10, 'right');

    const pagadorAddress = `${dadosBoleto.documento.pagador.endereco.logradouro || ''}\n${dadosBoleto.documento.pagador.endereco.cidade || ''} ${dadosBoleto.documento.pagador.endereco.uf || ''} CEP: ${dadosBoleto.documento.pagador.endereco.cep || ''}`;
    drawField('Pagador', `${dadosBoleto.documento.pagador.nome} - CNPJ/CPF: ${formatCnpjCpf(dadosBoleto.documento.pagador.numeroDocumento)}\n${pagadorAddress}`, 17, 65, 180, 15);

    doc.setLineDash([1, 1], 0);
    doc.line(17, 85, 200, 85);
    doc.setLineDash([], 0);
    doc.text('Autenticação Mecânica', 152, 82, { align: 'right' });

    // Ficha de Compensação
    doc.setFontSize(12).setFont('helvetica', 'bold');
    doc.text('Safra', 25, 95);
    doc.line(40, 92, 40, 98);
    doc.text('422-7', 45, 95);
    doc.line(55, 92, 55, 98);
    doc.setFontSize(14).setFont('courier', 'bold');
    doc.text(linhaDigitavel, 105, 95, { align: 'center' });

    // Ficha de Compensação (continuação)
    doc.rect(17, 100, 185, 85); // contorno da ficha

    drawField('Local de Pagamento', 'Pagável em qualquer banco até o vencimento', 17, 100, 130, 10);
    drawField('Vencimento', format(new Date(dadosBoleto.documento.dataVencimento), 'dd/MM/yyyy'), 152, 100, 50, 10, 'right');

    doc.line(17, 110, 200, 110);
    drawField('Beneficiário', `${dadosBoleto.cedente.nome} - CNPJ/CPF: ${formatCnpjCpf(dadosBoleto.cedente.cnpj)}`, 17, 110, 130, 10);
    drawField('Agência/Cód. Beneficiário', `${dadosBoleto.agencia}/${dadosBoleto.conta}`, 152, 110, 50, 10, 'right');

    doc.line(17, 120, 200, 120);
    drawField('Data do Documento', format(new Date(dadosBoleto.documento.dataEmissao), 'dd/MM/yyyy'), 17, 120, 30, 10);
    drawField('Número do Documento', dadosBoleto.documento.numeroCliente, 47, 120, 30, 10);
    drawField('Espécie Doc.', dadosBoleto.documento.especie, 77, 120, 20, 10);
    drawField('Aceite', 'Não', 97, 120, 15, 10);
    drawField('Data do Processamento', format(new Date(dadosBoleto.documento.dataEmissao), 'dd/MM/yyyy'), 112, 120, 35, 10);
    drawField('Nosso Número', dadosBoleto.documento.numero, 152, 120, 50, 10, 'right');

    doc.line(17, 130, 200, 130);
    drawField('Carteira', '60', 47, 130, 20, 10);
    drawField('Espécie', 'R$', 77, 130, 20, 10);
    drawField('(=) Valor do Documento', formatBRLNumber(dadosBoleto.documento.valor), 152, 130, 50, 10, 'right');

    doc.line(17, 140, 147, 140);
    doc.setFontSize(8);
    const instrucoes = [
      'JUROS DE R$22,40 AO DIA A PARTIR DO VENCIMENTO',
      'MULTA DE 2,00% A PARTIR DO VENCIMENTO'
    ];
    instrucoes.forEach((linha, i) => {
      doc.text(linha, 18, 144 + i * 4);
    });

    doc.line(147, 140, 200, 140);
    drawField('(-) Desconto/Abatimento', '', 147, 140, 53, 10);
    doc.line(147, 150, 200, 150);
    drawField('(-) Outras Deduções', '', 147, 150, 53, 10);
    doc.line(147, 160, 200, 160);
    drawField('(+) Mora/Multa', '', 147, 160, 53, 10);
    doc.line(147, 170, 200, 170);
    drawField('(+) Outros Acréscimos', '', 147, 170, 53, 10);
    doc.line(17, 180, 200, 180);
    drawField('(=) Valor Cobrado', '', 147, 180, 53, 10);

    drawField('Pagador', `${dadosBoleto.documento.pagador.nome} - CNPJ/CPF: ${formatCnpjCpf(dadosBoleto.documento.pagador.numeroDocumento)}\n${pagadorAddress}`, 17, 180, 130, 20);

    doc.text('Autenticação Mecânica - Ficha de Compensação', 152, 195, { align: 'right' });

    // Inserção do código de barras gerado com bwip-js
    doc.addImage(imagemBase64, 'PNG', 17, 200, 170, 20); // ajuste de posição e tamanho conforme necessário
  }

  return doc.output('arraybuffer');
}