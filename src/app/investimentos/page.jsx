"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  FaArrowTrendUp,
  FaBuildingColumns,
  FaChartLine,
  FaFilter,
  FaPiggyBank,
  FaWallet,
} from "react-icons/fa6";
import Notification from "@/app/components/Notification";
import ConfirmacaoModal from "@/app/components/ConfirmacaoModal";
import Pagination from "@/app/components/Pagination";
import {
  formatBRLInput,
  formatBRLNumber,
  formatDate,
  parseBRL,
} from "@/app/utils/formatters";
import Logo from "../../../public/Logo.png";

const fieldClass = "w-full rounded-2xl border border-white/10 bg-gray-800 px-4 py-3 text-gray-100 outline-none transition focus:border-orange-400";
const labelClass = "mb-2 block text-sm font-semibold text-gray-300";
const itemsPerPage = 10;
const getDefaultDateRange = () => ({
  dataInicio: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
  dataFim: new Date().toISOString().slice(0, 10),
});
const initialConta = { id: null, nome: "", banco: "", agencia: "", conta: "", descricao: "", ativa: true };
const initialAplicacao = { id: null, contaId: "", nome: "", descricao: "", percentualJurosMensal: "0", baseDias: "corridos", rendeJuros: true, ativa: true };
const initialMov = { id: null, contaId: "", aplicacaoId: "", aplicacaoDestinoId: "", dataMovimento: new Date().toISOString().slice(0, 10), tipo: "aporte", descricao: "", valor: "", observacao: "" };
const initialReportFilters = { ...getDefaultDateRange(), contaId: "", aplicacaoId: "", tipo: "" };
const movementTypeOptions = [
  ["aporte", "Aporte"],
  ["resgate", "Resgate"],
  ["transferencia", "Transferência"],
  ["rendimento_manual", "Rendimento manual"],
];

const tipos = {
  aporte: ["Aporte", "bg-emerald-500/15 text-emerald-300 border border-emerald-500/20"],
  resgate: ["Resgate", "bg-amber-500/15 text-amber-300 border border-amber-500/20"],
  ajuste: ["Ajuste", "bg-violet-500/15 text-violet-300 border border-violet-500/20"],
  transferencia: ["Transferência", "bg-indigo-500/15 text-indigo-300 border border-indigo-500/20"],
  rendimento_manual: ["Rendimento manual", "bg-sky-500/15 text-sky-300 border border-sky-500/20"],
  rentabilidade_diaria: ["Rentabilidade diária", "bg-cyan-500/15 text-cyan-300 border border-cyan-500/20"],
};

