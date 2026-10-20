import { supabase } from "@/app/utils/supabaseClient";
import { reportUser, reportError } from "@/app/lib/investimentosRelatorioAuth";
import { validateReportSettings, loadInvestmentReport, generateInvestmentReportPdf } from "@/app/lib/investimentosRelatorio";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    reportUser(request);
    const input = await request.json();
    const config = validateReportSettings(input);
    const index = input.destinatarioPreview;
    if (!Number.isInteger(index) || !config.destinos[index]) return Response.json({ message: "Selecione o destinatário da prévia." }, { status: 400 });
    const settings = { ...config, aplicacaoIds: config.destinos[index].aplicacaoIds };
    const data = await loadInvestmentReport(supabase, settings);
    const pdf = generateInvestmentReportPdf(data, settings);
    return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="investimentos_${settings.dataInicio}_${settings.dataFim}.pdf"`, "Cache-Control": "no-store" } });
  } catch (error) { const result = reportError(error); return Response.json({ message: result.message }, { status: result.status }); }
}
