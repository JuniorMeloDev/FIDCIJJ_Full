import { jsPDF } from "jspdf";
import { format, differenceInDays, addDays } from "date-fns";
import { formatBRLNumber, formatCnpjCpf } from "../utils/formatters";
// Removidos 'fs' e 'path'

// Função HELPER para obter a URL base
const getBaseURL = () => {
  let baseURL = process.env.NEXT_PUBLIC_APP_URL; // Prioriza a URL explícita
  if (!baseURL && process.env.VERCEL_URL) {
    baseURL = `https://${process.env.VERCEL_URL}`; // Fallback para URL da Vercel
  }
  if (!baseURL) {
    baseURL = "http://localhost:3000"; // Fallback para local
  }
  return baseURL.replace(/\/$/, ""); // Remove barra final se houver
};

// Função getItauLogoBase64 com mais logs
const getItauLogoBase64 = async () => {
  const baseURL = getBaseURL();
  const logoURL = `${baseURL}/itau.png`;
  console.log(`[LOG ITAÚ PDF] Tentando buscar logo de: ${logoURL}`);

  try {
    const response = await fetch(logoURL, { cache: "no-store" }); // Evita cache
    console.log(`[LOG ITAÚ PDF] Fetch status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[ERRO ITAÚ PDF] Fetch falhou com status ${response.status}: ${errorText}`
      );
      throw new Error(
        `Falha ao buscar logo Itaú (${response.status}) - URL: ${logoURL}`
      );
    }

    const contentType = response.headers.get("content-type");
    console.log(`[LOG ITAÚ PDF] Fetch content-type: ${contentType}`);
    if (!contentType || !contentType.startsWith("image/")) {
      throw new Error(
        `Tipo de conteúdo inesperado (${contentType}) recebido de ${logoURL}`
      );
    }

    const imageBuffer = await response.arrayBuffer();
    console.log(
      `[LOG ITAÚ PDF] Buffer da imagem recebido, tamanho: ${imageBuffer.byteLength} bytes`
    );
    if (imageBuffer.byteLength === 0) {
      throw new Error(`Buffer da imagem vazio recebido de ${logoURL}`);
    }

    const base64String = Buffer.from(imageBuffer).toString("base64");
    console.log(`[LOG ITAÚ PDF] Logo convertido para base64 com sucesso.`);
    return `data:image/png;base64,${base64String}`;
  } catch (error) {
    console.error(
      "[ERRO ITAÚ PDF] Exceção durante busca/conversão do logo:",
      error
    );
    return null; // Retorna null em caso de erro
  }
};

// ... (Funções modulo10, modulo11, etc. permanecem as mesmas) ...
function modulo10(bloco) {
  /* ...código original... */
}
function modulo11(bloco) {
  /* ...código original... */
}
const getAgenciaContaDAC = (agencia, conta) => modulo10(`${agencia}${conta}`);
export const getNossoNumeroDAC = (agencia, conta, carteira, nossoNumero) => {
  /* ...código original... */
};
function gerarLinhaDigitavelECodigoBarras(dados) {
  /* ...código original... */
}
function drawInterleaved2of5(doc, x, y, code, width = 103, height = 13) {
  /* ...código original... */
}
const drawField = (
  doc,
  label,
  value,
  x,
  y,
  width,
  height,
  valueAlign = "left",
  valueSize = 9,
  labelSize = 6.5
) => {
  /* ...código original... */
};

