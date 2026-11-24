import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const formatarValor = (valor) => moeda.format(Number(valor || 0));
const formatarData = (data) => String(data || "").slice(0, 10).split("-").reverse().join("/");

export async function buscarHistoricoPorParcela(supabase, duplicataId, campos) {
  const { data, error } = await supabase.from("renegociacoes_duplicatas")
    .select(campos)
    .contains("novas_duplicata_ids", JSON.stringify([Number(duplicataId)]))
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function buscarHistoricoEncerramento(supabase, duplicata) {
  if (!duplicata?.operacao?.chave_nfe?.startsWith("ENC-")) return null;

  const historico = await buscarHistoricoPorParcela(supabase, duplicata.id, "titulos_encerramento, observacao");
  if (!historico?.titulos_encerramento?.length) throw new Error("Histórico dos títulos de origem não encontrado.");
  return historico;
}

export function gerarPdfEncerramento(duplicatas, historico, logo) {
  const doc = new jsPDF();
  doc.setProperties({ title: "Borderô de renegociação" });
  const primeira = duplicatas[0];
  const operacao = primeira.operacao;
  const cliente = operacao.cliente;
  const largura = doc.internal.pageSize.getWidth();

  if (logo) doc.addImage(logo, "PNG", 14, 12, 40, 12);
  doc.setFontSize(17);
  doc.text("BORDERÔ DE RENEGOCIAÇÃO", 14, 34);
  doc.setFontSize(10);
  doc.text(`Operação ${operacao.chave_nfe}  |  ${formatarData(primeira.data_operacao)}`, 14, 41);
  const identificacao = doc.splitTextToSize(
    `Cliente: ${cliente.nome}${cliente.cnpj ? `  |  CPF/CNPJ: ${cliente.cnpj}` : ""}`,
    largura - 28,
  );
  doc.text(identificacao, 14, 47);

  const estilos = {
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 2.2, overflow: "linebreak" },
    headStyles: { fillColor: [31, 41, 55] },
    rowPageBreak: "avoid",
  };

  autoTable(doc, {
    ...estilos,
    startY: 50 + identificacao.length * 4,
    head: [["Título original", "Sacado original", "Vencimento", "Principal"]],
    body: historico.titulos_encerramento.map((titulo) => [
      titulo.nf_cte,
      titulo.sacado,
      formatarData(titulo.data_vencimento),
      formatarValor(titulo.principal),
    ]),
    columnStyles: { 0: { cellWidth: 46 }, 2: { cellWidth: 25 }, 3: { cellWidth: 34, halign: "right" } },
  });

  const parcelas = [...duplicatas].sort((a, b) => Number(a.id) - Number(b.id));
  autoTable(doc, {
    ...estilos,
    startY: doc.lastAutoTable.finalY + 8,
    head: [["Parcela", "Vencimento", "Principal", "Juros", "Total"]],
    body: parcelas.map((parcela) => [
      parcela.nf_cte,
      formatarData(parcela.data_vencimento),
      formatarValor(Number(parcela.valor_bruto) - Number(parcela.valor_juros)),
      formatarValor(parcela.valor_juros),
      formatarValor(parcela.valor_bruto),
    ]),
    foot: [["Total da operação", "", formatarValor(operacao.valor_liquido),
      formatarValor(operacao.valor_total_juros), formatarValor(operacao.valor_total_bruto)]],
    showFoot: "lastPage",
    footStyles: { fillColor: [31, 41, 55] },
    columnStyles: { 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } },
  });

  if (historico.observacao) {
    autoTable(doc, {
      ...estilos,
      startY: doc.lastAutoTable.finalY + 7,
      head: [["Observação"]],
      body: [[historico.observacao]],
    });
  }

  const paginas = doc.getNumberOfPages();
  for (let pagina = 1; pagina <= paginas; pagina += 1) {
    doc.setPage(pagina);
    doc.setFontSize(8);
    doc.setTextColor(90);
    doc.text(`${operacao.chave_nfe}  |  ${pagina} / ${paginas}`, largura - 14, 287, { align: "right" });
  }

  return Buffer.from(doc.output("arraybuffer"));
}
