import { timingSafeEqual } from "node:crypto";
import { supabase } from "@/app/utils/supabaseClient";
import { validateReportSettings } from "@/app/lib/investimentosRelatorio";
import { scheduledReportPeriod } from "@/app/lib/investimentosRelatorioAgenda";
import { sendInvestmentReport } from "@/app/lib/investimentosRelatorioEnvio";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  const expected = Buffer.from(`Bearer ${secret || ""}`);
  const provided = Buffer.from(request.headers.get("Authorization") || "");
  if (!secret || provided.length !== expected.length || !timingSafeEqual(provided, expected)) return Response.json({ message: "Não autorizado." }, { status: 401 });
  const summary = { enviados: 0, parciais: 0, erros: 0, ignorados: 0 };
  try {
    const configs = [];
    const now = new Date();
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase.from("investimentos_relatorios_email").select("usuario_chave, configuracao").order("usuario_chave").range(offset, offset + 999);
      if (error) throw error;
      configs.push(...data);
      if (data.length < 1000) break;
    }
    for (const config of configs) {
      const period = scheduledReportPeriod(config.configuracao, now);
      if (!period) { summary.ignorados++; continue; }
      // Um usuário removido ou que perdeu o acesso interno deixa de gerar envios.
      const keyIsUuid = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(config.usuario_chave);
      const { data: owner, error: ownerError } = await supabase.from("users").select("roles").eq(keyIsUuid ? "id" : "username", config.usuario_chave).maybeSingle();
      if (ownerError) throw ownerError;
      if (!owner || !String(owner.roles).split(",").some((role) => ["ROLE_ADMIN", "ROLE_USER"].includes(role.trim()))) { summary.ignorados++; continue; }
      // A chave única reserva o envio antes do SMTP e impede concorrência/repetição.
      const { data: job, error: claimError } = await supabase.from("investimentos_relatorios_envios").insert({ usuario_chave: config.usuario_chave, data_referencia: period.dataReferencia }).select("id").single();
      if (claimError?.code === "23505") { summary.ignorados++; continue; }
      if (claimError) throw claimError;
      let status; let result;
      try {
        const settings = validateReportSettings({ ...config.configuracao, ...period });
        result = await sendInvestmentReport(supabase, settings);
        status = !result.enviados.length ? "erro" : result.falhas.length ? "parcial" : "enviado";
      } catch (error) {
        status = "erro";
        result = { message: error.status === 400 ? error.message : "Falha ao gerar ou enviar o relatório. Confira a configuração e reenvie manualmente." };
      }
      const { error: updateError } = await supabase.from("investimentos_relatorios_envios").update({ status, resultado: result, updated_at: new Date().toISOString() }).eq("id", job.id);
      if (updateError) throw updateError;
      summary[status === "enviado" ? "enviados" : status === "parcial" ? "parciais" : "erros"]++;
    }
    return Response.json(summary, { status: summary.erros || summary.parciais ? 207 : 200 });
  } catch { return Response.json({ message: "Falha no processamento dos relatórios agendados.", ...summary }, { status: 500 }); }
}
