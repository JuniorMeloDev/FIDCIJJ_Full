import { NextResponse } from "next/server";
import { supabase } from "@/app/utils/supabaseClient";
import { reportUser, reportError } from "@/app/lib/investimentosRelatorioAuth";
import { validateReportSettings } from "@/app/lib/investimentosRelatorio";

export async function GET(request) {
  try {
    const user = reportUser(request);
    const { data, error } = await supabase.from("investimentos_relatorios_email").select("configuracao").eq("usuario_chave", user).maybeSingle();
    if (error) throw error;
    const { data: last, error: lastError } = await supabase.from("investimentos_relatorios_envios").select("data_referencia, status, resultado, updated_at").eq("usuario_chave", user).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (lastError) throw lastError;
    return NextResponse.json({ configuracao: data?.configuracao || null, ultimoEnvio: last || null });
  } catch (error) { const result = reportError(error); return NextResponse.json({ message: result.message }, { status: result.status }); }
}

export async function PUT(request) {
  try {
    const user = reportUser(request);
    const configuracao = validateReportSettings(await request.json());
    if (configuracao.automatico.ativo && !process.env.CRON_SECRET) return NextResponse.json({ message: "Configure CRON_SECRET no servidor e publique o agendamento antes de ativar o envio automático." }, { status: 400 });
    const { error } = await supabase.from("investimentos_relatorios_email").upsert({ usuario_chave: user, configuracao, updated_at: new Date().toISOString() });
    if (error) throw error;
    return NextResponse.json({ configuracao });
  } catch (error) { const result = reportError(error); return NextResponse.json({ message: result.message }, { status: result.status }); }
}
