import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildInvestmentDashboard, roundMoney } from "./investimentos.js";

export function validateReportSettings(input) {
  const fail = (message) => { throw Object.assign(new Error(message), { status: 400 }); };
  if (!input || typeof input !== "object") fail("Configuração inválida.");
  const rawDestinos = input.destinos ?? (Array.isArray(input.destinatarios) || typeof input.destinatarios === "string"
    ? (typeof input.destinatarios === "string" ? input.destinatarios.split(/[,;\n]+/) : input.destinatarios).filter((email) => String(email).trim()).map((email) => ({ email, aplicacaoIds: input.aplicacaoIds })) : null);
  if (!Array.isArray(rawDestinos) || !rawDestinos.length || rawDestinos.length > 20) fail("Configure de 1 a 20 destinatários com suas aplicações.");
  const destinos = rawDestinos.map((destino) => {
    if (!destino || typeof destino.email !== "string") fail("Informe um e-mail válido para cada destinatário.");
    const email = destino.email.trim().toLowerCase();
    if (email.length > 254 || !/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(email)) fail("Informe um e-mail válido para cada destinatário.");
    if (!Array.isArray(destino.aplicacaoIds) || !destino.aplicacaoIds.length || destino.aplicacaoIds.length > 100 || destino.aplicacaoIds.some((id) => !Number.isSafeInteger(Number(id)) || Number(id) <= 0)) fail(`Selecione ao menos uma aplicação para ${email}.`);
    return { email, aplicacaoIds: [...new Set(destino.aplicacaoIds.map(Number))] };
  });
  if (new Set(destinos.map((destino) => destino.email)).size !== destinos.length) fail("Cada e-mail deve aparecer uma única vez. Selecione suas aplicações no mesmo destinatário.");
  const destinatarios = destinos.map((destino) => destino.email);
  const validDate = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
  if (!validDate(input.dataInicio) || !validDate(input.dataFim) || input.dataInicio > input.dataFim) fail("Informe um período válido, com início anterior ou igual ao fim.");
  if ((Date.parse(input.dataFim) - Date.parse(input.dataInicio)) / 86400000 > 366) fail("Selecione um período de até 366 dias.");
  const assunto = typeof input.assunto === "string" ? input.assunto.trim() : "";
  const mensagem = typeof input.mensagem === "string" ? input.mensagem.trim() : "";
  if (!assunto || assunto.length > 160 || /[\r\n]/.test(assunto)) fail("Informe um assunto de até 160 caracteres, sem quebras de linha.");
  if (mensagem.length > 5000) fail("A mensagem deve ter até 5.000 caracteres.");
  const automatico = input.automatico || { ativo: false, frequencia: "mensal", diaSemana: 1, diaMes: 1 };
  if (typeof automatico.ativo !== "boolean" || !["diario", "semanal", "mensal"].includes(automatico.frequencia) || !Number.isInteger(automatico.diaSemana) || automatico.diaSemana < 0 || automatico.diaSemana > 6 || !Number.isInteger(automatico.diaMes) || automatico.diaMes < 1 || automatico.diaMes > 28) fail("Informe uma frequência e um dia válidos para o envio automático.");
  return { destinatarios, dataInicio: input.dataInicio, dataFim: input.dataFim, destinos, assunto, mensagem, automatico: { ativo: automatico.ativo, frequencia: automatico.frequencia, diaSemana: automatico.diaSemana, diaMes: automatico.diaMes } };
}

// Pagina o histórico para não truncar o relatório no limite padrão do Supabase.
export async function loadInvestmentReport(db, settings) {
  if (!Array.isArray(settings.aplicacaoIds) || !settings.aplicacaoIds.length) throw Object.assign(new Error("Selecione ao menos uma aplicação para gerar o relatório."), { status: 400 });
  const readAll = async (table) => {
    const rows = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await db.from(table).select("*").order("id").range(offset, offset + 999);
      if (error) throw error;
      rows.push(...data);
      if (data.length < 1000) return rows;
    }
  };
  const [contas, allAplicacoes] = await Promise.all([readAll("investimentos_contas"), readAll("investimentos_aplicacoes")]);
  const aplicacoes = allAplicacoes.filter((app) => settings.aplicacaoIds.includes(app.id));
  if (settings.aplicacaoIds.some((id) => !aplicacoes.some((app) => app.id === id))) throw Object.assign(new Error("Uma das aplicações selecionadas não existe mais. Atualize a configuração."), { status: 400 });
  if (!aplicacoes.length) throw Object.assign(new Error("Nenhuma aplicação disponível para o relatório."), { status: 400 });
  const ids = aplicacoes.map((app) => app.id);
  const movimentacoes = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.from("investimentos_movimentacoes").select("*").in("aplicacao_id", ids).lte("data_movimento", settings.dataFim).order("data_movimento").order("id").range(offset, offset + 999);
    if (error) throw error;
    movimentacoes.push(...data);
    if (data.length < 1000) break;
  }
  return summarizeInvestmentReport(buildInvestmentDashboard({ contas, aplicacoes, movimentacoes, dataInicio: settings.dataInicio, dataFim: settings.dataFim }));
}