// Marcar a função principal como async
export async function gerarPdfBoletoItau(listaBoletos) {
  const doc = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
  console.log("[LOG ITAÚ PDF] Iniciando geração do PDF...");
  console.log("[LOG ITAÚ PDF] Buscando logo base64...");
  const itauLogoBase64 = await getItauLogoBase64(); // Use await
  console.log(
    `[LOG ITAÚ PDF] Logo base64 obtido: ${itauLogoBase64 ? "Sim" : "Não"}`
  );

  listaBoletos.forEach((dadosBoleto, index) => {
    console.log(`[LOG ITAÚ PDF] Desenhando boleto índice ${index}...`);
    if (index > 0) doc.addPage();

    const valorFinalBoleto =
      dadosBoleto.valor_bruto - (dadosBoleto.abatimento || 0);

    const { linhaDigitavel, codigoBarras } = gerarLinhaDigitavelECodigoBarras({
      agencia: dadosBoleto.agencia,
      conta: dadosBoleto.conta,
      carteira: dadosBoleto.carteira,
      nossoNumero: dadosBoleto.nosso_numero,
      valor: valorFinalBoleto,
      vencimento: dadosBoleto.data_vencimento,
    });
    const vencimentoDate = new Date(dadosBoleto.data_vencimento + "T12:00:00Z");

    const nossoNumeroImpresso = `${dadosBoleto.carteira}/${dadosBoleto.nosso_numero}-${dadosBoleto.dac_nosso_numero}`;

    const drawSection = (yOffset) => {
      doc.setLineWidth(0.2);
      if (itauLogoBase64) {
        console.log(`[LOG ITAÚ PDF] Adicionando imagem para boleto ${index}`);
        try {
          doc.addImage(itauLogoBase64, "PNG", 15, yOffset + 1, 30, 8);
          console.log(
            `[LOG ITAÚ PDF] Imagem adicionada com sucesso para boleto ${index}`
          );
        } catch (imgError) {
          console.error(
            `[ERRO ITAÚ PDF] Erro ao adicionar imagem para boleto ${index}:`,
            imgError
          );
        }
      } else {
        console.warn(
          `[AVISO ITAÚ PDF] Logo não disponível para boleto ${index}.`
        );
      }
      // ... (resto da função drawSection, incluindo todas as chamadas a drawField e lines) ...
      doc.setLineWidth(0.5).line(48, yOffset, 48, yOffset + 10);
      doc.setFont("helvetica", "bold").setFontSize(14).setTextColor(0, 0, 0);
      doc.text("341-7", 55.5, yOffset + 7, { align: "center" });
      doc.setLineWidth(0.5).line(63, yOffset, 63, yOffset + 10);
      doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(0, 0, 0);
      doc.text(linhaDigitavel, 65, yOffset + 7, { charSpace: 0.5 });
      doc.setFont("helvetica", "bold");
      const y1 = yOffset + 10;
      drawField(
        doc,
        "Local de pagamento",
        "Pague pelo aplicativo, internet ou em agências e correspondentes.",
        15,
        y1,
        140,
        10,
        "left",
        8
      );
      drawField(
        doc,
        "Vencimento",
        format(vencimentoDate, "dd/MM/yyyy"),
        155,
        y1,
        40,
        10,
        "right",
        9
      );
      const y2 = y1 + 10;
      const beneficiarioLine1 = `${
        dadosBoleto.cedente?.nome || ""
      }    CNPJ/CPF: ${formatCnpjCpf(dadosBoleto.cedente?.cnpj)}`;
      const beneficiarioLine2 = dadosBoleto.cedente?.endereco;
      drawField(
        doc,
        "Beneficiário",
        [beneficiarioLine1, beneficiarioLine2],
        15,
        y2,
        140,
        15,
        "left",
        8
      );
      drawField(
        doc,
        "Agência/Código Beneficiário",
        `${dadosBoleto.agencia}/${dadosBoleto.conta}`,
        155,
        y2,
        40,
        15,
        "right"
      );
      const y3 = y2 + 15;
      drawField(
        doc,
        "Data do documento",
        format(
          new Date(dadosBoleto.data_operacao + "T12:00:00Z"),
          "dd/MM/yyyy"
        ),
        15,
        y3,
        30,
        10,
        "left",
        8
      );
      drawField(
        doc,
        "Núm. do documento",
        dadosBoleto.nf_cte || "",
        45,
        y3,
        30,
        10,
        "left",
        8
      );
      drawField(doc, "Espécie Doc.", "DM", 75, y3, 20, 10, "left", 8);
      drawField(doc, "Aceite", "N", 95, y3, 15, 10, "left", 8);
      drawField(
        doc,
        "Data Processamento",
        format(new Date(), "dd/MM/yyyy"),
        110,
        y3,
        45,
        10,
        "left",
        8
      );
      drawField(
        doc,
        "Nosso Número",
        nossoNumeroImpresso,
        155,
        y3,
        40,
        10,
        "right"
      );
      const y4 = y3 + 10;
      drawField(doc, "Uso do Banco", "", 15, y4, 25, 10);
      drawField(
        doc,
        "Carteira",
        dadosBoleto.carteira,
        40,
        y4,
        15,
        10,
        "center"
      );
      drawField(doc, "Espécie", "R$", 55, y4, 15, 10, "center");
      drawField(doc, "Quantidade", "", 70, y4, 30, 10);
      drawField(doc, "Valor", "", 100, y4, 55, 10);
      drawField(
        doc,
        "(=) Valor do Documento",
        formatBRLNumber(valorFinalBoleto),
        155,
        y4,
        40,
        10,
        "right",
        9
      );
      const y5 = y4 + 10;
      const tipoOp = dadosBoleto.operacao?.tipo_operacao;
      const jurosText =
        tipoOp?.taxa_juros_mora > 0
          ? `APÓS 1 DIA(S) CORRIDO(S) DO VENCIMENTO COBRAR JUROS DE ${tipoOp.taxa_juros_mora
              .toFixed(2)
              .replace(".", ",")}% AO MÊS`
          : null;
      const multaText =
        tipoOp?.taxa_multa > 0
          ? `APÓS 1 DIA(S) CORRIDO(S) DO VENCIMENTO COBRAR MULTA DE ${tipoOp.taxa_multa
              .toFixed(2)
              .replace(".", ",")}%`
          : null;
      const abatimentoText =
        dadosBoleto.abatimento && dadosBoleto.abatimento > 0
          ? `CONCEDER ABATIMENTO DE ${formatBRLNumber(dadosBoleto.abatimento)}`
          : null;
      const instrucoes = [
        "Instruções de responsabilidade do BENEFICIÁRIO. Qualquer dúvida sobre este boleto contate o BENEFICIÁRIO.",
        "",
        jurosText,
        multaText,
        jurosText || multaText ? "" : null,
        "PROTESTAR APÓS 5 DIAS DO VENCIMENTO",
        abatimentoText ? "" : null,
        abatimentoText,
        abatimentoText ? "" : null,
        `REFERENTE A NF ${(dadosBoleto.nf_cte || "").split(".")[0]}`,
      ];
      doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(0, 0, 0);
      doc.text(
        instrucoes.filter((item) => item !== null),
        16,
        y5 + 3,
        { lineHeightFactor: 1.15, maxWidth: 135 }
      );
      drawField(doc, "(-) Descontos/Abatimento", "", 155, y5, 40, 10);
      drawField(doc, "(+) Juros/Multa", "", 155, y5 + 10, 40, 10);
      drawField(doc, "(=) Valor Cobrado", "", 155, y5 + 20, 40, 10);
      const y6 = y5 + 30;
      const sacado = dadosBoleto.sacado || {};
      const pagadorLine1 = `${sacado.nome || ""}    CNPJ/CPF: ${formatCnpjCpf(
        sacado.cnpj
      )}`;
      const pagadorLine2 = `${sacado.endereco || ""}, ${sacado.bairro || ""}`;
      const pagadorLine3 = `${sacado.cep || ""} ${sacado.municipio || ""} - ${
        sacado.uf || ""
      }`;
      drawField(doc, "Pagador", null, 15, y6, 180, 20);
      doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(0, 0, 0);
      doc.text([pagadorLine1, pagadorLine2, pagadorLine3], 16, y6 + 5, {
        lineHeightFactor: 1.15,
      });
      const y7 = y6 + 20;
      drawInterleaved2of5(doc, 15, y7 + 2, codigoBarras, 103, 13);
      doc
        .setFontSize(8)
        .text("Autenticação mecânica", 195, y7 + 18, { align: "right" });
      doc.setLineWidth(0.2);
      const allY = [yOffset, y1, y2, y3, y4, y5, y6, y7];
      allY.forEach((yPos) => doc.line(15, yPos, 195, yPos));
      doc.line(15, yOffset, 15, y7);
      doc.line(195, yOffset, 195, y7);
      doc.line(155, y1, 155, y6);
      doc.line(45, y3, 45, y4);
      doc.line(75, y3, 75, y4);
      doc.line(95, y3, 95, y4);
      doc.line(110, y3, 110, y4);
      doc.line(40, y4, 40, y5);
      doc.line(55, y4, 55, y5);
      doc.line(70, y4, 70, y5);
      doc.line(100, y4, 100, y5);
      doc.line(155, y5 + 10, 195, y5 + 10);
      doc.line(155, y5 + 20, 195, y5 + 20);
    };

    console.log(
      `[LOG ITAÚ PDF] Chamando drawSection para RECIBO (index ${index})`
    );
    drawSection(15);
    doc
      .setFont("helvetica", "bold")
      .setFontSize(9)
      .text("RECIBO DO PAGADOR", 15, 12);
    doc
      .setLineDashPattern([2, 1], 0)
      .line(15, 148, 195, 148)
      .setLineDashPattern([], 0);

    console.log(
      `[LOG ITAÚ PDF] Chamando drawSection para FICHA (index ${index})`
    );
    drawSection(155);
    doc
      .setFont("helvetica", "bold")
      .setFontSize(9)
      .text("Ficha de Compensação", 15, 152);

    doc.setFontSize(6).setTextColor(100, 100, 100);
    const footerText =
      "Em caso de dúvidas, de posse do comprovante, contate seu gerente ou a Central no 4004 1685 (capitais e regiões metropolitanas) ou 0800 770 1685 (demais localidades). Reclamações, informações e cancelamentos: SAC 0800 728 0728, 24 horas por dia. Fale Conosco: www.itau.com.br/empresas. Se não ficar satisfeito com a solução, contate a Ouvidoria: 0800 570 0011, em dias úteis, das 9h às 18h. Deficiente auditivo/fala: 0800 722 1722.";
    doc.text(footerText, 15, 288, { maxWidth: 180, align: "justify" });
    console.log(`[LOG ITAÚ PDF] Desenho do boleto índice ${index} concluído.`);
  });

  console.log(
    "[LOG ITAÚ PDF] Geração de todos os boletos concluída. Gerando buffer de saída..."
  );
  try {
    const outputBuffer = doc.output("arraybuffer");
    console.log(
      `[LOG ITAÚ PDF] Buffer de saída gerado, tamanho: ${outputBuffer.byteLength} bytes`
    );
    if (outputBuffer.byteLength < 100) {
      // Checagem básica se o buffer está muito pequeno
      console.error(
        "[ERRO ITAÚ PDF] Buffer gerado parece inválido (muito pequeno)."
      );
      throw new Error("Geração do PDF resultou em um arquivo inválido.");
    }
    return outputBuffer;
  } catch (outputError) {
    console.error(
      "[ERRO ITAÚ PDF] Erro ao gerar o buffer de saída do PDF:",
      outputError
    );
    throw outputError; // Re-lança o erro para ser pego pela API route
  }
}
