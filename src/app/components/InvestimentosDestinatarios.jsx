"use client";

export default function InvestimentosDestinatarios({ destinos, aplicacoes, contas, onChange }) {
  const set = (index, patch) => onChange(destinos.map((destino, i) => i === index ? { ...destino, ...patch } : destino));
  const allIds = aplicacoes.map((app) => app.id);
  return <div className="space-y-4">
    <div><h3 className="text-base font-semibold">Destinatários e suas aplicações</h3><p className="mt-1 text-sm text-gray-400">Cada endereço recebe um PDF somente com as aplicações selecionadas no seu cadastro.</p></div>
    {destinos.map((destino, index) => <fieldset key={index} className="space-y-3 rounded-2xl border border-white/10 p-4">
      <legend className="px-2 text-sm font-semibold text-orange-200">Destinatário {index + 1}</legend>
      <div className="flex items-end gap-2"><div className="flex-1"><label htmlFor={`recipient-${index}`} className="mb-2 block text-sm text-gray-300">E-mail do destinatário {index + 1}</label><input id={`recipient-${index}`} type="email" required value={destino.email} onChange={(event) => set(index, { email: event.target.value })} placeholder="cliente@empresa.com" className="w-full rounded-2xl border border-white/10 bg-gray-800 px-4 py-3 text-gray-100" /></div><button type="button" disabled={destinos.length === 1} onClick={() => onChange(destinos.filter((_, i) => i !== index))} className="rounded-xl px-3 py-3 text-sm text-red-300 disabled:opacity-40" aria-label={`Remover destinatário ${index + 1}`}>Remover</button></div>
      <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={allIds.length > 0 && allIds.every((id) => destino.aplicacaoIds.includes(id))} onChange={(event) => set(index, { aplicacaoIds: event.target.checked ? allIds : [] })} />Todas as aplicações para o destinatário {index + 1}</label>
      <div className="max-h-44 space-y-2 overflow-y-auto border-t border-white/10 pt-3">
        {aplicacoes.map((app) => <label key={app.id} className="flex items-start gap-3 text-sm"><input className="mt-1" type="checkbox" checked={destino.aplicacaoIds.includes(app.id)} onChange={(event) => set(index, { aplicacaoIds: event.target.checked ? [...new Set([...destino.aplicacaoIds, app.id])] : destino.aplicacaoIds.filter((id) => id !== app.id) })} /><span>{app.nome}<span className="block text-xs text-gray-400">{contas.find((conta) => conta.id === app.conta_id)?.nome}</span></span></label>)}
        {!aplicacoes.length && <p className="text-sm text-gray-400">Nenhuma aplicação cadastrada.</p>}
      </div>
      <p className={`text-xs ${destino.aplicacaoIds.length ? "text-gray-400" : "text-amber-300"}`}>{destino.aplicacaoIds.length ? `${destino.aplicacaoIds.length} aplicação(ões) selecionada(s).` : "Nenhuma aplicação selecionada. Selecione ao menos uma para este e-mail."}</p>
    </fieldset>)}
    <button type="button" disabled={destinos.length >= 20} onClick={() => onChange([...destinos, { email: "", aplicacaoIds: [] }])} className="rounded-xl border border-orange-400/30 px-4 py-2 text-sm text-orange-200 disabled:opacity-40">Adicionar destinatário</button>
  </div>;
}
