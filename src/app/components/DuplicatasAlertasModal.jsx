"use client";

import { useEffect, useState } from "react";

export default function DuplicatasAlertasModal({ open, onClose, getAuthHeader, onNotify }) {
  const [form, setForm] = useState({ ativo: false, vencemHoje: true, vencidas: true, destinatarios: "" });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [last, setLast] = useState(null);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true); setError(""); setLast(null);
    fetch("/api/duplicatas/alertas-email", { headers: getAuthHeader(), signal: controller.signal })
      .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.message); return result; })
      .then(({ configuracao, ultimoEnvio }) => {
        setLast(ultimoEnvio);
        setForm(configuracao ? { ...configuracao, destinatarios: configuracao.destinatarios.join("; ") } : { ativo: false, vencemHoje: true, vencidas: true, destinatarios: "" });
      })
      .catch((err) => { if (err.name !== "AbortError") setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  if (!open) return null;
  const save = async (event) => {
    event.preventDefault(); if (saving) return;
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/duplicatas/alertas-email", { method: "PUT", headers: { "Content-Type": "application/json", ...getAuthHeader() }, body: JSON.stringify(form) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      onNotify("Configuração dos alertas de duplicatas salva.", "success"); onClose();
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  };
  return <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/70 p-4" onClick={() => !saving && onClose()}>
    <section role="dialog" aria-modal="true" aria-labelledby="due-alert-title" className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-3xl border border-white/10 bg-gray-900 p-6 text-gray-100 shadow-2xl" onClick={(event) => event.stopPropagation()}>
      <div className="mb-5 flex items-start justify-between gap-3"><div><h2 id="due-alert-title" className="text-xl font-bold">Alertas de duplicatas por e-mail</h2><p className="mt-2 text-sm text-gray-400">Resumo diário às 8h, horário de Brasília.</p></div><button type="button" disabled={saving} onClick={onClose} className="rounded-xl border border-white/10 px-3 py-2 text-sm">Fechar</button></div>
      {loading ? <p role="status">Carregando configuração...</p> : <form onSubmit={save} className="space-y-4"><fieldset disabled={saving} className="space-y-4">
        <label className="flex items-center gap-3 font-semibold"><input type="checkbox" checked={form.ativo} onChange={(event) => setForm({ ...form, ativo: event.target.checked })} />Ativar envio automático</label>
        <div><label htmlFor="due-recipients" className="mb-2 block text-sm font-semibold">Destinatários</label><textarea id="due-recipients" required rows={2} value={form.destinatarios} onChange={(event) => setForm({ ...form, destinatarios: event.target.value })} placeholder="seuemail@empresa.com" className="w-full rounded-2xl border border-white/10 bg-gray-800 p-3" /><p className="mt-1 text-xs text-gray-400">Até 20 e-mails separados por ponto e vírgula, vírgula ou linha. Cada endereço recebe uma cópia individual.</p></div>
        <label className="flex items-center gap-3"><input type="checkbox" checked={form.vencemHoje} onChange={(event) => setForm({ ...form, vencemHoje: event.target.checked })} />Duplicatas que vencem no dia</label>
        <label className="flex items-center gap-3"><input type="checkbox" checked={form.vencidas} onChange={(event) => setForm({ ...form, vencidas: event.target.checked })} />Duplicatas vencidas, diariamente enquanto pendentes</label>
        <p className="rounded-2xl bg-white/5 p-3 text-sm leading-relaxed text-gray-300">Inclui as duplicatas pendentes de operações aprovadas de toda a carteira, independentemente dos filtros da tela. O e-mail traz um resumo e a lista completa em CSV. Sem títulos nos grupos selecionados, nenhum e-mail é enviado. Estes avisos são para acompanhamento interno; não enviam cobranças automaticamente aos sacados.</p>
        {last && <div className="text-sm text-gray-400">Última execução: {last.data_referencia.split("-").reverse().join("/")} - {{ processando: "Em processamento", enviado: "Enviado", parcial: "Envio parcial", erro: "Falha", sem_titulos: "Sem títulos" }[last.status]}{last.resultado?.message && <p>{last.resultado.message}</p>}{last.resultado?.falhas?.length > 0 && <p className="text-amber-300">Falha para: {last.resultado.falhas.join(", ")}</p>}</div>}
      </fieldset>{error && <p role="alert" className="text-sm text-red-300">{error}</p>}<button type="submit" disabled={saving} className="w-full rounded-2xl bg-orange-500 px-4 py-3 font-semibold text-white disabled:opacity-50">{saving ? "Salvando..." : "Salvar configuração"}</button></form>}
    </section>
  </div>;
}