function Modal({ open, title, subtitle, onClose, children }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-3xl border border-white/10 bg-gray-900 p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-white">{title}</h2>
            <p className="text-sm text-gray-400">{subtitle}</p>
          </div>
          <button onClick={onClose} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-gray-200 transition hover:bg-white/10">Fechar</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function InvestimentosPage() {
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [logoBase64, setLogoBase64] = useState(null);
  const [error, setError] = useState("");
  const [notification, setNotification] = useState({ message: "", type: "" });
  const [dashboard, setDashboard] = useState({ cards: {}, contas: [], aplicacoes: [], movimentacoes: [], evolucao: [] });
  const [cadastros, setCadastros] = useState({ contas: [], aplicacoes: [] });
  const [filters, setFilters] = useState({ ...initialReportFilters });
  const [reportFilters, setReportFilters] = useState({ ...initialReportFilters });
  const [contaForm, setContaForm] = useState(initialConta);
  const [aplicacaoForm, setAplicacaoForm] = useState(initialAplicacao);
  const [movForm, setMovForm] = useState(initialMov);
  const [deleteState, setDeleteState] = useState({ kind: "", item: null });
  const [modal, setModal] = useState("");
  const [movPage, setMovPage] = useState(1);

  const getAuthHeader = () => {
    const token = sessionStorage.getItem("authToken");
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const api = async (url, options = {}) => {
    const response = await fetch(url, { ...options, headers: { ...(options.headers || {}), ...getAuthHeader() } });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.message || "Falha na requisição.");
    }
    return response.json();
  };

  const notify = (message, type) => {
    setNotification({ message, type });
    setTimeout(() => setNotification({ message: "", type: "" }), 5000);
  };

  const buildSearchParams = (currentFilters) => {
    const params = new URLSearchParams();
    Object.entries(currentFilters).forEach(([key, value]) => value && params.append(key, value));
    return params;
  };

  const loadAll = async (currentFilters = filters) => {
    const params = buildSearchParams(currentFilters);
    const [contas, aplicacoes, data] = await Promise.all([
      api("/api/investimentos/contas"),
      api("/api/investimentos/aplicacoes"),
      api(`/api/investimentos/dashboard?${params.toString()}`),
    ]);
    setCadastros({ contas, aplicacoes });
    setDashboard(data);
    setError("");
  };

  useEffect(() => {
    loadAll().catch((err) => setError(err.message)).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!loading) {
      loadAll(filters).catch((err) => setError(err.message));
    }
  }, [filters]);

  useEffect(() => {
    const image = new Image();
    image.src = Logo.src;
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0);
      setLogoBase64(canvas.toDataURL("image/png"));
    };
  }, []);

  const aplicacoesDaConta = useMemo(
    () => cadastros.aplicacoes.filter((item) => !movForm.contaId || String(item.conta_id) === String(movForm.contaId)),
    [cadastros.aplicacoes, movForm.contaId]
  );
  const aplicacoesDestino = useMemo(
    () => aplicacoesDaConta.filter((item) => String(item.id) !== String(movForm.aplicacaoId)),
    [aplicacoesDaConta, movForm.aplicacaoId]
  );

  const movimentacoesPaginadas = useMemo(() => {
    const start = (movPage - 1) * itemsPerPage;
    return dashboard.movimentacoes.slice(start, start + itemsPerPage);
  }, [dashboard.movimentacoes, movPage]);

  useEffect(() => {
    setMovPage(1);
  }, [dashboard.movimentacoes.length, filters]);

  const resetConta = () => setContaForm(initialConta);
  const resetAplicacao = () => setAplicacaoForm({ ...initialAplicacao, contaId: cadastros.contas[0]?.id ? String(cadastros.contas[0].id) : "" });
  const resetMov = () => setMovForm({ ...initialMov, contaId: cadastros.contas[0]?.id ? String(cadastros.contas[0].id) : "" });
  const resetReport = () => setReportFilters({ ...filters });

  const openConta = (item = null) => {
    setContaForm(item ? { id: item.id, nome: item.nome || "", banco: item.banco || "", agencia: item.agencia || "", conta: item.conta || "", descricao: item.descricao || "", ativa: item.ativa !== false } : { ...initialConta, ativa: true });
    setModal("conta");
  };
  const openAplicacao = (item = null) => {
    setAplicacaoForm(item ? { id: item.id, contaId: String(item.conta_id || ""), nome: item.nome || "", descricao: item.descricao || "", percentualJurosMensal: String(item.percentual_juros_mensal || 0), baseDias: item.base_dias || "corridos", rendeJuros: item.rende_juros !== false, ativa: item.ativa !== false } : { ...initialAplicacao, contaId: cadastros.contas[0]?.id ? String(cadastros.contas[0].id) : "" });
    setModal("aplicacao");
  };
  const openMov = (item = null) => {
    setMovForm(item ? { id: item.id, contaId: String(item.conta_id || ""), aplicacaoId: String(item.aplicacao_id || ""), aplicacaoDestinoId: "", dataMovimento: item.data_movimento, tipo: item.origem === "transferencia" ? "transferencia" : item.tipo, descricao: item.descricao || "", valor: formatBRLNumber(Math.abs(Number(item.valor || 0))), observacao: item.observacao || "" } : { ...initialMov, contaId: cadastros.contas[0]?.id ? String(cadastros.contas[0].id) : "" });
    setModal("mov");
  };
  const openReport = () => {
    setReportFilters({ ...filters });
    setModal("relatorios");
  };

  const saveConta = async (e) => {
    e.preventDefault();
    try {
      setIsSaving(true);
      await api(contaForm.id ? `/api/investimentos/contas/${contaForm.id}` : "/api/investimentos/contas", { method: contaForm.id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(contaForm) });
      notify(`Conta ${contaForm.id ? "atualizada" : "criada"} com sucesso.`, "success");
      setModal("");
      resetConta();
      await loadAll();
    } catch (err) {
      setError(err.message);
      notify(err.message, "error");
    } finally {
      setIsSaving(false);
    }
  };
  const saveAplicacao = async (e) => {
    e.preventDefault();
    await api(aplicacaoForm.id ? `/api/investimentos/aplicacoes/${aplicacaoForm.id}` : "/api/investimentos/aplicacoes", { method: aplicacaoForm.id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...aplicacaoForm, contaId: Number(aplicacaoForm.contaId), percentualJurosMensal: Number(aplicacaoForm.percentualJurosMensal || 0) }) });
    notify(`Aplicação ${aplicacaoForm.id ? "atualizada" : "criada"} com sucesso.`, "success");
    setModal(""); resetAplicacao(); await loadAll();
  };
  const saveMov = async (e) => {
    e.preventDefault();
    await api(movForm.id ? `/api/investimentos/movimentacoes/${movForm.id}` : "/api/investimentos/movimentacoes", { method: movForm.id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...movForm, contaId: Number(movForm.contaId), aplicacaoId: Number(movForm.aplicacaoId), valor: Number(movForm.valor) }) });
    notify(`Lançamento ${movForm.id ? "atualizado" : "criado"} com sucesso.`, "success");
    setModal(""); resetMov(); await loadAll();
  };

  const handleSaveAplicacao = async (e) => {
    e.preventDefault();
    try {
      setIsSaving(true);
      await api(aplicacaoForm.id ? `/api/investimentos/aplicacoes/${aplicacaoForm.id}` : "/api/investimentos/aplicacoes", { method: aplicacaoForm.id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...aplicacaoForm, contaId: Number(aplicacaoForm.contaId), percentualJurosMensal: Number(aplicacaoForm.percentualJurosMensal || 0) }) });
      notify(`Aplicação ${aplicacaoForm.id ? "atualizada" : "criada"} com sucesso.`, "success");
      setModal("");
      resetAplicacao();
      await loadAll();
    } catch (err) {
      setError(err.message);
      notify(err.message, "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveMov = async (e) => {
    e.preventDefault();
    try {
      setIsSaving(true);
      await api(movForm.id ? `/api/investimentos/movimentacoes/${movForm.id}` : "/api/investimentos/movimentacoes", { method: movForm.id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...movForm, contaId: Number(movForm.contaId), aplicacaoId: Number(movForm.aplicacaoId), aplicacaoDestinoId: movForm.aplicacaoDestinoId ? Number(movForm.aplicacaoDestinoId) : null, valor: parseBRL(movForm.valor) }) });
      notify(`Lançamento ${movForm.id ? "atualizado" : "criado"} com sucesso.`, "success");
      setModal("");
      resetMov();
      await loadAll();
    } catch (err) {
      setError(err.message);
      notify(err.message, "error");
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = async () => {
    const route = {
      conta: `/api/investimentos/contas/${deleteState.item.id}`,
      aplicacao: `/api/investimentos/aplicacoes/${deleteState.item.id}`,
      movimentacao: `/api/investimentos/movimentacoes/${deleteState.item.id}`,
    }[deleteState.kind];
    await api(route, { method: "DELETE" });
    setDeleteState({ kind: "", item: null });
    notify("Registro excluído com sucesso.", "success");
    await loadAll();
  };

  const generateInvestmentPdf = (data, appliedFilters) => {
    const contaNome = cadastros.contas.find((item) => String(item.id) === String(appliedFilters.contaId))?.nome || "Todas";
    const aplicacaoNome = cadastros.aplicacoes.find((item) => String(item.id) === String(appliedFilters.aplicacaoId))?.nome || "Todas";
    const tipoNome = appliedFilters.tipo ? (tipos[appliedFilters.tipo]?.[0] || appliedFilters.tipo) : "Todos";
    const getMovementTypeLabel = (movimento) => (movimento.origem === "transferencia" ? "Transferência" : (tipos[movimento.tipo]?.[0] || movimento.tipo));
    const doc = new jsPDF({ orientation: "landscape" });
    const pageWidth = doc.internal.pageSize.getWidth();

    if (logoBase64) {
      const logoWidth = 40;
      const logoHeight = logoWidth / 2.3;
      doc.addImage(logoBase64, "PNG", 14, 10, logoWidth, logoHeight);
    }

    doc.setFontSize(18);
    doc.text("Relatório de Investimentos", pageWidth - 14, 22, { align: "right" });
    doc.setFontSize(8);
    doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, pageWidth - 14, 28, { align: "right" });

    const filterText = `Período: ${formatDate(appliedFilters.dataInicio)} a ${formatDate(appliedFilters.dataFim)} | Conta: ${contaNome} | Aplicação: ${aplicacaoNome} | Tipo: ${tipoNome}`;
    doc.text(filterText, 14, 36);

    const resumoCards = [
      ["Patrimônio investido", formatBRLNumber(Number(data.cards.patrimonioInvestido || 0))],
      ["Saldo disponível", formatBRLNumber(Number(data.cards.saldoDisponivel || 0))],
      ["Rendimento do período", formatBRLNumber(Number(data.cards.rendimentoPeriodo || 0))],
      ["Aportes do período", formatBRLNumber(Number(data.cards.aportesPeriodo || 0))],
    ];

    let cardX = 14;
    const cardY = 42;
    const cardWidth = 66;
    const cardHeight = 24;
    resumoCards.forEach(([label, value]) => {
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(203, 213, 225);
      doc.roundedRect(cardX, cardY, cardWidth, cardHeight, 3, 3, "FD");
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(label.toUpperCase(), cardX + 4, cardY + 7);
      doc.setFontSize(15);
      doc.setTextColor(15, 23, 42);
      doc.text(value, cardX + 4, cardY + 17);
      cardX += cardWidth + 4;
    });

    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42);
    doc.text("Aplicações e posição atual", 14, 78);
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(`${data.aplicacoes.length} registro(s)`, 14, 84);

    autoTable(doc, {
      startY: 88,
      head: [["Aplicação", "Conta", "Status", "Saldo", "Rendimento", "Estimativa diária"]],
      body: data.aplicacoes.length > 0
        ? data.aplicacoes.map((aplicacao) => [
            aplicacao.nome,
            aplicacao.contaLabel,
            aplicacao.ativa ? (aplicacao.rende_juros ? "Ativa" : "Sem rendimento") : "Inativa",
            formatBRLNumber(Number(aplicacao.saldoAtual || 0)),
            formatBRLNumber(Number(aplicacao.rendimentoPeriodo || 0)),
            formatBRLNumber(Number(aplicacao.rentabilidadeDiariaEstimada || 0)),
          ])
        : [["-", "-", "Nenhuma aplicação encontrada", "-", "-", "-"]],
      styles: { fontSize: 8, cellPadding: 3.5 },
      headStyles: { fillColor: [226, 232, 240], textColor: [51, 65, 85] },
      margin: { left: 14, right: 14 },
      columnStyles: {
        3: { halign: "right" },
        4: { halign: "right" },
        5: { halign: "right" },
      },
    });

    const movimentosStartY = (doc.lastAutoTable?.finalY || 88) + 14;
    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42);
    doc.text("Movimentações do período", 14, movimentosStartY);
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(`${data.movimentacoes.length} registro(s)`, 14, movimentosStartY + 6);

    autoTable(doc, {
      startY: movimentosStartY + 10,
      head: [["Data", "Descrição", "Aplicação", "Conta", "Tipo", "Origem", "Valor"]],
      body: data.movimentacoes.length > 0
        ? data.movimentacoes.map((mov) => [
            formatDate(mov.data_movimento),
            mov.descricao,
            mov.aplicacao_nome,
            mov.conta_nome,
            getMovementTypeLabel(mov),
            mov.origem === "calculada" ? "Automático" : mov.origem === "transferencia" ? "Transferência" : "Manual",
            `${Number(mov.valor) >= 0 ? "" : "-"}${formatBRLNumber(Math.abs(Number(mov.valor || 0)))}`,
          ])
        : [["-", "Nenhuma movimentação encontrada", "-", "-", "-", "-", "-"]],
      styles: { fontSize: 7.5, cellPadding: 3 },
      headStyles: { fillColor: [226, 232, 240], textColor: [51, 65, 85] },
      margin: { left: 14, right: 14 },
      columnStyles: {
        6: { halign: "right" },
      },
      didParseCell: (hookData) => {
        if (hookData.section !== "body" || hookData.column.index !== 6) return;
        const valor = String(hookData.cell.raw || "");
        hookData.cell.styles.textColor = valor.startsWith("-") ? [190, 24, 93] : [4, 120, 87];
        hookData.cell.styles.fontStyle = "bold";
      },
    });

    doc.save(`relatorio_investimentos_${appliedFilters.dataInicio}_a_${appliedFilters.dataFim}.pdf`);
  };

  const handleGenerateReport = async (event) => {
    event.preventDefault();
    try {
      setIsPrinting(true);
      const params = buildSearchParams(reportFilters);
      const reportData = await api(`/api/investimentos/dashboard?${params.toString()}`);
      generateInvestmentPdf(reportData, reportFilters);
      setModal("");
      notify("PDF gerado com sucesso.", "success");
    } catch (err) {
      setError(err.message);
      notify(err.message, "error");
    } finally {
      setIsPrinting(false);
    }
  };

  if (loading) return <main className="flex h-full items-center justify-center bg-gradient-to-br from-gray-950 via-gray-900 to-slate-900"><p className="text-xl text-gray-400">Carregando investimentos...</p></main>;

  return (
    <main className="h-full overflow-x-hidden overflow-y-auto bg-gradient-to-br from-gray-950 via-gray-900 to-slate-900">
      <Notification message={notification.message} type={notification.type} onClose={() => setNotification({ message: "", type: "" })} />
      <ConfirmacaoModal isOpen={!!deleteState.item} onClose={() => setDeleteState({ kind: "", item: null })} onConfirm={confirmDelete} title="Confirmar exclusão" message={`Deseja excluir "${deleteState.item?.nome || deleteState.item?.descricao}"?`} />

      <Modal open={modal === "conta"} title="Conta bancária" subtitle="Cadastro exclusivo deste módulo" onClose={() => { setModal(""); resetConta(); }}>
        <form onSubmit={saveConta} className="space-y-3">
          <div><label className={labelClass}>Nome</label><input className={fieldClass} value={contaForm.nome} onChange={(e) => setContaForm((v) => ({ ...v, nome: e.target.value }))} required /></div>
          <div><label className={labelClass}>Banco</label><input className={fieldClass} value={contaForm.banco} onChange={(e) => setContaForm((v) => ({ ...v, banco: e.target.value }))} required /></div>
          <div className="grid gap-3 sm:grid-cols-2"><div><label className={labelClass}>Agência</label><input className={fieldClass} value={contaForm.agencia} onChange={(e) => setContaForm((v) => ({ ...v, agencia: e.target.value }))} /></div><div><label className={labelClass}>Conta</label><input className={fieldClass} value={contaForm.conta} onChange={(e) => setContaForm((v) => ({ ...v, conta: e.target.value }))} /></div></div>
          <div><label className={labelClass}>Descrição</label><textarea className={`${fieldClass} min-h-24`} value={contaForm.descricao} onChange={(e) => setContaForm((v) => ({ ...v, descricao: e.target.value }))} /></div>
          <label className="flex items-center gap-3 text-sm font-semibold text-gray-300"><input type="checkbox" checked={contaForm.ativa} onChange={(e) => setContaForm((v) => ({ ...v, ativa: e.target.checked }))} />Conta ativa</label>
          <button type="submit" disabled={isSaving} className="w-full rounded-2xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-60">{isSaving ? "Salvando..." : contaForm.id ? "Salvar conta" : "Criar conta"}</button>
        </form>
      </Modal>

      <Modal open={modal === "aplicacao"} title="Aplicação" subtitle="Juros mensais e base de dias" onClose={() => { setModal(""); resetAplicacao(); }}>
        <form onSubmit={handleSaveAplicacao} className="space-y-3">
          <div><label className={labelClass}>Conta bancária</label><select className={fieldClass} value={aplicacaoForm.contaId} onChange={(e) => setAplicacaoForm((v) => ({ ...v, contaId: e.target.value }))} required><option value="">Selecione</option>{cadastros.contas.map((conta) => <option key={conta.id} value={conta.id}>{conta.nome}</option>)}</select></div>
          <div><label className={labelClass}>Nome da aplicação</label><input className={fieldClass} value={aplicacaoForm.nome} onChange={(e) => setAplicacaoForm((v) => ({ ...v, nome: e.target.value }))} required /></div>
          <div className="grid gap-3 sm:grid-cols-2"><div><label className={labelClass}>% de juros mensal</label><input type="number" min="0" step="0.0001" className={fieldClass} value={aplicacaoForm.percentualJurosMensal} onChange={(e) => setAplicacaoForm((v) => ({ ...v, percentualJurosMensal: e.target.value }))} /></div><div><label className={labelClass}>Base</label><select className={fieldClass} value={aplicacaoForm.baseDias} onChange={(e) => setAplicacaoForm((v) => ({ ...v, baseDias: e.target.value }))}><option value="corridos">Dias corridos</option><option value="uteis">Dias úteis</option></select></div></div>
          <div><label className={labelClass}>Descrição</label><textarea className={`${fieldClass} min-h-24`} value={aplicacaoForm.descricao} onChange={(e) => setAplicacaoForm((v) => ({ ...v, descricao: e.target.value }))} /></div>
          <label className="flex items-center gap-3 text-sm font-semibold text-gray-300"><input type="checkbox" checked={aplicacaoForm.rendeJuros} onChange={(e) => setAplicacaoForm((v) => ({ ...v, rendeJuros: e.target.checked }))} />Aplicação com rendimento</label>
          <label className="flex items-center gap-3 text-sm font-semibold text-gray-300"><input type="checkbox" checked={aplicacaoForm.ativa} onChange={(e) => setAplicacaoForm((v) => ({ ...v, ativa: e.target.checked }))} />Aplicação ativa</label>
          <button type="submit" disabled={isSaving} className="w-full rounded-2xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-60">{isSaving ? "Salvando..." : aplicacaoForm.id ? "Salvar aplicação" : "Criar aplicação"}</button>
        </form>
      </Modal>

      <Modal open={modal === "mov"} title="Lançamento manual" subtitle="Aporte, resgate, transferência ou rendimento manual" onClose={() => { setModal(""); resetMov(); }}>
        <form onSubmit={handleSaveMov} className="space-y-3">
          <div><label className={labelClass}>Conta bancária</label><select className={fieldClass} value={movForm.contaId} onChange={(e) => setMovForm((v) => ({ ...v, contaId: e.target.value, aplicacaoId: "" }))} required><option value="">Selecione</option>{cadastros.contas.map((conta) => <option key={conta.id} value={conta.id}>{conta.nome}</option>)}</select></div>
          <div><label className={labelClass}>Aplicação</label><select className={fieldClass} value={movForm.aplicacaoId} onChange={(e) => setMovForm((v) => ({ ...v, aplicacaoId: e.target.value }))} required><option value="">Selecione</option>{aplicacoesDaConta.map((aplicacao) => <option key={aplicacao.id} value={aplicacao.id}>{aplicacao.nome}</option>)}</select></div>
          {movForm.tipo === "transferencia" ? <div><label className={labelClass}>Aplicação destino</label><select className={fieldClass} value={movForm.aplicacaoDestinoId} onChange={(e) => setMovForm((v) => ({ ...v, aplicacaoDestinoId: e.target.value }))} required><option value="">Selecione</option>{aplicacoesDestino.map((aplicacao) => <option key={aplicacao.id} value={aplicacao.id}>{aplicacao.nome}</option>)}</select></div> : null}
          <div className="grid gap-3 sm:grid-cols-2"><div><label className={labelClass}>Data</label><input type="date" className={fieldClass} value={movForm.dataMovimento} onChange={(e) => setMovForm((v) => ({ ...v, dataMovimento: e.target.value }))} required /></div><div><label className={labelClass}>Tipo</label><select className={fieldClass} value={movForm.tipo} onChange={(e) => setMovForm((v) => ({ ...v, tipo: e.target.value, aplicacaoDestinoId: e.target.value === "transferencia" ? v.aplicacaoDestinoId : "" }))}>{movementTypeOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div></div>
          <div><label className={labelClass}>Descrição</label><input className={fieldClass} value={movForm.descricao} onChange={(e) => setMovForm((v) => ({ ...v, descricao: e.target.value }))} required /></div>
          <div><label className={labelClass}>Valor</label><input inputMode="numeric" className={fieldClass} value={movForm.valor} onChange={(e) => setMovForm((v) => ({ ...v, valor: formatBRLInput(e.target.value) }))} placeholder="R$ 0,00" required /></div>
          <div><label className={labelClass}>Observação</label><textarea className={`${fieldClass} min-h-24`} value={movForm.observacao} onChange={(e) => setMovForm((v) => ({ ...v, observacao: e.target.value }))} /></div>
          <button type="submit" disabled={isSaving} className="w-full rounded-2xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-60">{isSaving ? "Salvando..." : movForm.id ? "Salvar lançamento" : "Criar lançamento"}</button>
        </form>
      </Modal>

      <Modal open={modal === "relatorios"} title="Relatórios" subtitle="Geração de PDF com cabeçalho e filtros do período" onClose={() => { setModal(""); resetReport(); }}>
        <form onSubmit={handleGenerateReport} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className={labelClass}>Data inicial</label><input type="date" className={fieldClass} value={reportFilters.dataInicio} onChange={(e) => setReportFilters((v) => ({ ...v, dataInicio: e.target.value }))} /></div>
            <div><label className={labelClass}>Data final</label><input type="date" className={fieldClass} value={reportFilters.dataFim} onChange={(e) => setReportFilters((v) => ({ ...v, dataFim: e.target.value }))} /></div>
          </div>
          <div><label className={labelClass}>Conta bancária</label><select className={fieldClass} value={reportFilters.contaId} onChange={(e) => setReportFilters((v) => ({ ...v, contaId: e.target.value, aplicacaoId: "" }))}><option value="">Todas</option>{cadastros.contas.map((conta) => <option key={conta.id} value={conta.id}>{conta.nome}</option>)}</select></div>
          <div><label className={labelClass}>Aplicação</label><select className={fieldClass} value={reportFilters.aplicacaoId} onChange={(e) => setReportFilters((v) => ({ ...v, aplicacaoId: e.target.value }))}><option value="">Todas</option>{cadastros.aplicacoes.filter((item) => !reportFilters.contaId || String(item.conta_id) === String(reportFilters.contaId)).map((aplicacao) => <option key={aplicacao.id} value={aplicacao.id}>{aplicacao.nome}</option>)}</select></div>
          <div><label className={labelClass}>Tipo</label><select className={fieldClass} value={reportFilters.tipo} onChange={(e) => setReportFilters((v) => ({ ...v, tipo: e.target.value }))}><option value="">Todos</option>{[...movementTypeOptions, ["rentabilidade_diaria", "Rentabilidade diária"]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={() => setReportFilters({ ...filters })} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-gray-200 transition hover:bg-white/10">Usar filtros atuais</button>
            <button type="submit" disabled={isPrinting} className="rounded-2xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-60">{isPrinting ? "Gerando PDF..." : "Gerar PDF"}</button>
          </div>
        </form>
      </Modal>

      <div className="flex flex-col gap-5 p-6">
        <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(249,115,22,0.16),_transparent_30%),linear-gradient(135deg,rgba(17,24,39,0.98),rgba(15,23,42,0.95))] p-5 shadow-2xl">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-orange-400/20 bg-orange-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-orange-300"><FaPiggyBank />Controle de investimentos</div>
              <h1 className="text-3xl font-bold text-white">Investimentos</h1>
              <p className="mt-2 text-sm text-gray-300">Acompanhe aplicações, saldos e rentabilidade diária com foco operacional nas movimentações.</p>
              {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <button onClick={() => openConta()} className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-gray-200 transition hover:bg-white/10">Nova conta</button>
              <button onClick={() => openAplicacao()} className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-gray-200 transition hover:bg-white/10">Nova aplicação</button>
              <button onClick={() => openReport()} className="rounded-2xl bg-orange-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-400">Relatórios</button>
            </div>
          </div>
        </motion.section>

        <section className="grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="space-y-5 xl:sticky xl:top-6 xl:self-start">
            <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 shadow-lg">
              <div className="mb-5 flex items-center gap-3">
                <div className="rounded-xl bg-white/5 p-2 text-orange-300"><FaFilter /></div>
                <div>
                  <h2 className="text-2xl font-bold text-white">Filtros</h2>
                  <p className="text-sm text-gray-400">Conta, aplicação, tipo e período</p>
                </div>
              </div>
              <div className="space-y-4">
                <div><label className={labelClass}>Data inicial</label><input type="date" value={filters.dataInicio} onChange={(e) => setFilters((v) => ({ ...v, dataInicio: e.target.value }))} className={fieldClass} /></div>
                <div><label className={labelClass}>Data final</label><input type="date" value={filters.dataFim} onChange={(e) => setFilters((v) => ({ ...v, dataFim: e.target.value }))} className={fieldClass} /></div>
                <div><label className={labelClass}>Conta bancária</label><select value={filters.contaId} onChange={(e) => setFilters((v) => ({ ...v, contaId: e.target.value, aplicacaoId: "" }))} className={fieldClass}><option value="">Todas</option>{cadastros.contas.map((conta) => <option key={conta.id} value={conta.id}>{conta.nome}</option>)}</select></div>
                <div><label className={labelClass}>Aplicação</label><select value={filters.aplicacaoId} onChange={(e) => setFilters((v) => ({ ...v, aplicacaoId: e.target.value }))} className={fieldClass}><option value="">Todas</option>{cadastros.aplicacoes.filter((item) => !filters.contaId || String(item.conta_id) === String(filters.contaId)).map((aplicacao) => <option key={aplicacao.id} value={aplicacao.id}>{aplicacao.nome}</option>)}</select></div>
                <div><label className={labelClass}>Tipo</label><select value={filters.tipo} onChange={(e) => setFilters((v) => ({ ...v, tipo: e.target.value }))} className={fieldClass}><option value="">Todos</option><option value="aporte">Aporte</option><option value="resgate">Resgate</option><option value="transferencia">Transferência</option><option value="rendimento_manual">Rendimento manual</option><option value="rentabilidade_diaria">Rentabilidade diária</option></select></div>
              </div>
              <button onClick={() => setFilters({ dataInicio: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10), dataFim: new Date().toISOString().slice(0, 10), contaId: "", aplicacaoId: "", tipo: "" })} className="mt-4 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-gray-200 transition hover:bg-white/10">Limpar filtros</button>
            </section>

            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
              {[["Patrimônio investido", dashboard.cards.patrimonioInvestido, `${dashboard.cards.aplicacoesAtivas || 0} aplicações ativas`, <FaWallet className="text-orange-300" />], ["Saldo disponível", dashboard.cards.saldoDisponivel, "Saldo consolidado por conta", <FaBuildingColumns className="text-sky-300" />], ["Rendimento do período", dashboard.cards.rendimentoPeriodo, "Rentabilidade diária calculada", <FaChartLine className="text-emerald-300" />], ["Aportes do período", dashboard.cards.aportesPeriodo, "Entradas registradas", <FaArrowTrendUp className="text-violet-300" />]].map(([label, value, detail, icon]) => <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 shadow-lg"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium text-gray-400">{label}</p><p className="mt-2 text-2xl font-bold text-white">{formatBRLNumber(Number(value || 0))}</p><p className="mt-2 text-xs text-gray-500">{detail}</p></div><div className="rounded-2xl bg-white/5 p-3">{icon}</div></div></div>)}
            </section>

            <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 shadow-lg">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold text-white">Contas e saldos</h2>
                <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-gray-300">{dashboard.contas.length}</span>
              </div>
              <div className="max-h-[320px] space-y-3 overflow-y-auto pr-1">
                {dashboard.contas.map((item) => <div key={item.id} className="rounded-2xl border border-orange-500/20 bg-slate-800/80 p-4"><p className="text-sm text-gray-400">{item.nome}</p><p className="mt-2 text-2xl font-bold text-emerald-400">{formatBRLNumber(Number(item.saldoAtual || 0))}</p><p className="mt-1 text-xs text-gray-500">{item.quantidadeAplicacoes} aplicações nesta conta</p></div>)}
              </div>
            </section>
          </aside>

          <div className="grid gap-5">
            <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 shadow-lg">
              <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-white">Movimentações do período</h2>
                  <p className="text-sm text-gray-400">Tabela operacional no estilo do fluxo de caixa, incluindo rentabilidade diária.</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="rounded-full bg-white/5 px-4 py-2 text-sm text-gray-300">{dashboard.movimentacoes.length} registros</span>
                  <button onClick={() => openMov()} className="rounded-2xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-400">Novo lançamento</button>
                </div>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-white/10 bg-slate-900/60">
                <table className="min-w-full text-left text-sm">
                  <thead className="sticky top-0 z-10 bg-slate-700">
                    <tr className="text-gray-300">
                      <th className="px-3 py-3 font-semibold">Data</th>
                      <th className="px-3 py-3 font-semibold">Descrição</th>
                      <th className="px-3 py-3 font-semibold">Aplicação</th>
                      <th className="px-3 py-3 font-semibold">Conta</th>
                      <th className="px-3 py-3 font-semibold">Tipo</th>
                      <th className="px-3 py-3 text-right font-semibold">Valor</th>
                      <th className="px-3 py-3 text-right font-semibold">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {movimentacoesPaginadas.length > 0 ? movimentacoesPaginadas.map((mov) => (
                      <tr key={mov.id} className="text-gray-200 hover:bg-white/[0.03]">
                        <td className="px-3 py-3 whitespace-nowrap font-semibold text-white">{formatDate(mov.data_movimento)}</td>
                        <td className="px-3 py-3 max-w-[220px] truncate">{mov.descricao}</td>
                        <td className="px-3 py-3 max-w-[90px] truncate text-gray-200">{mov.aplicacao_nome}</td>
                        <td className="px-3 py-3 max-w-[170px] truncate text-gray-400">{mov.conta_nome}</td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${(mov.origem === "transferencia" ? tipos.transferencia : tipos[mov.tipo])?.[1] || "border border-white/10 bg-white/10 text-gray-200"}`}>{(mov.origem === "transferencia" ? tipos.transferencia : tipos[mov.tipo])?.[0] || mov.tipo}</span>
                            <span className="text-xs text-gray-500">{mov.origem === "calculada" ? "Automático" : mov.origem === "transferencia" ? "Transferência" : "Manual"}</span>
                          </div>
                        </td>
                        <td className={`px-3 py-3 whitespace-nowrap text-right text-base font-bold ${Number(mov.valor) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{Number(mov.valor) >= 0 ? "" : "-"}{formatBRLNumber(Math.abs(Number(mov.valor || 0)))}</td>
                        <td className="px-3 py-3 text-right whitespace-nowrap">
                          {mov.origem === "manual" ? (
                            <div className="inline-flex gap-2">
                              <button onClick={() => openMov(mov)} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-gray-200 transition hover:bg-white/10">Editar</button>
                              <button onClick={() => setDeleteState({ kind: "movimentacao", item: mov })} className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300 transition hover:bg-red-500/20">Excluir</button>
                            </div>
                          ) : mov.origem === "transferencia" ? (
                            <div className="inline-flex gap-2">
                              <button onClick={() => setDeleteState({ kind: "movimentacao", item: mov })} className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300 transition hover:bg-red-500/20">Excluir</button>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-500">Sem ação</span>
                          )}
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan="7" className="px-4 py-10 text-center text-gray-400">Nenhuma movimentação encontrada para os filtros aplicados.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <Pagination totalItems={dashboard.movimentacoes.length} itemsPerPage={itemsPerPage} currentPage={movPage} onPageChange={setMovPage} />
            </section>

            <section className="grid gap-5 2xl:grid-cols-[minmax(0,1.2fr)_320px]">
              <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 shadow-lg">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-white">Aplicações e posição atual</h2>
                    <p className="text-sm text-gray-400">Visão resumida das aplicações sem tomar o espaço da tabela.</p>
                  </div>
                  <span className="rounded-full bg-white/5 px-4 py-2 text-sm text-gray-300">{dashboard.aplicacoes.length} registros</span>
                </div>
                <div className="space-y-3">
                  {dashboard.aplicacoes.map((aplicacao) => <article key={aplicacao.id} className="rounded-2xl border border-white/10 bg-slate-900/70 p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate text-lg font-bold text-white">{aplicacao.nome}</h3><p className="mt-1 truncate text-sm text-gray-400">{aplicacao.contaLabel}</p></div><span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${!aplicacao.ativa ? "bg-gray-700/70 text-gray-300" : !aplicacao.rende_juros ? "bg-amber-500/10 text-amber-300" : "bg-emerald-500/10 text-emerald-300"}`}>{!aplicacao.ativa ? "Inativa" : !aplicacao.rende_juros ? "Sem rendimento" : "Ativa"}</span></div><div className="mt-4 grid gap-3 md:grid-cols-3"><div className="rounded-2xl bg-white/5 p-4"><p className="text-xs uppercase tracking-wide text-gray-500">Saldo</p><p className="mt-2 truncate text-lg font-bold text-white">{formatBRLNumber(Number(aplicacao.saldoAtual || 0))}</p></div><div className="rounded-2xl bg-white/5 p-4"><p className="text-xs uppercase tracking-wide text-gray-500">Rendimento</p><p className="mt-2 truncate text-lg font-bold text-emerald-400">{formatBRLNumber(Number(aplicacao.rendimentoPeriodo || 0))}</p></div><div className="rounded-2xl bg-white/5 p-4"><p className="text-xs uppercase tracking-wide text-gray-500">Estimativa</p><p className="mt-2 truncate text-lg font-bold text-cyan-300">{formatBRLNumber(Number(aplicacao.rentabilidadeDiariaEstimada || 0))}</p></div></div><div className="mt-3 text-sm text-gray-400">{Number(aplicacao.percentual_juros_mensal || 0).toFixed(4)}% ao mês em {aplicacao.base_dias === "uteis" ? "dias úteis" : "dias corridos"}</div></article>)}
                </div>
              </section>

              <div className="space-y-5">
                <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 shadow-lg">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h2 className="text-xl font-bold text-white">Evolução dos rendimentos</h2>
                      <p className="text-sm text-gray-400">Últimos 6 meses</p>
                    </div>
                    <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-sm font-semibold text-emerald-300">Automático</span>
                  </div>
                  <div className="overflow-hidden rounded-3xl bg-slate-950/70 p-4">
                    <div className="grid grid-cols-2 gap-3">
                      {dashboard.evolucao.map((item) => (
                        <div key={item.mes} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{item.mes}</div>
                          <div className="mt-2 text-lg font-bold text-white">{formatBRLNumber(Number(item.valor || 0))}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}

