import { supabase } from "@/app/utils/supabaseClient";
import { reportUser, reportError } from "@/app/lib/investimentosRelatorioAuth";
import { validateAlertSettings } from "@/app/lib/duplicatasAlertas";

export async function GET(request) {
  try {
    const user = reportUser(request);
    const [{ data, error }, { data: last, error: lastError }] = await Promise.all([
      supabase.from("duplicatas_alertas_email").select("configuracao").eq("usuario_chave", user).maybeSingle(),
      supabase.from("duplicatas_alertas_envios").select("data_referencia,status,resultado").eq("usuario_chave", user).order("data_referencia", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (error || lastError) throw error || lastError;
    return Response.json({ configuracao: data?.configuracao || null, ultimoEnvio: last || null });
  } catch (error) { const result = reportError(error); return Response.json({ message: result.message }, { status: result.status }); }
}

export async function PUT(request) {
  try {
    const user = reportUser(request);
    const configuracao = validateAlertSettings(await request.json());
    if (configuracao.ativo && (!process.env.CRON_SECRET || !process.env.EMAIL_USERNAME || !process.env.EMAIL_PASSWORD)) return Response.json({ message: "Configure CRON_SECRET, EMAIL_USERNAME e EMAIL_PASSWORD no servidor antes de ativar." }, { status: 400 });
    const { error } = await supabase.from("duplicatas_alertas_email").upsert({ usuario_chave: user, configuracao, updated_at: new Date().toISOString() });
    if (error) throw error;
    return Response.json({ configuracao });
  } catch (error) { const result = reportError(error); return Response.json({ message: result.message }, { status: result.status }); }
}
