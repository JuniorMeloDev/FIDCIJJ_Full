"use client";

import { useEffect, useRef, useState } from "react";
import InvestimentosDestinatarios from "./InvestimentosDestinatarios";

const field = "w-full rounded-2xl border border-white/10 bg-gray-800 px-4 py-3 text-gray-100 outline-none focus:border-orange-400";
const label = "mb-2 block text-sm font-semibold text-gray-300";
const button = "rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-gray-200 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed";
const defaults = () => {
  const now = new Date();
  const today = now.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  return { destinos: [{ email: "", aplicacaoIds: [] }], assunto: "Relatório completo de investimentos - FIDC IJJ", mensagem: "Prezados,\n\nSegue em anexo o relatório completo das aplicações, com saldos e movimentações do período.", dataInicio: `${today.slice(0, 7)}-01`, dataFim: today, automatico: { ativo: false, frequencia: "mensal", diaSemana: 1, diaMes: 1 } };
};

export default function InvestimentosEmailModal({ open, onClose, aplicacoes, contas, getAuthHeader, onNotify }) {
  const [form, setForm] = useState(defaults);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [previewIndex, setPreviewIndex] = useState(0);
  const [lastSend, setLastSend] = useState(null);
  const formRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true); setError(""); setForm(defaults());
    fetch("/api/investimentos/relatorios-email", { headers: getAuthHeader(), signal: controller.signal })
      .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.message); return result; })
      .then(({ configuracao, ultimoEnvio }) => {
        setLastSend(ultimoEnvio); setPreviewIndex(0);
        if (configuracao) {
          const destinos = configuracao.destinos || configuracao.destinatarios.map((email) => ({ email, aplicacaoIds: configuracao.aplicacaoIds?.length ? configuracao.aplicacaoIds : [] }));
          if (!configuracao.destinos) setError("Revise as aplicações de cada destinatário e salve a configuração para atualizar os envios automáticos.");
          setForm({ ...defaults(), ...configuracao, destinos });
        }
      })
      .catch((err) => { if (err.name !== "AbortError") setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
    // Recarrega somente ao abrir; não sobrescreve os campos durante a edição.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open || busy) return;
    const escape = (event) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [open, busy, onClose]);

  if (!open) return null;
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const execute = async (action) => {
    if (busy || (action !== "preview" && !formRef.current.reportValidity())) return;
    setBusy(action); setError("");
    try {
      const response = await fetch(`/api/investimentos/relatorios-email${action === "save" ? "" : action === "send" ? "/enviar" : "/preview"}`, {
        method: action === "save" ? "PUT" : "POST", headers: { "Content-Type": "application/json", ...getAuthHeader() }, body: JSON.stringify({ ...form, destinatarioPreview: previewIndex }),
      });
      if (!response.ok) { const result = await response.json(); throw new Error(result.message || "Não foi possível processar o relatório."); }
      if (action === "preview") {
        const blob = await response.blob(); const url = URL.createObjectURL(blob);
        const link = document.createElement("a"); link.href = url; link.download = `investimentos_${form.dataInicio}_${form.dataFim}.pdf`; document.body.appendChild(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000); onNotify("Prévia do relatório baixada.", "success");
      } else if (action === "save") onNotify("Configuração salva para os próximos envios.", "success");
      else {
        const result = await response.json();
        onNotify(`${result.message} Enviado para: ${result.enviados.join(", ")}.`, result.falhas.length ? "error" : "success");
        if (result.falhas.length) { setError(`Falha no envio para: ${result.falhas.join(", ")}. Os demais já receberam o relatório.`); update("destinos", form.destinos.filter((destino) => result.falhas.includes(destino.email.trim().toLowerCase()))); setPreviewIndex(0); }
      }
    } catch (err) { setError(err.message); } finally { setBusy(""); }
  };

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/70 p-4" onClick={() => !busy && onClose()}>
      <section role="dialog" aria-modal="true" aria-labelledby="email-report-title" className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-white/10 bg-gray-900 p-5 text-gray-100 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="mb-5 flex items-start justify-between gap-4">
          <div><h2 id="email-report-title" className="text-2xl font-bold">Relatórios por e-mail</h2><p className="mt-1 text-sm text-gray-400">Configure os destinatários e envie o relatório completo das aplicações em PDF.</p></div>
          <button type="button" disabled={Boolean(busy)} onClick={onClose} className={button}>Fechar</button>
        </div>
        {loading ? <p role="status" className="py-8 text-gray-400">Carregando configuração...</p> : (
          <form ref={formRef} onSubmit={(event) => { event.preventDefault(); execute("save"); }} className="space-y-4">
            <fieldset disabled={Boolean(busy)} className="space-y-4 disabled:opacity-70">
              <InvestimentosDestinatarios destinos={form.destinos} aplicacoes={aplicacoes} contas={contas} onChange={(destinos) => { update("destinos", destinos); setPreviewIndex(0); }} />
              <div className="grid gap-3 sm:grid-cols-2"><div><label className={label} htmlFor="report-start">Data inicial</label><input id="report-start" type="date" className={field} value={form.dataInicio} onChange={(event) => update("dataInicio", event.target.value)} required /></div><div><label className={label} htmlFor="report-end">Data final</label><input id="report-end" type="date" min={form.dataInicio} className={field} value={form.dataFim} onChange={(event) => update("dataFim", event.target.value)} required /></div></div>
              <div><label className={label} htmlFor="report-subject">Assunto do e-mail</label><input id="report-subject" className={field} maxLength={160} value={form.assunto} onChange={(event) => update("assunto", event.target.value)} required /></div>
              <div><label className={label} htmlFor="report-message">Mensagem</label><textarea id="report-message" rows={4} className={field} maxLength={5000} value={form.mensagem} onChange={(event) => update("mensagem", event.target.value)} /></div>
              <div className="space-y-3 rounded-2xl border border-orange-400/20 bg-orange-500/5 p-4">
                <label className="flex items-center gap-3 text-sm font-semibold"><input type="checkbox" checked={form.automatico.ativo} onChange={(event) => update("automatico", { ...form.automatico, ativo: event.target.checked })} />Ativar envio automático</label>
                {form.automatico.ativo && <>
                  <div className="grid gap-3 sm:grid-cols-2"><div><label className={label} htmlFor="report-frequency">Frequência</label><select id="report-frequency" className={field} value={form.automatico.frequencia} onChange={(event) => update("automatico", { ...form.automatico, frequencia: event.target.value })}><option value="diario">Diário</option><option value="semanal">Semanal</option><option value="mensal">Mensal</option></select></div>
                    {form.automatico.frequencia === "semanal" && <div><label className={label} htmlFor="report-weekday">Dia da semana</label><select id="report-weekday" className={field} value={form.automatico.diaSemana} onChange={(event) => update("automatico", { ...form.automatico, diaSemana: Number(event.target.value) })}>{["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"].map((day, index) => <option key={day} value={index}>{day}</option>)}</select></div>}
                    {form.automatico.frequencia === "mensal" && <div><label className={label} htmlFor="report-monthday">Dia do mês</label><select id="report-monthday" className={field} value={form.automatico.diaMes} onChange={(event) => update("automatico", { ...form.automatico, diaMes: Number(event.target.value) })}>{Array.from({ length: 28 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}</select></div>}
                  </div>
                  <p className="text-sm text-gray-300">Envio às 8h, horário de Brasília. {form.automatico.frequencia === "diario" ? "Inclui o dia anterior." : form.automatico.frequencia === "semanal" ? "Inclui os sete dias anteriores ao envio." : "Inclui o mês anterior completo."} Use Salvar configuração para ativar ou atualizar o agendamento.</p>
                </>}
                {lastSend && <div className="text-sm text-gray-400">Último envio automático: {lastSend.data_referencia.split("-").reverse().join("/")} - {{ processando: "Em processamento", enviado: "Enviado", parcial: "Enviado parcialmente", erro: "Falha no envio" }[lastSend.status] || lastSend.status}{lastSend.resultado?.message && <p className="mt-1">{lastSend.resultado.message}</p>}{lastSend.resultado?.falhas?.length > 0 && <p className="mt-1 text-amber-300">Destinatários com falha: {lastSend.resultado.falhas.join(", ")}</p>}</div>}
              </div>
              <p className="rounded-2xl bg-white/5 p-3 text-sm text-gray-300">O PDF inclui saldos inicial e final, aportes, retiradas, transferências, ajustes, rendimentos e o extrato completo com a origem dos aportes. As datas acima valem para o envio manual; no automático o período é calculado pela frequência.</p>
            </fieldset>
            {error && <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
            <div><label className={label} htmlFor="preview-recipient">Destinatário da prévia PDF</label><select id="preview-recipient" className={field} value={previewIndex} onChange={(event) => setPreviewIndex(Number(event.target.value))}>{form.destinos.map((destino, index) => <option key={index} value={index}>{destino.email || `Destinatário ${index + 1}`}</option>)}</select></div>
            <div className="grid gap-3 sm:grid-cols-3">
              <button type="submit" disabled={Boolean(busy)} className={button}>{busy === "save" ? "Salvando..." : "Salvar configuração"}</button>
              <button type="button" disabled={Boolean(busy) || !aplicacoes.length} onClick={() => execute("preview")} className={button}>{busy === "preview" ? "Gerando..." : "Baixar prévia PDF"}</button>
              <button type="button" disabled={Boolean(busy) || !aplicacoes.length} onClick={() => execute("send")} className="rounded-2xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white hover:bg-orange-400 disabled:opacity-50">{busy === "send" ? "Enviando..." : "Enviar relatório"}</button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
