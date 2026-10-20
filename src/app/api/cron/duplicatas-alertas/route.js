import { timingSafeEqual } from "node:crypto";
import { supabase } from "@/app/utils/supabaseClient";
import { alertDate, validateAlertSettings, sendDueDuplicates } from "@/app/lib/duplicatasAlertas";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  const expected = Buffer.from(`Bearer ${secret || ""}`);
  const provided = Buffer.from(request.headers.get("Authorization") || "");
  if (!secret || provided.length !== expected.length || !timingSafeEqual(provided, expected)) return Response.json({ message: "Não autorizado." }, { status: 401 });
  const summary = { enviados: 0, erros: 0, ignorados: 0 };
  try {
    const today = alertDate();
    const configs = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase.from("duplicatas_alertas_email").select("usuario_chave,configuracao").order("usuario_chave").range(offset, offset + 999);
      if (error) throw error;
      configs.push(...data);
      if (data.length < 1000) break;
    }
    for (const config of configs) {
      if (!config.configuracao.ativo) { summary.ignorados++; continue; }
      const isUuid = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(config.usuario_chave);
      const { data: owner, error: ownerError } = await supabase.from("users").select("roles").eq(isUuid ? "id" : "username", config.usuario_chave).maybeSingle();
      if (ownerError) throw ownerError;
      if (!owner || !String(owner.roles).split(",").some((role) => ["ROLE_ADMIN", "ROLE_USER"].includes(role.trim()))) { summary.ignorados++; continue; }
      const { data: job, error } = await supabase.from("duplicatas_alertas_envios").insert({ usuario_chave: config.usuario_chave, data_referencia: today }).select("id").single();
      if (error?.code === "23505") { summary.ignorados++; continue; }
      if (error) throw error;
      let result;
      try { result = await sendDueDuplicates(supabase, validateAlertSettings(config.configuracao), today); }
      catch { result = { status: "erro", message: "Não foi possível gerar ou enviar o resumo. Confira a configuração de e-mail." }; }
      const { error: saveError } = await supabase.from("duplicatas_alertas_envios").update({ status: result.status, resultado: result, updated_at: new Date().toISOString() }).eq("id", job.id);
      if (saveError) throw saveError;
      if (["erro", "parcial"].includes(result.status)) summary.erros++;
      else if (result.status === "sem_titulos") summary.ignorados++;
      else summary.enviados++;
    }
    return Response.json(summary, { status: summary.erros ? 207 : 200 });
  } catch { return Response.json({ message: "Falha no processamento dos alertas de duplicatas.", ...summary }, { status: 500 }); }
}
