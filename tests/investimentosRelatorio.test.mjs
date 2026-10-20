import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { validateReportSettings, summarizeInvestmentReport, loadInvestmentReport, generateInvestmentReportPdf } from "../src/app/lib/investimentosRelatorio.js";
import { buildInvestmentDashboard } from "../src/app/lib/investimentos.js";
import { scheduledReportPeriod } from "../src/app/lib/investimentosRelatorioAgenda.js";
import { sendInvestmentReport } from "../src/app/lib/investimentosRelatorioEnvio.js";
import { reportUser } from "../src/app/lib/investimentosRelatorioAuth.js";
import nodemailer from "nodemailer";
import { investmentEmailTemplate } from "../src/app/lib/investimentosEmailTemplate.js";
import jwt from "jsonwebtoken";

const settings = { destinatarios: "gestor@example.com; financeiro@example.com", assunto: "Relatório de aplicações", mensagem: "Segue o relatório.", dataInicio: "2026-10-01", dataFim: "2026-10-20", aplicacaoIds: [1, 2] };
const contas = [{ id: 1, nome: "Investimentos", banco: "Banco exemplo", agencia: "0001", conta: "12345-6" }];
const aplicacoes = [1, 2].map((id) => ({ id, nome: `Aplicação ${id}`, conta_id: 1, rende_juros: false, ativa: true }));
const mov = (id, data, valor, tipo, app = 1, origem = "manual") => ({ id, data_movimento: data, valor, tipo, aplicacao_id: app, conta_id: 1, origem, descricao: `Movimentação ${id}`, conta_origem_nome: tipo === "aporte" ? "Conta de origem" : null });
const movimentos = [mov(1, "2026-09-30", 1000, "aporte"), mov(2, "2026-10-01", 500, "aporte"), mov(3, "2026-10-02", -100, "resgate"), mov(4, "2026-10-03", 10, "rendimento_manual"), mov(5, "2026-10-05", -50, "resgate", 1, "transferencia"), mov(6, "2026-10-05", 50, "aporte", 2, "transferencia"), mov(7, "2026-10-06", -5, "ajuste")];
const dashboard = (rows = movimentos) => summarizeInvestmentReport(buildInvestmentDashboard({ contas, aplicacoes, movimentacoes: rows, dataInicio: settings.dataInicio, dataFim: settings.dataFim }));

test("valida destinatários, datas reais, assunto e limites", () => {
  assert.deepEqual(validateReportSettings({ ...settings, destinatarios: "A@example.com; b@example.com" }).destinatarios, ["a@example.com", "b@example.com"]);
  for (const change of [{ destinatarios: "inválido" }, { destinatarios: "a@example.com\r\nBcc: vítima@example.com" }, { dataInicio: "2026-02-30" }, { dataInicio: "2026-11-01" }, { dataInicio: "2020-01-01" }, { assunto: "Assunto\nBcc: outro" }, { aplicacaoIds: [-1] }, { automatico: { ativo: true, frequencia: "mensal", diaSemana: 1, diaMes: 31 } }]) assert.throws(() => validateReportSettings({ ...settings, ...change }));
  assert.throws(() => validateReportSettings({ ...settings, destinatarios: "" }));
  assert.throws(() => validateReportSettings({ ...settings, aplicacaoIds: [] }));
  assert.throws(() => validateReportSettings({ ...settings, destinatarios: "a@example.com; A@example.com" }));
});

test("saldo inicial usa histórico e transferências não contam como aportes ou retiradas", () => {
  const data = dashboard();
  assert.deepEqual(data.resumo, { saldoInicial: 1000, saldoFinal: 1405, aportes: 500, retiradas: 100, rendimentos: 10, transferenciasEntrada: 50, transferenciasSaida: 50, ajustes: -5 });
  assert.equal(data.aplicacoes[0].resumo.saldoFinal, 1355);
  assert.equal(data.aplicacoes[1].resumo.saldoFinal, 50);
  assert.equal(data.movimentacoes.length, 6);
});

