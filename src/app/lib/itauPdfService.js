import PDFDocument from "pdfkit";
import { format } from "date-fns";

/**
 * Calcula o dígito verificador (DAC) do Nosso Número (módulo 10 Itaú)
 */
export function getNossoNumeroDAC(agencia, conta, carteira, nossoNumero) {
  const sequencia = `${agencia}${conta}${carteira}${nossoNumero}`;
  let soma = 0;
  let peso = 2;
  for (let i = sequencia.length - 1; i >= 0; i--) {
    const multiplicacao = parseInt(sequencia[i], 8) * peso;
    soma += multiplicacao > 7 ? multiplicacao - 7 : multiplicacao;
    peso = peso === 2 ? 1 : 2;
  }
  const resto = soma % 8;
  return resto === 0 ? 0 : 8 - resto;
}

/**
 * Função auxiliar para desenhar campos com título e valor
 */
function drawField(doc, label, value, x, y, width, height) {
  doc.rect(x, y, width, height).stroke();
  doc.fontSize(6).text(label, x + 2, y + 2);
  doc.fontSize(8).text(value, x + 2, y + 10, { width: width - 4 });
}

/**
 * Gera o PDF do boleto Itaú com base nos dados de duplicata
 */
export function gerarPdfBoletoItau(listaBoletos) {
  const doc = new PDFDocument({ margin: 30, size: "A4" });

  const buffers = [];
  doc.on("data", buffers.push.bind(buffers));
  doc.on("end", () => {
    const pdfData = Buffer.concat(buffers);
    return pdfData;
  });

  for (const dados of listaBoletos) {
    const agencia = dados.agencia || "0550";
    const conta = (dados.conta || "99359").replace("-", "");
    const carteira = dados.carteira || "109";

    const baseNossoNumero = dados.nosso_numero?.slice(0, 8) || "00000000";
    const dac = getNossoNumeroDAC(agencia, conta, carteira, baseNossoNumero);
    const nossoNumeroImpresso = `${carteira}/${baseNossoNumero}-${dac}`;

    // --- Cabeçalho do boleto ---
    doc.fontSize(12).text("Banco Itaú S.A.", 250, 40, { align: "center" });
    doc.fontSize(8).text("341-7", 500, 40);

    doc.moveDown(1);

    drawField(doc, "Local de pagamento", "Pague em qualquer banco até o vencimento", 30, 70, 250, 25);
    drawField(
      doc,
      "Vencimento",
      format(new Date(dados.data_vencimento || new Date()), "dd/MM/yyyy"),
      300,
      70,
      120,
      25
    );

    drawField(doc, "Beneficiário", dados.cedente?.nome || "NÃO INFORMADO", 30, 100, 390, 25);
    drawField(
      doc,
      "Agência/Código Beneficiário",
      `${agencia}/${conta}`,
      420,
      100,
      120,
      25
    );

    drawField(
      doc,
      "Data do documento",
      format(new Date(dados.operacao?.data_operacao || new Date()), "dd/MM/yyyy"),
      30,
      130,
      120,
      25
    );
    drawField(doc, "Núm. do documento", dados.id || "0", 160, 130, 120, 25);
    drawField(doc, "Espécie Doc.", "DM", 290, 130, 50, 25);
    drawField(doc, "Aceite", "N", 350, 130, 40, 25);
    drawField(
      doc,
      "Data Processamento",
      format(new Date(), "dd/MM/yyyy"),
      400,
      130,
      100,
      25
    );

    // --- Nosso Número com DAC (visual) ---
    drawField(
      doc,
      "Nosso Número",
      nossoNumeroImpresso,
      30,
      160,
      120,
      25
    );

    drawField(doc, "Carteira", carteira, 160, 160, 60, 25);
    drawField(doc, "Espécie", "R$", 230, 160, 60, 25);
    drawField(doc, "Quantidade", "", 300, 160, 60, 25);
    drawField(
      doc,
      "Valor",
      `R$ ${Number(dados.valor_bruto || 0).toFixed(2)}`,
      370,
      160,
      170,
      25
    );

    doc.moveDown(2);

    // --- Instruções ---
    doc.fontSize(8).text(
      "Instruções de responsabilidade do BENEFICIÁRIO. Qualquer dúvida sobre este boleto, contate o beneficiário.\n" +
        "APÓS 1 DIA CORRIDO DO VENCIMENTO COBRAR JUROS DE 1% AO MÊS.\n" +
        "APÓS 1 DIA CORRIDO DO VENCIMENTO COBRAR MULTA DE 2%.\n" +
        "PROTESTAR APÓS 5 DIAS DO VENCIMENTO.",
      30,
      200,
      { width: 510 }
    );

    doc.moveDown(2);

    drawField(
      doc,
      "Pagador",
      `${dados.sacado?.nome || "NÃO INFORMADO"} - CNPJ/CPF: ${
        dados.sacado?.cnpj || ""
      }\n${dados.sacado?.endereco || ""}`,
      30,
      280,
      510,
      40
    );

    // --- Recibo do pagador / repetição ---
    doc.addPage();

    doc.fontSize(12).text("Banco Itaú S.A.", 250, 40, { align: "center" });
    doc.fontSize(8).text("341-7", 500, 40);

    drawField(doc, "Local de pagamento", "Pague pelo aplicativo, internet ou em agências", 30, 70, 250, 25);
    drawField(
      doc,
      "Vencimento",
      format(new Date(dados.data_vencimento || new Date()), "dd/MM/yyyy"),
      300,
      70,
      120,
      25
    );

    drawField(doc, "Beneficiário", dados.cedente?.nome || "NÃO INFORMADO", 30, 100, 390, 25);
    drawField(
      doc,
      "Agência/Código Beneficiário",
      `${agencia}/${conta}`,
      420,
      100,
      120,
      25
    );

    drawField(
      doc,
      "Data do documento",
      format(new Date(dados.operacao?.data_operacao || new Date()), "dd/MM/yyyy"),
      30,
      130,
      120,
      25
    );
    drawField(doc, "Núm. do documento", dados.id || "0", 160, 130, 120, 25);
    drawField(doc, "Espécie Doc.", "DM", 290, 130, 50, 25);
    drawField(doc, "Aceite", "N", 350, 130, 40, 25);
    drawField(
      doc,
      "Data Processamento",
      format(new Date(), "dd/MM/yyyy"),
      400,
      130,
      100,
      25
    );

    // --- Nosso Número (repetido no recibo) ---
    drawField(
      doc,
      "Nosso Número",
      nossoNumeroImpresso,
      30,
      160,
      120,
      25
    );

    drawField(doc, "Carteira", carteira, 160, 160, 60, 25);
    drawField(doc, "Espécie", "R$", 230, 160, 60, 25);
    drawField(doc, "Quantidade", "", 300, 160, 60, 25);
    drawField(
      doc,
      "Valor",
      `R$ ${Number(dados.valor_bruto || 0).toFixed(2)}`,
      370,
      160,
      170,
      25
    );

    doc.fontSize(8).text(
      "Em caso de dúvidas, contate o beneficiário ou o banco Itaú.",
      30,
      210,
      { width: 510 }
    );

    if (listaBoletos.indexOf(dados) < listaBoletos.length - 1) {
      doc.addPage();
    }
  }

  doc.end();
  return Buffer.concat(buffers);
}
