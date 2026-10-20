export function scheduledReportPeriod(settings, now = new Date()) {
  const today = now.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const date = new Date(`${today}T12:00:00Z`);
  const schedule = settings.automatico;
  if (!schedule?.ativo) return null;
  if (schedule.frequencia === "semanal" && date.getUTCDay() !== schedule.diaSemana) return null;
  if (schedule.frequencia === "mensal" && date.getUTCDate() !== schedule.diaMes) return null;
  const key = (day) => day.toISOString().slice(0, 10);
  const start = new Date(date);
  const end = new Date(date);
  if (schedule.frequencia === "mensal") {
    start.setUTCDate(1); start.setUTCMonth(start.getUTCMonth() - 1);
    end.setUTCDate(0);
  } else {
    end.setUTCDate(end.getUTCDate() - 1);
    start.setUTCDate(start.getUTCDate() - (schedule.frequencia === "semanal" ? 7 : 1));
  }
  return { dataReferencia: today, dataInicio: key(start), dataFim: key(end) };
}
