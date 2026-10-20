import nodemailer from "nodemailer";
import path from "node:path";
import { valorLiquidacaoDuplicata } from "../utils/valorLiquidacaoDuplicata.js";

export function validateAlertSettings(input) {
  const fail = (message) => { throw Object.assign(new Error(message), { status: 400 }); };
  if (!input || typeof input.ativo !== "boolean" || typeof input.vencemHoje !== "boolean" || typeof input.vencidas !== "boolean") fail("Configuração inválida.");
  const raw = typeof input.destinatarios === "string" ? input.destinatarios.split(/[,;\n]+/) : input.destinatarios;
  if (!Array.isArray(raw) || raw.some((email) => typeof email !== "string")) fail("Informe os destinatários.");
  const destinatarios = [...new Set(raw.map((email) => email.trim().toLowerCase()).filter(Boolean))];
  if (!destinatarios.length || destinatarios.length > 20 || destinatarios.some((email) => email.length > 254 || !/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(email))) fail("Informe de 1 a 20 e-mails válidos.");
  if (input.ativo && !input.vencemHoje && !input.vencidas) fail("Selecione ao menos um tipo de alerta.");
  return { ativo: input.ativo, vencemHoje: input.vencemHoje, vencidas: input.vencidas, destinatarios };
}

export function alertDate(now = new Date()) {
  return now.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

export function groupDueDuplicates(rows, today, settings) {
  const pendentes = rows.filter((row) => row.status_recebimento === "Pendente" && row.operacao?.status === "Aprovada" && row.data_vencimento && row.data_vencimento <= today);
  return {
    hoje: settings.vencemHoje ? pendentes.filter((row) => row.data_vencimento === today) : [],
    vencidas: settings.vencidas ? pendentes.filter((row) => row.data_vencimento < today) : [],
  };
}

export async function loadDueDuplicates(db, today, settings) {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.from("duplicatas").select("id,nf_cte,data_vencimento,valor_bruto,valor_juros,cliente_sacado,status_recebimento,operacao:operacoes!inner(status,juros_pre_fixado,valor_total_bruto,valor_liquido,valor_total_juros,valor_total_descontos,cliente:clientes(nome),tipo_operacao:tipos_operacao(juros_pre_fixado))")
      .eq("status_recebimento", "Pendente").eq("operacao.status", "Aprovada").lte("data_vencimento", today).order("data_vencimento").order("id").range(offset, offset + 999);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return groupDueDuplicates(rows, today, settings);
}

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const date = (key) => key.split("-").reverse().join("/");
const money = (value) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const total = (rows) => rows.reduce((sum, row) => sum + valorLiquidacaoDuplicata(row), 0);
const atraso = (row, today) => Math.max(0, Math.round((Date.parse(today) - Date.parse(row.data_vencimento)) / 86400000));

export function duplicateAlertEmail(groups, today) {
  const section = (title, rows) => `<h2 style="font-size:18px;color:#0f172a;margin:26px 0 12px;">${title}</h2><p>${rows.length} título(s) | Total: <strong>${money(total(rows))}</strong></p>${rows.length ? `<table width="100%" cellpadding="8" cellspacing="0" style="border-collapse:collapse;font-size:12px;"><tr style="background:#e2e8f0;text-align:left;"><th>NF/CT-e</th><th>Cedente / Sacado</th><th>Vencimento</th><th>Atraso</th><th>Valor</th></tr>${rows.slice(0, 50).map((row) => `<tr><td style="border-bottom:1px solid #e2e8f0;">${escape(row.nf_cte)}</td><td style="border-bottom:1px solid #e2e8f0;">${escape(row.operacao?.cliente?.nome)}<br>${escape(row.cliente_sacado)}</td><td style="border-bottom:1px solid #e2e8f0;">${date(row.data_vencimento)}</td><td style="border-bottom:1px solid #e2e8f0;">${atraso(row, today)} dia(s)</td><td style="border-bottom:1px solid #e2e8f0;">${money(valorLiquidacaoDuplicata(row))}</td></tr>`).join("")}</table>${rows.length > 50 ? "<p>Exibindo os primeiros 50 títulos. A lista completa está no CSV anexo.</p>" : ""}` : "<p>Nenhum título neste grupo.</p>"}`;
  const html = `<html lang="pt-BR"><body style="margin:0;background:#f3f4f6;font-family:Arial,sans-serif;color:#334155;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:24px 10px;"><table role="presentation" width="720" style="width:100%;max-width:720px;background:#fff;border:1px solid #e2e8f0;border-radius:12px;" cellspacing="0" cellpadding="0"><tr><td style="padding:26px;background:#111827;border-top:4px solid #f97316;"><p style="color:#fdba74;font-size:12px;letter-spacing:2px;">FIDC IJJ · DUPLICATAS</p><h1 style="color:#fff;font-size:24px;">Resumo diário de vencimentos</h1><p style="color:#cbd5e1;">Posição em ${date(today)}, horário de Brasília</p></td></tr><tr><td style="padding:26px;"><p>Prezados,</p><p>Segue o acompanhamento das duplicatas pendentes na data de hoje.</p>${section("Vencem hoje", groups.hoje)}${section("Vencidas", groups.vencidas)}<p style="font-size:12px;color:#64748b;margin-top:24px;">Valores dos títulos, incluindo juros da operação quando pós-fixada. Não incluem atualização de multa ou juros de mora. Pagamentos registrados após a geração serão refletidos no próximo resumo.</p><div style="border-top:1px solid #e2e8f0;margin-top:24px;padding-top:20px;line-height:1.7;"><p>Atenciosamente,</p><p><strong>Junior Melo</strong><br>Analista Financeiro<br><strong>FIDC IJJ</strong><br>(81) 9 7339-0292</p><img src="cid:logoImage" width="140" alt="Logo FIDC IJJ"></div></td></tr></table></td></tr></table></body></html>`;
  const csvCell = (value) => `"${String(value ?? "").replace(/^[=+@\-\t\r]/, "'$&").replace(/"/g, '""')}"`;
  const rows = [["Situação", "NF/CT-e", "Cedente", "Sacado", "Vencimento", "Dias de atraso", "Valor"]];
  for (const [title, items] of [["Vence hoje", groups.hoje], ["Vencida", groups.vencidas]]) for (const row of items) rows.push([title, row.nf_cte, row.operacao?.cliente?.nome, row.cliente_sacado, date(row.data_vencimento), atraso(row, today), valorLiquidacaoDuplicata(row).toFixed(2).replace(".", ",")]);
  return { html, text: `Resumo de duplicatas - ${date(today)}\nVencem hoje: ${groups.hoje.length} | ${money(total(groups.hoje))}\nVencidas: ${groups.vencidas.length} | ${money(total(groups.vencidas))}\nConsulte a relação completa no CSV anexo.\n\nAtenciosamente,\nJunior Melo\nAnalista Financeiro\nFIDC IJJ\n(81) 9 7339-0292`, csv: "\uFEFF" + rows.map((row) => row.map(csvCell).join(";")).join("\r\n") };
}

export async function sendDueDuplicates(db, settings, today = alertDate()) {
  const groups = await loadDueDuplicates(db, today, settings);
  if (!groups.hoje.length && !groups.vencidas.length) return { status: "sem_titulos", enviados: [], falhas: [], message: "Nenhuma duplicata pendente nos grupos selecionados." };
  if (!process.env.EMAIL_USERNAME || !process.env.EMAIL_PASSWORD) throw new Error("SMTP não configurado");
  const email = duplicateAlertEmail(groups, today);
  const transporter = nodemailer.createTransport({ host: "smtp.gmail.com", port: 587, secure: false, auth: { user: process.env.EMAIL_USERNAME, pass: process.env.EMAIL_PASSWORD }, connectionTimeout: 15000, socketTimeout: 45000 });
  const results = await Promise.allSettled(settings.destinatarios.map((to) => transporter.sendMail({ from: { name: "FIDC IJJ", address: process.env.EMAIL_USERNAME }, to, subject: `Duplicatas: vencimentos e atrasos - ${date(today)}`, html: email.html, text: email.text, attachments: [{ filename: `duplicatas_${today}.csv`, content: Buffer.from(email.csv, "utf8"), contentType: "text/csv; charset=utf-8" }, { filename: "Logo.png", path: path.join(process.cwd(), "public", "Logo.png"), cid: "logoImage", contentDisposition: "inline" }] })));
  const enviados = settings.destinatarios.filter((_, i) => results[i].status === "fulfilled" && results[i].value.accepted?.length);
  const falhas = settings.destinatarios.filter((email) => !enviados.includes(email));
  return { status: !enviados.length ? "erro" : falhas.length ? "parcial" : "enviado", enviados, falhas, message: falhas.length ? "Confira os destinatários com falha antes de reenviar." : "Resumo enviado com sucesso." };
}