test("agenda considera Brasília, frequência, virada de ano e mês bissexto", () => {
  const config = (frequencia, extra = {}) => ({ automatico: { ativo: true, frequencia, diaSemana: 1, diaMes: 1, ...extra } });
  assert.equal(scheduledReportPeriod({ automatico: { ativo: false } }), null);
  assert.deepEqual(scheduledReportPeriod(config("diario"), new Date("2026-10-20T01:00:00Z")), { dataReferencia: "2026-10-19", dataInicio: "2026-10-18", dataFim: "2026-10-18" });
  assert.equal(scheduledReportPeriod(config("semanal"), new Date("2026-10-20T11:00:00Z")), null);
  assert.deepEqual(scheduledReportPeriod(config("semanal"), new Date("2026-10-19T11:00:00Z")), { dataReferencia: "2026-10-19", dataInicio: "2026-10-12", dataFim: "2026-10-18" });
  assert.deepEqual(scheduledReportPeriod(config("mensal"), new Date("2027-01-01T11:00:00Z")), { dataReferencia: "2027-01-01", dataInicio: "2026-12-01", dataFim: "2026-12-31" });
  assert.deepEqual(scheduledReportPeriod(config("mensal"), new Date("2028-03-01T11:00:00Z")), { dataReferencia: "2028-03-01", dataInicio: "2028-02-01", dataFim: "2028-02-29" });
});

function fakeDb(tables) {
  return { from(name) {
    let rows = [...tables[name]];
    return { select() { return this; }, order() { return this; }, in(column, ids) { rows = rows.filter((row) => ids.includes(row[column])); return this; }, lte(column, value) { rows = rows.filter((row) => row[column] <= value); return this; }, range(start, end) { return Promise.resolve({ data: rows.slice(start, end + 1), error: null }); } };
  } };
}

test("carrega mais de mil movimentos e recusa aplicação inexistente", async () => {
  const db = fakeDb({ investimentos_contas: contas, investimentos_aplicacoes: aplicacoes, investimentos_movimentacoes: Array.from({ length: 1005 }, (_, index) => mov(index + 1, "2026-10-01", 1, "aporte")) });
  const result = await loadInvestmentReport(db, { ...validateReportSettings(settings), aplicacaoIds: [1, 2] });
  assert.equal(result.movimentacoes.length, 1005);
  assert.equal(result.resumo.saldoFinal, 1005);
  await assert.rejects(loadInvestmentReport(db, { ...settings, aplicacaoIds: [999] }));
});

test("gera PDF completo com várias páginas e movimentações extensas", () => {
  const rows = [...movimentos, ...Array.from({ length: 110 }, (_, index) => ({ ...mov(index + 10, "2026-10-10", 1, "aporte"), descricao: "Aporte com descrição extensa para verificar a quebra de linhas no relatório completo", observacao: "Observação detalhada com acentuação: aplicação, conciliação e informações da origem." }))];
  const pdf = generateInvestmentReportPdf(dashboard(rows), validateReportSettings(settings));
  assert.ok(pdf.subarray(0, 8).toString().startsWith("%PDF-"));
  assert.ok(pdf.length > 10000);
  if (process.env.REPORT_PREVIEW_PATH) fs.writeFileSync(process.env.REPORT_PREVIEW_PATH, pdf);
});

test("envio usa PDF gerado no servidor, separa destinatários e informa falha parcial sem SMTP real", async () => {
  const originalTransport = nodemailer.createTransport;
  const originalUsername = process.env.EMAIL_USERNAME;
  const originalPassword = process.env.EMAIL_PASSWORD;
  const sent = [];
  try {
    process.env.EMAIL_USERNAME = "remetente@example.com";
    process.env.EMAIL_PASSWORD = "senha-apenas-para-teste";
    nodemailer.createTransport = () => ({ async sendMail(mail) { sent.push(mail); if (mail.to === "financeiro@example.com") throw new Error("Falha simulada"); return { accepted: [mail.to] }; } });
    const result = await sendInvestmentReport(fakeDb({ investimentos_contas: contas, investimentos_aplicacoes: aplicacoes, investimentos_movimentacoes: movimentos }), validateReportSettings(settings));
    assert.deepEqual(result.enviados, ["gestor@example.com"]);
    assert.deepEqual(result.falhas, ["financeiro@example.com"]);
    assert.equal(sent.length, 2);
    assert.ok(sent.every((mail) => !mail.cc && !mail.bcc && typeof mail.to === "string"));
    assert.ok(sent[0].attachments[0].content.subarray(0, 8).toString().startsWith("%PDF-"));
    assert.ok(sent[0].text.includes("01/10/2026"));
    assert.ok(sent[0].html.includes('src="cid:logoImage"'));
    assert.equal(sent[0].attachments[1].cid, "logoImage");
    assert.equal(sent[0].attachments[1].contentDisposition, "inline");
  } finally {
    nodemailer.createTransport = originalTransport;
    for (const [name, value] of [["EMAIL_USERNAME", originalUsername], ["EMAIL_PASSWORD", originalPassword]]) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  }
});

