import nodemailer from "nodemailer";
import path from "node:path";
import { loadInvestmentReport, generateInvestmentReportPdf, validateReportSettings } from "./investimentosRelatorio.js";
import { investmentEmailTemplate } from "./investimentosEmailTemplate.js";

export async function sendInvestmentReport(db, settings) {
  settings = validateReportSettings(settings);
  if (!process.env.EMAIL_USERNAME || !process.env.EMAIL_PASSWORD) throw Object.assign(new Error("Configure EMAIL_USERNAME e EMAIL_PASSWORD no servidor antes de enviar."), { status: 400 });
  const prepared = [];
  // Valida e gera todos os relatórios antes de enviar o primeiro e-mail.
  // Uma seleção vazia nunca significa acesso a todas as aplicações.
  for (const destino of settings.destinos) {
    const scoped = { ...settings, aplicacaoIds: destino.aplicacaoIds };
    const data = await loadInvestmentReport(db, scoped);
    const pdf = generateInvestmentReportPdf(data, scoped);
    const email = investmentEmailTemplate(scoped, data);
    if (pdf.length > 20 * 1024 * 1024) throw Object.assign(new Error("O relatório excede 20 MB. Reduza o período ou a quantidade de aplicações."), { status: 400 });
    prepared.push({ to: destino.email, pdf, email });
  }
  const transporter = nodemailer.createTransport({ host: "smtp.gmail.com", port: 587, secure: false, auth: { user: process.env.EMAIL_USERNAME, pass: process.env.EMAIL_PASSWORD }, connectionTimeout: 15000, socketTimeout: 45000 });
  const results = await Promise.allSettled(prepared.map(({ to, pdf, email }) => transporter.sendMail({
    from: { name: "FIDC IJJ", address: process.env.EMAIL_USERNAME }, to, subject: settings.assunto,
    ...email,
    attachments: [
      { filename: `investimentos_${settings.dataInicio}_${settings.dataFim}.pdf`, content: pdf, contentType: "application/pdf" },
      { filename: "Logo.png", path: path.resolve(process.cwd(), "public", "Logo.png"), cid: "logoImage", contentType: "image/png", contentDisposition: "inline" },
    ],
  })));
  const enviados = settings.destinatarios.filter((_, index) => results[index].status === "fulfilled" && results[index].value.accepted?.length);
  const falhas = settings.destinatarios.filter((email) => !enviados.includes(email));
  return { message: falhas.length ? "Envio parcial ou não realizado. Confira os destinatários que falharam." : "Relatório enviado com sucesso.", enviados, falhas };
}
