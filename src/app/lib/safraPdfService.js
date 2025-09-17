import { jsPDF } from 'jspdf';
import { format, addDays } from 'date-fns';
import { formatBRLNumber, formatCnpjCpf } from '../utils/formatters';

// ---------- Cálculo da linha digitável (igual ao original) ----------
function modulo10(bloco) {
    const mult = [2, 1];
    let soma = 0, m = 0;
    for (let i = bloco.length - 1; i >= 0; i--, m++) {
        let prod = parseInt(bloco[i], 10) * mult[m % 2];
        if (prod > 9) prod = Math.floor(prod / 10) + (prod % 10);
        soma += prod;
    }
    const resto = soma % 10;
    return resto === 0 ? 0 : 10 - resto;
}

function modulo11(bloco) {
    const mult = [2, 3, 4, 5, 6, 7, 8, 9];
    let soma = 0, m = 0;
    for (let i = bloco.length - 1; i >= 0; i--, m++) soma += parseInt(bloco[i], 10) * mult[m % 8];
    const resto = soma % 11;
    let dac = 11 - resto;
    return (dac === 0 || dac === 10 || dac === 11) ? 1 : dac;
}

function gerarLinhaDigitavelEDAC({ agencia, conta, nossoNumero, valor, vencimento }) {
    const banco = "422";
    const moeda = "9";
    const tipoCobranca = "2";
    const dataBase = new Date('2022-05-29T12:00:00Z');
    const fatorVenc = Math.ceil((new Date(vencimento + 'T12:00:00Z') - dataBase) / 86400000)
                        .toString().padStart(4, '0');
    const valorFmt = Math.round(valor * 100).toString().padStart(10, '0');
    const campoLivre = `7${agencia}${conta}${nossoNumero}${tipoCobranca}`;
    const dac = modulo11(`${banco}${moeda}${fatorVenc}${valorFmt}${campoLivre}`);
    const codigoBarras = `${banco}${moeda}${dac}${fatorVenc}${valorFmt}${campoLivre}`;

    const c1 = `${banco}${moeda}${campoLivre.substring(0, 5)}`;
    const c2 = campoLivre.substring(5, 15);
    const c3 = campoLivre.substring(15, 25);

    const campo1 = `${c1.substring(0, 5)}.${c1.substring(5)}${modulo10(c1)}`;
    const campo2 = `${c2.substring(0, 5)}.${c2.substring(5)}${modulo10(c2)}`;
    const campo3 = `${c3.substring(0, 5)}.${c3.substring(5)}${modulo10(c3)}`;
    const linhaDigitavel = `${campo1}  ${campo2}  ${campo3}  ${dac}  ${fatorVenc}${valorFmt}`;
    return { linhaDigitavel, codigoBarras };
}

function drawInterleaved2of5(doc, x, y, code, width = 160, height = 15) {
    const patterns = ['00110', '10001', '01001', '11000', '00101', '10100', '01100', '00011', '10010', '01010'];
    const start = '0000', stop = '100';
    if (code.length % 2) code = '0' + code;
    let binary = start;
    for (let i = 0; i < code.length; i += 2) {
        const p1 = patterns[parseInt(code[i], 10)], p2 = patterns[parseInt(code[i + 1], 10)];
        for (let j = 0; j < 5; j++) binary += p1[j] + p2[j];
    }
    binary += stop;

    const wideRatio = 3;
    const numN = (binary.match(/0/g) || []).length;
    const numW = (binary.match(/1/g) || []).length;
    const narrow = width / (numN + numW * wideRatio);
    const wide = narrow * wideRatio;

    let cx = x;
    doc.setFillColor(0, 0, 0);
    for (let i = 0; i < binary.length; i++) {
        const isBar = i % 2 === 0;
        const w = binary[i] === '1' ? wide : narrow;
        if (isBar) doc.rect(cx, y, w, height, 'F');
        cx += w;
    }
}

