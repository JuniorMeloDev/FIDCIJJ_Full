const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const date = (key) => key.split("-").reverse().join("/");
const money = (value) => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function investmentEmailTemplate(settings, data) {
  // Configurações antigas continham esse fechamento na mensagem padrão.
  const message = (settings.mensagem || "Prezados,\n\nSegue em anexo o relatório completo das aplicações, com saldos e movimentações do período.")
    .replace(/\n\s*Atenciosamente,?\s*\n\s*FIDC IJJ\s*$/i, "").trim();
  const period = `${date(settings.dataInicio)} a ${date(settings.dataFim)}`;
  const signature = "Atenciosamente,\nJunior Melo\nController\nFIDC IJJ\n(81) 9 7339-0292";
  const paragraphs = message.split(/\n\s*\n/).map((paragraph) => `<p style="margin:0 0 16px;line-height:1.7;">${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`).join("");
  const rows = [["Saldo inicial", data.resumo.saldoInicial], ["Aportes", data.resumo.aportes], ["Retiradas", data.resumo.retiradas], ["Rendimentos", data.resumo.rendimentos], ["Saldo final", data.resumo.saldoFinal]];
  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#334155;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f3f4f6;"><tr><td align="center" style="padding:28px 12px;">
<table role="presentation" width="640" cellspacing="0" cellpadding="0" style="width:100%;max-width:640px;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:12px;">
<tr><td style="padding:28px 28px 24px;background-color:#111827;border-top:4px solid #f97316;border-radius:12px 12px 0 0;">
<p style="margin:0 0 10px;font-size:12px;font-weight:bold;letter-spacing:2px;color:#fdba74;">FIDC IJJ · INVESTIMENTOS</p>
<h1 style="margin:0 0 12px;font-size:25px;line-height:1.3;color:#ffffff;">Relatório das aplicações</h1>
<p style="margin:0;font-size:14px;color:#cbd5e1;">Período: ${period}</p></td></tr>
<tr><td style="padding:28px;font-size:15px;">${paragraphs}
<table width="100%" cellspacing="0" cellpadding="0" style="margin:8px 0 24px;border:1px solid #e2e8f0;border-collapse:collapse;">
<caption style="padding:0 0 12px;text-align:left;font-size:16px;font-weight:bold;color:#0f172a;">Resumo do período</caption>
${rows.map(([label, value], index) => `<tr style="background-color:${index === 4 ? "#fff7ed" : index % 2 ? "#f8fafc" : "#ffffff"};"><th scope="row" style="padding:12px 14px;text-align:left;font-size:14px;font-weight:${index === 4 ? "bold" : "normal"};border-bottom:1px solid #e2e8f0;">${label}</th><td style="padding:12px 14px;text-align:right;white-space:nowrap;font-size:14px;font-weight:bold;color:#0f172a;border-bottom:1px solid #e2e8f0;">${money(value)}</td></tr>`).join("")}
</table>
<p style="margin:0 0 24px;padding:14px;background-color:#f8fafc;border-left:3px solid #f97316;font-size:13px;line-height:1.7;">O PDF em anexo apresenta a posição de <strong>${data.aplicacoes.length} aplicação(ões)</strong> e o extrato completo de aportes, retiradas, transferências, ajustes e rendimentos, com as origens e observações registradas.</p>
<div style="padding-top:20px;border-top:1px solid #e2e8f0;font-size:14px;line-height:1.7;">
<p style="margin:0 0 12px;">Atenciosamente,</p>
<p style="margin:0 0 20px;"><strong style="color:#0f172a;">Junior Melo</strong><br>Controller<br><strong style="color:#0f172a;">FIDC IJJ</strong><br>(81) 9 7339-0292</p>
<img src="cid:logoImage" width="140" alt="Logo FIDC IJJ" style="display:block;width:140px;max-width:100%;height:auto;border:0;">
</div></td></tr></table></td></tr></table></body></html>`;
  return { html, text: `${message}\n\nPeríodo: ${period}\n\n${rows.map(([label, value]) => `${label}: ${money(value)}`).join("\n")}\n\nO PDF em anexo inclui o extrato completo de aportes, retiradas, transferências, ajustes e rendimentos.\n\n${signature}` };
}
