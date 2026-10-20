import test from "node:test";
import assert from "node:assert/strict";
import nodemailer from "nodemailer";
import { alertDate, validateAlertSettings, groupDueDuplicates, loadDueDuplicates, duplicateAlertEmail, sendDueDuplicates } from "../src/app/lib/duplicatasAlertas.js";

const config = { ativo: true, vencemHoje: true, vencidas: true, destinatarios: ["gestor@example.com", "financeiro@example.com"] };
const row = (id, vencimento, status = "Pendente", operacaoStatus = "Aprovada") => ({ id, data_vencimento: vencimento, status_recebimento: status, nf_cte: `NF-${id}`, cliente_sacado: "Sacado", valor_bruto: 100, valor_juros: 10, operacao: { status: operacaoStatus, juros_pre_fixado: false, cliente: { nome: "Cedente" } } });
const rows = [row(1, "2026-10-20"), row(2, "2026-10-19"), row(3, "2026-10-21"), row(4, "2026-10-18", "Recebido"), row(5, "2026-10-17", "Pendente", "Reprovada")];
const db = (items) => ({ from() { return { select() { return this; }, eq() { return this; }, lte() { return this; }, order() { return this; }, range(start, end) { return Promise.resolve({ data: items.slice(start, end + 1), error: null }); } }; } });

test("valida configuração e usa a data de Brasília", () => {
  assert.equal(alertDate(new Date("2026-10-21T01:00:00Z")), "2026-10-20");
  assert.deepEqual(validateAlertSettings({ ...config, destinatarios: "A@example.com; a@example.com\nb@example.com" }).destinatarios, ["a@example.com", "b@example.com"]);
  assert.throws(() => validateAlertSettings({ ...config, destinatarios: "sem-email" }));
  assert.throws(() => validateAlertSettings({ ...config, vencemHoje: false, vencidas: false }));
});

test("separa vencimento do dia e atraso; ignora recebidas, futuras e operações não aprovadas", () => {
  const groups = groupDueDuplicates(rows, "2026-10-20", config);
  assert.deepEqual(groups.hoje.map((item) => item.id), [1]);
  assert.deepEqual(groups.vencidas.map((item) => item.id), [2]);
  assert.equal(groupDueDuplicates(rows, "2026-10-20", { ...config, vencidas: false }).vencidas.length, 0);
  assert.deepEqual(groupDueDuplicates(rows, "2026-10-21", config).vencidas.map((item) => item.id), [1, 2]);
});

test("pagina mais de mil registros; CSV completo e valor pós-fixado", async () => {
  const items = Array.from({ length: 1005 }, (_, index) => row(index + 1, "2026-10-19"));
  const groups = await loadDueDuplicates(db(items), "2026-10-20", config);
  assert.equal(groups.vencidas.length, 1005);
  const email = duplicateAlertEmail(groups, "2026-10-20");
  assert.equal(email.csv.split("\r\n").length, 1006);
  assert.ok(email.csv.includes('"110,00"'));
  assert.ok(email.html.includes("primeiros 50"));
  const unsafe = duplicateAlertEmail({ hoje: [{ ...row(1, "2026-10-20"), cliente_sacado: "<script>alert(1)</script>", nf_cte: "=1+1" }], vencidas: [] }, "2026-10-20");
  assert.ok(!unsafe.html.includes("<script>"));
  assert.ok(unsafe.csv.includes("'=1+1"));
});

test("não envia resumo vazio; envia individualmente e identifica falha parcial sem SMTP real", async () => {
  const original = nodemailer.createTransport;
  const username = process.env.EMAIL_USERNAME;
  const password = process.env.EMAIL_PASSWORD;
  const sent = [];
  try {
    process.env.EMAIL_USERNAME = "teste@example.com"; process.env.EMAIL_PASSWORD = "teste";
    nodemailer.createTransport = () => ({ async sendMail(mail) { sent.push(mail); if (mail.to === "financeiro@example.com") throw new Error("Falha simulada"); return { accepted: [mail.to] }; } });
    assert.equal((await sendDueDuplicates(db([]), config, "2026-10-20")).status, "sem_titulos");
    assert.equal(sent.length, 0);
    const result = await sendDueDuplicates(db(rows), config, "2026-10-20");
    assert.equal(result.status, "parcial");
    assert.deepEqual(result.enviados, ["gestor@example.com"]);
    assert.deepEqual(result.falhas, ["financeiro@example.com"]);
    assert.equal(sent.length, 2);
    assert.ok(sent.every((mail) => !mail.cc && !mail.bcc));
    assert.ok(sent[0].attachments[0].filename.endsWith(".csv"));
    assert.equal(sent[0].attachments[1].cid, "logoImage");
  } finally {
    nodemailer.createTransport = original;
    for (const [name, value] of [["EMAIL_USERNAME", username], ["EMAIL_PASSWORD", password]]) if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
});