// ---------- Geração do PDF ----------
export function gerarPdfBoletoSafra(listaBoletos) {
    const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });

    listaBoletos.forEach((b, idx) => {
        if (idx > 0) doc.addPage();
        const { linhaDigitavel, codigoBarras } = gerarLinhaDigitavelEDAC({
            agencia: b.agencia,
            conta: b.conta,
            nossoNumero: b.documento.numero,
            valor: b.documento.valor,
            vencimento: b.documento.dataVencimento
        });
        const vencDate = new Date(b.documento.dataVencimento + 'T12:00:00Z');
        const emissao = new Date(b.documento.dataEmissao + 'T12:00:00Z');
        const dataJuros = format(addDays(vencDate, 1), 'dd/MM/yyyy');

        // -------- Recibo do Pagador --------
        doc.setFont('helvetica', 'bold').setFontSize(10).text('Recibo do Pagador', 15, 15);
        doc.setFontSize(8);
        // Cabeçalho único
        doc.text('Beneficiário        Nosso Número        Vencimento', 15, 22);
        doc.text(`${b.cedente.nome} - CNPJ/CPF: ${formatCnpjCpf(b.cedente.cnpj)}    ${b.documento.numero}    ${format(vencDate,'dd/MM/yyyy')}`, 15, 27);

        // Tabela compacta
        doc.text('Data Doc.   Nº Doc.   Carteira   Agência/Cód. Benef.   Valor', 15, 34);
        doc.text(`${format(emissao,'dd/MM/yyyy')}   ${b.documento.numeroCliente}   60   ${b.agencia}/${b.conta}   ${formatBRLNumber(b.documento.valor)}`, 15, 39);

        // Pagador e referência
        doc.text(`Pagador: ${b.documento.pagador.nome} - CNPJ/CPF: ${formatCnpjCpf(b.documento.pagador.numeroDocumento)}`, 15, 47);
        doc.text(`FORNECEDOR: ${b.cedente.nome}  CNPJ: ${formatCnpjCpf(b.cedente.cnpj)}`, 15, 52);
        if (b.documento.referenciaNF) {
            doc.text(`REFERENTE A NF ${b.documento.referenciaNF}`, 15, 56);
        }

        // Rodapé recibo
        doc.text('Boleto impresso eletronicamente através do Canal Safra Empresas', 15, 62);
        doc.text('Autenticação Mecânica', 150, 62);

        doc.setLineDashPattern([1,1],0).line(15,66,195,66).setLineDashPattern([],0);

        // -------- Ficha de Compensação --------
        doc.setFont('helvetica','bold').setFontSize(12).text('Safra', 25, 75);
        doc.line(40,71,40,78);
        doc.text('422-7', 45, 75);
        doc.line(55,71,55,78);
        doc.setFont('courier','bold').setFontSize(13)
            .text(linhaDigitavel, 115, 75, { align:'center' });

        // Caixa principal
        const x = 15, y = 80, w = 180;
        doc.setLineWidth(0.2).rect(x, y, w, 95);

        const draw = (label, value, xx, yy, ww, hh, align='left', vSize=9) => {
            doc.setFont('helvetica','normal').setFontSize(6).text(label, xx+1.5, yy+3);
            doc.setFontSize(vSize).text(value, align==='right'?xx+ww-1.5:xx+1.5, yy+hh-2, {align});
        };

        draw('Local de Pagamento','Pagável em qualquer banco', x, y, 130, 10);
        draw('Vencimento', format(vencDate,'dd/MM/yyyy'), x+130, y, 50, 10, 'right', 10);

        doc.line(x, y+10, x+w, y+10);
        draw('Beneficiário', b.cedente.nome, x, y+10, 130, 10);
        draw('Agência/Cód. Beneficiário', `${b.agencia}/${b.conta}`, x+130, y+10, 50, 10,'right');

        doc.line(x, y+20, x+w, y+20);
        draw('Data do Doc.', format(emissao,'dd/MM/yyyy'), x, y+20, 25, 10);
        draw('Nº do Doc.', b.documento.numeroCliente, x+25, y+20, 35, 10);
        draw('Esp. Doc.', b.documento.especie || 'DM', x+60, y+20, 15, 10);
        draw('Aceite','Não', x+75, y+20, 15, 10);
        draw('Data do Movto', format(emissao,'dd/MM/yyyy'), x+90, y+20, 40, 10);
        draw('Nosso Número', b.documento.numero, x+130, y+20, 50, 10,'right');

        doc.line(x, y+30, x+w, y+30);
        draw('Carteira','60', x, y+30, 20, 10);
        draw('Espécie','R$', x+20, y+30, 20, 10);
        draw('(=) Valor do Documento', formatBRLNumber(b.documento.valor), x+130, y+30, 50, 10, 'right', 10);

        doc.line(x, y+40, x+w, y+40);
        draw('Instruções',
             `JUROS DE R$22,40 AO DIA A PARTIR DE ${dataJuros}\nMULTA DE 2,00% A PARTIR DE ${dataJuros}`,
             x, y+40, 130, 15);

        // Pagador com endereço
        const endPag = `${b.documento.pagador.endereco.logradouro}, ${b.documento.pagador.endereco.numero}\n`+
                       `${b.documento.pagador.endereco.cidade} ${b.documento.pagador.endereco.uf} CEP: ${b.documento.pagador.endereco.cep}`;
        doc.line(x, y+65, x+w, y+65);
        draw('Pagador', `${b.documento.pagador.nome}\n${endPag}`, x, y+65, 130, 20);

        // Outras linhas de valores
        draw('(-) Desconto/Abatimento','', x+130, y+40, 50, 7);
        draw('(-) Outras Deduções','', x+130, y+47, 50, 7);
        draw('(+) Mora/Multa','', x+130, y+54, 50, 7);
        draw('(+) Outros Acréscimos','', x+130, y+61, 50, 7);
        draw('(=) Valor Cobrado','', x+130, y+68, 50, 10);

        // Código de barras
        drawInterleaved2of5(doc, x+10, y+150, codigoBarras);

        doc.setFont('helvetica','normal').setFontSize(8)
           .text('Autenticação Mecânica - Ficha de Compensação', 195, 180, {align:'right'});
    });

    return doc.output('arraybuffer');
}