export function summarizeInvestmentReport(dashboard) {
  const rows = [...dashboard.movimentacoes].sort((a, b) => a.data_movimento.localeCompare(b.data_movimento) || String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
  const sum = (items, predicate) => roundMoney(items.filter(predicate).reduce((total, item) => total + Number(item.valor), 0));
  const totals = (items, saldoFinal) => ({
    saldoInicial: roundMoney(saldoFinal - sum(items, () => true)), saldoFinal: roundMoney(saldoFinal),
    aportes: sum(items, (m) => m.tipo === "aporte" && m.origem !== "transferencia"),
    retiradas: Math.abs(sum(items, (m) => m.tipo === "resgate" && m.origem !== "transferencia")),
    rendimentos: sum(items, (m) => ["rentabilidade_diaria", "rendimento_manual"].includes(m.tipo)),
    transferenciasEntrada: sum(items, (m) => m.origem === "transferencia" && Number(m.valor) > 0),
    transferenciasSaida: Math.abs(sum(items, (m) => m.origem === "transferencia" && Number(m.valor) < 0)),
    ajustes: sum(items, (m) => m.tipo === "ajuste"),
  });
  return { ...dashboard, movimentacoes: rows, resumo: totals(rows, dashboard.cards.saldoDisponivel), aplicacoes: dashboard.aplicacoes.map((app) => ({ ...app, resumo: totals(rows.filter((m) => m.aplicacao_id === app.id), app.saldoAtual) })) };
}

const money = (value) => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const date = (key) => key.split("-").reverse().join("/");
const types = { aporte: "Aporte", resgate: "Retirada", ajuste: "Ajuste", rendimento_manual: "Rendimento manual", rentabilidade_diaria: "Rendimento diário" };

export function generateInvestmentReportPdf(data, settings) {
  const doc = new jsPDF({ orientation: "landscape", format: "a4" });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const logo = new Uint8Array(readFileSync(path.join(process.cwd(), "public", "Logo.png")));
  const generatedAt = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const table = { margin: { left: 14, right: 14, top: 44, bottom: 16 }, styles: { fontSize: 8, cellPadding: 3, overflow: "linebreak" }, headStyles: { fillColor: [226, 232, 240], textColor: [51, 65, 85] }, alternateRowStyles: { fillColor: [248, 250, 252] } };
  autoTable(doc, { ...table, startY: 44, head: [["Saldo inicial", "Aportes", "Retiradas", "Rendimentos", "Saldo final"]], body: [[data.resumo.saldoInicial, data.resumo.aportes, data.resumo.retiradas, data.resumo.rendimentos, data.resumo.saldoFinal].map(money)], styles: { ...table.styles, fontSize: 11 } });
  autoTable(doc, { ...table, startY: doc.lastAutoTable.finalY + 8, head: [["Transferências recebidas", "Transferências enviadas", "Ajustes"]], body: [[data.resumo.transferenciasEntrada, data.resumo.transferenciasSaida, data.resumo.ajustes].map(money)] });
  doc.setFontSize(13); doc.text("Posição por aplicação", 14, doc.lastAutoTable.finalY + 13);
  autoTable(doc, { ...table, startY: doc.lastAutoTable.finalY + 18, head: [["Aplicação / conta", "Saldo inicial", "Aportes", "Retiradas", "Rendimentos", "Saldo final"]], body: data.aplicacoes.map((app) => [`${app.nome}\n${app.contaLabel}`, ...[app.resumo.saldoInicial, app.resumo.aportes, app.resumo.retiradas, app.resumo.rendimentos, app.resumo.saldoFinal].map(money)]), columnStyles: { 0: { cellWidth: 79 } } });
  doc.addPage();
  doc.setFontSize(14); doc.setTextColor(15, 23, 42); doc.text("Extrato completo de movimentações", 14, 48);
  autoTable(doc, { ...table, startY: 54, head: [["Data", "Aplicação / conta", "Tipo", "Descrição / observação", "Origem", "Valor"]], body: data.movimentacoes.length ? data.movimentacoes.map((m) => [date(m.data_movimento), `${m.aplicacao_nome}\n${m.conta_nome}`, m.origem === "transferencia" ? "Transferência" : types[m.tipo] || m.tipo, [m.descricao, readableObservation(m.observacao)].filter(Boolean).join("\n"), m.conta_origem_nome || ({ calculada: "Calculada", fluxo_caixa: "Fluxo de caixa", transferencia: "Entre aplicações", manual: "Manual" }[m.origem] || m.origem), money(m.valor)]) : [["-", "-", "-", "Nenhuma movimentação no período.", "-", "-"]], columnStyles: { 0: { cellWidth: 23 }, 1: { cellWidth: 54 }, 2: { cellWidth: 31 }, 3: { cellWidth: 82 }, 4: { cellWidth: 48 }, 5: { cellWidth: 31, halign: "right" } } });
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.addImage(logo, "PNG", 14, 10, 40, 40 / 2.3, "fidc-logo");
    doc.setTextColor(15, 23, 42); doc.setFontSize(18);
    doc.text("Relatório de Investimentos", width - 14, 22, { align: "right" });
    doc.setFontSize(8); doc.setTextColor(100, 116, 139);
    doc.text(`Gerado em ${generatedAt}`, width - 14, 28, { align: "right" });
    doc.text(`Período: ${date(settings.dataInicio)} a ${date(settings.dataFim)} | ${data.aplicacoes.length} aplicação(ões)`, 14, 36);
    doc.text("Rendimentos calculados de segunda a sexta; feriados não descontados.", 14, height - 9);
    doc.text(`Página ${page} de ${pages}`, width - 14, height - 9, { align: "right" });
  }
  return Buffer.from(doc.output("arraybuffer"));
}

function readableObservation(value) {
  if (!value) return "";
  try { const parsed = JSON.parse(value); return typeof parsed.observacao === "string" ? parsed.observacao : ""; } catch { return String(value); }
}