test("relatórios recusam sessão ausente e perfil de cliente", () => {
  const original = process.env.JWT_SECRET;
  try {
    process.env.JWT_SECRET = "segredo-exclusivo-de-teste";
    const request = (roles) => new Request("http://localhost", { headers: { Authorization: `Bearer ${jwt.sign({ user_id: "usuario-teste", roles }, process.env.JWT_SECRET)}` } });
    assert.throws(() => reportUser(new Request("http://localhost")), (error) => error.status === 401);
    assert.throws(() => reportUser(request(["ROLE_CLIENTE"])), (error) => error.status === 403);
    assert.equal(reportUser(request(["ROLE_USER"])), "usuario-teste");
  } finally { if (original === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = original; }
});

test("e-mail formata o período, escapa a mensagem e mantém uma assinatura com logo no final", () => {
  const email = investmentEmailTemplate({ ...settings, mensagem: "Prezados,\n\nTexto <script>alert(1)</script> & detalhes.\n\nAtenciosamente,\nFIDC IJJ" }, dashboard());
  assert.ok(email.html.includes("01/10/2026 a 20/10/2026"));
  assert.ok(email.html.includes("&lt;script&gt;"));
  assert.ok(!email.html.includes("<script>"));
  assert.equal((email.html.match(/Atenciosamente,/g) || []).length, 1);
  assert.equal((email.html.match(/cid:logoImage/g) || []).length, 1);
  assert.ok(email.html.indexOf('src="cid:logoImage"') > email.html.indexOf("Junior Melo"));
  assert.ok(email.text.includes("Junior Melo"));
});

test("cada e-mail recebe somente suas aplicações no PDF e no resumo, inclusive em envio automático", async () => {
  const originalTransport = nodemailer.createTransport;
  const originalUsername = process.env.EMAIL_USERNAME;
  const originalPassword = process.env.EMAIL_PASSWORD;
  const sent = [];
  try {
    process.env.EMAIL_USERNAME = "remetente@example.com";
    process.env.EMAIL_PASSWORD = "teste";
    nodemailer.createTransport = () => ({ async sendMail(mail) { sent.push(mail); return { accepted: [mail.to] }; } });
    const config = validateReportSettings({ ...settings, destinos: [{ email: "cliente-a@example.com", aplicacaoIds: [1] }, { email: "cliente-b@example.com", aplicacaoIds: [2] }], automatico: { ativo: true, frequencia: "mensal", diaSemana: 1, diaMes: 1 } });
    const tables = { investimentos_contas: contas, investimentos_aplicacoes: aplicacoes.map((app) => ({ ...app, nome: app.id === 1 ? "CLIENTE_A" : "CLIENTE_B" })), investimentos_movimentacoes: movimentos };
    const result = await sendInvestmentReport(fakeDb(tables), config);
    assert.equal(result.enviados.length, 2);
    const a = sent.find((mail) => mail.to === "cliente-a@example.com");
    const b = sent.find((mail) => mail.to === "cliente-b@example.com");
    assert.ok(a.attachments[0].content.toString("latin1").includes("CLIENTE_A"));
    assert.ok(!a.attachments[0].content.toString("latin1").includes("CLIENTE_B"));
    assert.ok(b.attachments[0].content.toString("latin1").includes("CLIENTE_B"));
    assert.ok(!b.attachments[0].content.toString("latin1").includes("CLIENTE_A"));
    assert.ok(a.text.includes("1.355,00"));
    assert.ok(b.text.includes("50,00"));
    assert.ok(!b.text.includes("1.355,00"));
    sent.length = 0;
    await assert.rejects(sendInvestmentReport(fakeDb(tables), { ...config, destinos: [{ email: "cliente-a@example.com", aplicacaoIds: [1] }, { email: "cliente-b@example.com", aplicacaoIds: [] }] }));
    assert.equal(sent.length, 0);
    await assert.rejects(sendInvestmentReport(fakeDb(tables), { ...config, destinos: [{ email: "cliente-a@example.com", aplicacaoIds: [1] }, { email: "cliente-b@example.com", aplicacaoIds: [999] }] }));
    assert.equal(sent.length, 0);
  } finally {
    nodemailer.createTransport = originalTransport;
    for (const [name, value] of [["EMAIL_USERNAME", originalUsername], ["EMAIL_PASSWORD", originalPassword]]) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  }
});
