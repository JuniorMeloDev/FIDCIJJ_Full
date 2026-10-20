import { supabase } from "@/app/utils/supabaseClient";
import { reportUser, reportError } from "@/app/lib/investimentosRelatorioAuth";
import { validateReportSettings } from "@/app/lib/investimentosRelatorio";
import { sendInvestmentReport } from "@/app/lib/investimentosRelatorioEnvio";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    reportUser(request);
    const settings = validateReportSettings(await request.json());
    const result = await sendInvestmentReport(supabase, settings);
    return Response.json(result, { status: result.enviados.length ? 200 : 502 });
  } catch (error) { const result = reportError(error); return Response.json({ message: result.message }, { status: result.status }); }
}
