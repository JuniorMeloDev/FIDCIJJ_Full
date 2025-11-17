"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { motion } from "framer-motion";
import LancamentoModal from "@/app/components/LancamentoModal";
import EditLancamentoModal from "@/app/components/EditLancamentoModal";
import Notification from "@/app/components/Notification";
import ConfirmacaoModal from "@/app/components/ConfirmacaoModal";
import EmailModal from "@/app/components/EmailModal";
import { formatBRLNumber, formatDate, formatDisplayConta } from "@/app/utils/formatters";
import FiltroLateral from "@/app/components/FiltroLateral";
import Pagination from "@/app/components/Pagination";
import { FaSort, FaSortUp, FaSortDown } from "react-icons/fa";
import ComplementModal from "@/app/components/ComplementModal";
import ConfirmacaoEstornoModal from "@/app/components/ConfirmacaoEstornoModal";
import { format as formatDateFns, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import ConciliacaoModal from "@/app/components/ConciliacaoModal";
import PixReceiptModal from "@/app/components/PixReceiptModal";
import LancamentoExtratoModal from "@/app/components/LancamentoExtratoModal";
// --- CORREÇÃO: Importar o PixConfirmationModal ---
import PixConfirmationModal from "@/app/components/PixConfirmationModal";

const ITEMS_PER_PAGE = 8;
const INTER_ITEMS_PER_PAGE = 2;
const OFX_ITEMS_PER_PAGE = 6;

export default function FluxoDeCaixaPage() {
  const [movimentacoes, setMovimentacoes] = useState([]);
  const [saldos, setSaldos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [notification, setNotification] = useState({ message: "", type: "" });
  const [operacaoParaEmail, setOperacaoParaEmail] = useState(null);
  const [itemParaExcluir, setItemParaExcluir] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [interCurrentPage, setInterCurrentPage] = useState(1);
  const [contasMaster, setContasMaster] = useState([]);
  const [clienteMasterInfo, setClienteMasterInfo] = useState({
    nome: "",
    cnpj: "",
  });

  const [filters, setFilters] = useState({
    dataInicio: formatDateFns(startOfMonth(new Date()), "yyyy-MM-dd"),
    dataFim: formatDateFns(new Date(), "yyyy-MM-dd"),
    descricao: "",
    contaBancaria: "",
    categoria: "Todos",
    contaExterna: "",
  });

  const [sortConfig, setSortConfig] = useState({
    key: "data_movimento",
    direction: "DESC",
  });
  const [contextMenu, setContextMenu] = useState({
    visible: false,
    x: 0,
    y: 0,
    selectedItem: null,
  });
  const menuRef = useRef(null);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [itemParaEditar, setItemParaEditar] = useState(null);
  const [isComplementModalOpen, setIsComplementModalOpen] = useState(false);
  const [lancamentoParaComplemento, setLancamentoParaComplemento] =
    useState(null);
  const [estornoInfo, setEstornoInfo] = useState(null);
  const [interSaldo, setInterSaldo] = useState(null);
  const [interExtrato, setInterExtrato] = useState(null);
  const [isConciliacaoModalOpen, setIsConciliacaoModalOpen] = useState(false);
  const [transacaoParaConciliar, setTransacaoParaConciliar] = useState(null);
  const [reconciledTransactionIds, setReconciledTransactionIds] = useState(
    new Set()
  );

  // --- CORREÇÃO: Adicionar states para os modais de PIX ---
  const [isSaving, setIsSaving] = useState(false);
  const [isPixConfirmOpen, setIsPixConfirmOpen] = useState(false);
  const [pixPayload, setPixPayload] = useState(null);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [receiptData, setReceiptData] = useState(null);
  // --- FIM DA CORREÇÃO ---

  const [isLancamentoManualOpen, setIsLancamentoManualOpen] = useState(false);
  const [ofxExtrato, setOfxExtrato] = useState(null);
  const [isLoadingOfx, setIsLoadingOfx] = useState(false);
  const [ofxError, setOfxError] = useState(null);
  const [ofxPage, setOfxPage] = useState(1);

  // ... (handleOfxUpload, getAuthHeader, showNotification, fetchApiData, fetchMovimentacoes, fetchSaldos, fetchExtratoInter, useEffect estático... permanecem iguais) ...
  const handleOfxUpload = async (file) => {
    setIsLoadingOfx(true);
    setOfxError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/upload/ofx", {
        method: "POST",
        headers: getAuthHeader(), // não setar Content-Type quando enviar FormData
        body: formData,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.message || "Falha ao processar arquivo OFX.");
      }

      const data = await response.json();

      // Normaliza nomes e garante campo de data/descrição/valor
      const normalized = (data.transacoes || []).map((t) => ({
        idTransacao: t.idTransacao || t.FITID || `${t.DTPOSTED}-${t.TRNAMT}`,
        dataEntrada: t.dataEntrada || t.DTPOSTED || t.data || null,
        dataMovimento: t.dataEntrada || t.DTPOSTED || t.data || null,
        descricao: t.descricao || t.MEMO || t.name || "",
        valor: typeof t.valor === "number" ? t.valor : parseFloat(t.valor || t.TRNAMT || 0),
        tipoOperacao:
          t.tipoOperacao ||
          (parseFloat(t.valor || t.TRNAMT || 0) >= 0 ? "C" : "D"),
      }));

      setOfxExtrato({ transacoes: normalized, meta: data.meta || {} });
      setOfxPage(1);

      // Limpa estados que podem conflitar com o extrato OFX
      setMovimentacoes([]);
      setInterExtrato(null);
      setInterSaldo(null);
      setFilters(prev => ({ ...prev, contaExterna: "" })); // Limpa filtro Inter
      setCurrentPage(1);
      setInterCurrentPage(1);
    } catch (err) {
      setOfxError(err.message || "Erro ao carregar OFX.");
      showNotification(err.message || "Erro ao carregar OFX.", "error");
    } finally {
      setIsLoadingOfx(false);
    }
  };

  const getAuthHeader = () => ({
    Authorization: `Bearer ${sessionStorage.getItem("authToken")}`,
  });
  const showNotification = (message, type) => {
    setNotification({ message, type });
    setTimeout(() => setNotification({ message: "", type: "" }), 5000);
  };
  const fetchApiData = async (url) => {
    try {
      const res = await fetch(url, { headers: getAuthHeader() });
      if (!res.ok) return [];
      return await res.json();
    } catch {
      return [];
    }
  };

  const fetchMovimentacoes = async (currentFilters, currentSortConfig) => {
    setLoading(true);
    setError(null);
    setInterExtrato(null);
    setInterSaldo(null);
    
    const params = new URLSearchParams();
    if (currentFilters.dataInicio)
      params.append("dataInicio", currentFilters.dataInicio);
    if (currentFilters.dataFim)
      params.append("dataFim", currentFilters.dataFim);
    if (currentFilters.descricao)
      params.append("descricao", currentFilters.descricao);
    if (currentFilters.contaBancaria)
      params.append("conta", currentFilters.contaBancaria);
    if (currentFilters.categoria && currentFilters.categoria !== "Todos")
      params.append("categoria", currentFilters.categoria);
    params.append("sort", currentSortConfig.key);
    params.append("direction", currentSortConfig.direction);

    try {
      const response = await fetch(
        `/api/movimentacoes-caixa?${params.toString()}`,
        { headers: getAuthHeader() }
      );
      if (!response.ok) throw new Error("Falha ao carregar movimentações.");
      const data = await response.json();
      setMovimentacoes(data);
      setReconciledTransactionIds(
        new Set(data.map((m) => m.transaction_id).filter(Boolean))
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchSaldos = async (currentFilters) => {
    const params = new URLSearchParams();
    if (currentFilters.dataInicio)
      params.append("dataInicio", currentFilters.dataInicio);
    if (currentFilters.dataFim)
      params.append("dataFim", currentFilters.dataFim);
    try {
      const saldosResponse = await fetch(
        `/api/dashboard/saldos?${params.toString()}`,
        { headers: getAuthHeader() }
      );
      if (!saldosResponse.ok) throw new Error("Falha ao carregar saldos.");
      setSaldos(await saldosResponse.json());
    } catch (err) {
      showNotification(err.message, "error");
    }
  };

  const fetchExtratoInter = async (conta, dataInicio, dataFim) => {
    setLoading(true);
    setError("");
    setMovimentacoes([]);
    setInterExtrato(null);
    setInterSaldo(null);
    try {
      const [saldoRes, extratoRes] = await Promise.all([
        fetch(`/api/inter/saldo?contaCorrente=${conta}`, {
          headers: getAuthHeader(),
        }),
        fetch(
          `/api/inter/extrato?contaCorrente=${conta}&dataInicio=${dataInicio}&dataFim=${dataFim}`,
          { headers: getAuthHeader() }
        ),
      ]);

      const saldoData = await saldoRes.json();
      if (!saldoRes.ok)
        throw new Error(
          `Erro ${saldoRes.status} ao consultar saldo: ${
            saldoData.detail || saldoData.message
          }`
        );

      const extratoData = await extratoRes.json();
      if (!extratoRes.ok)
        throw new Error(
          `Erro ${extratoRes.status} ao consultar extrato: ${
            extratoData.detail || extratoData.message
          }`
        );

      setInterSaldo(saldoData);
      setInterExtrato(extratoData);
    } catch (err) 
    {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const fetchStaticData = async () => {
      try {
        const headers = getAuthHeader();
        const [masterContasResponse, clientesResponse] = await Promise.all([
          fetch(`/api/cadastros/contas/master`, { headers }),
          fetch(`/api/cadastros/clientes`, { headers }),
        ]);
        if (!masterContasResponse.ok || !clientesResponse.ok)
          throw new Error("Falha ao carregar dados para o modal.");
        const masterContasData = await masterContasResponse.json();
        const clientesData = await clientesResponse.json();
        const masterContasFormatadas = masterContasData.map((c) => ({
          id: c.id,
          banco: c.banco,
          agencia: c.agencia,
          contaCorrente: c.conta_corrente,
          contaBancaria: `${c.banco} - ${c.agencia}/${c.conta_corrente}`,
        }));
        setContasMaster(masterContasFormatadas);
        const masterClientId = parseInt(process.env.NEXT_PUBLIC_MASTER_CLIENT_ID, 10);
        let clientePagador;
        if (masterClientId) {
            clientePagador = clientesData.find(c => c.id === masterClientId);
        }
        if (clientePagador) {
          setClienteMasterInfo({
            nome: clientePagador.nome,
            cnpj: clientePagador.cnpj,
          });
        } else if (clientesData.length > 0) {
           setClienteMasterInfo({
            nome: clientesData[0].nome,
            cnpj: clientesData[0].cnpj,
          });
           console.warn(`Cliente master com ID (${masterClientId}) não encontrado. Usando fallback (primeiro cliente).`);
        }
      } catch (err) {
        console.error(err.message);
      }
    };
    fetchStaticData();
  }, []);

  useEffect(() => {
    fetchSaldos(filters);
    
    if (filters.contaExterna) {
      setOfxExtrato(null);
      if (filters.dataInicio && filters.dataFim) {
        fetchExtratoInter(
          filters.contaExterna,
          filters.dataInicio,
          filters.dataFim
        );
      } else {
        setLoading(false);
        setMovimentacoes([]);
      }
    } else if (ofxExtrato) {
      setLoading(true);
      setMovimentacoes([]);
      setInterExtrato(null);
      setInterSaldo(null);
      setLoading(false);
    } else {
      fetchMovimentacoes(filters, sortConfig);
    }
  }, [filters, sortConfig, ofxExtrato]);

  useEffect(() => {
    const handleClick = () =>
      setContextMenu((prev) => ({ ...prev, visible: false }));
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);
  
  // ... (searchDuplicatasParaConciliacao, handleConciliarTransacao, handleConfirmarConciliacao, interExtratoProcessado, formatHeaderDate, handleSort, getSortIcon, clearFilters, handleFilterChange... permanecem iguais) ...
  const searchDuplicatasParaConciliacao = async (query) => {
    if (!query) return [];
    try {
      const response = await fetch(
        `/api/duplicatas/search-conciliacao?query=${query}`,
        { headers: getAuthHeader() }
      );
      if (!response.ok) return [];
      return await response.json();
    } catch (err) {
      showNotification("Erro ao buscar duplicatas.", "error");
      return [];
    }
  };

  const handleConciliarTransacao = (transacao) => {
    if (reconciledTransactionIds.has(transacao.idTransacao)) {
        showNotification(
            "Esta transação já foi conciliada. Para refazer, primeiro estorne o lançamento correspondente.",
            "error"
        );
        return;
    }
    setTransacaoParaConciliar({
        id: transacao.idTransacao,
        data: transacao.dataEntrada || transacao.dataMovimento,
        descricao: transacao.descricao,
        valor: parseFloat(transacao.valor),
    });
    setIsLancamentoManualOpen(true);
  };

  const handleConfirmarConciliacao = async ({ items, detalhesTransacao, contaDestino }) => {
    try {
      const contaSelecionada = filters.contaExterna || contaDestino;
      if ((!items || items.length === 0) || (detalhesTransacao.valor < 0)) {
        const payload = {
          data_movimento: detalhesTransacao.data,
          descricao: detalhesTransacao.descricao || (detalhesTransacao.valor < 0 ? "Despesa OFX" : "Receita OFX"),
          valor: detalhesTransacao.valor,
          conta_bancaria: contaSelecionada,
          categoria: detalhesTransacao.categoria || (detalhesTransacao.valor < 0 ? "Despesa Avulsa" : "Receita Avulsa"),
          transaction_id: detalhesTransacao.id,
        };

        const resp = await fetch(`/api/lancamentos/conciliar-manual`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeader() },
          body: JSON.stringify(payload),
        });

        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          throw new Error(err.message || "Falha ao salvar lançamento manual.");
        }

        showNotification("Lançamento manual conciliado com sucesso!", "success");
        fetchMovimentacoes(filters, sortConfig);
        fetchSaldos(filters);
        if (ofxExtrato) {
          setOfxExtrato(prev => {
            if (!prev) return prev;
            return {
              ...prev,
              transacoes: prev.transacoes.filter(t => t.idTransacao !== detalhesTransacao.id)
            };
          });
        }
        setIsConciliacaoModalOpen(false);
        return;
      }

      const response = await fetch(`/api/duplicatas/conciliar-pagamento`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({
          items,
          detalhesTransacao,
          contaBancaria: contaSelecionada,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Falha ao conciliar o pagamento.");
      }

      showNotification("Pagamento conciliado e duplicatas baixadas com sucesso!", "success");
      clearFilters();
      fetchMovimentacoes(filters, sortConfig);
      fetchSaldos(filters);

      if (!filters.contaExterna && ofxExtrato) {
        setOfxExtrato(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            transacoes: prev.transacoes.filter(t => t.idTransacao !== detalhesTransacao.id)
          };
        });
      }

      setIsConciliacaoModalOpen(false);
    } catch (err) {
      showNotification(err.message || "Erro na conciliação.", "error");
    }
  };

  const interExtratoProcessado = useMemo(() => {
    if (!interExtrato?.transacoes || !interSaldo) return [];
    const groupedByDate = interExtrato.transacoes.reduce((acc, t) => {
      const date = t.dataEntrada;
      if (!acc[date]) acc[date] = [];
      acc[date].push(t);
      return acc;
    }, {});
    const sortedDates = Object.keys(groupedByDate).sort(
      (a, b) => new Date(b) - new Date(a)
    );
    let runningBalance = interSaldo.disponivel;
    return sortedDates.map((date) => {
      const transactions = groupedByDate[date];
      const dailyBalance = runningBalance;
      const netChange = transactions.reduce((sum, t) => {
        const value = parseFloat(t.valor);
        return t.tipoOperacao === "C" ? sum + value : sum - value;
      }, 0);
      runningBalance -= netChange;
      return { date, transactions, dailyBalance };
    });
  }, [interExtrato, interSaldo]);

  const formatHeaderDate = (dateString) =>
    formatDateFns(
      new Date(dateString + "T12:00:00Z"),
      "EEEE, d 'de' MMMM 'de' yyyy",
      { locale: ptBR }
    );

  const handleSort = (key) => {
    let direction = "ASC";
    if (sortConfig.key === key && sortConfig.direction === "ASC") {
      direction = "DESC";
    }
    setCurrentPage(1);
    setSortConfig({ key, direction });
  };

  const getSortIcon = (key) => {
    if (sortConfig.key !== key) return <FaSort className="text-gray-400" />;
    if (sortConfig.direction === "ASC") return <FaSortUp />;
    return <FaSortDown />;
  };

  const clearFilters = () => {
    setFilters({
      dataInicio: formatDateFns(startOfMonth(new Date()), "yyyy-MM-dd"),
      dataFim: formatDateFns(new Date(), "yyyy-MM-dd"),
      descricao: "",
      contaBancaria: "",
      categoria: "Todos",
      contaExterna: "",
    });
    setOfxExtrato(null); // Limpa OFX ao limpar filtros
    setCurrentPage(1);
    setInterCurrentPage(1);
    setOfxPage(1);
  };

  const handleFilterChange = (e) => {
    setCurrentPage(1);
    setInterCurrentPage(1);
    setOfxPage(1);
    setFilters((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  // --- CORREÇÃO: Nova função para abrir o modal de confirmação ---
  const handleOpenPixConfirm = (payload) => {
    setPixPayload(payload);
    setIsModalOpen(false); // Fecha o modal de lançamento
    setIsPixConfirmOpen(true); // Abre o modal de confirmação
  };

  // --- CORREÇÃO: Nova função para lidar com a confirmação do PIX ---
  const handleConfirmAndSendPix = async () => {
    setIsSaving(true);
    setError('');
    try {
        const response = await fetch('/api/lancamentos/pix', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
            body: JSON.stringify(pixPayload)
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || 'Falha ao processar pagamento PIX.');

        // PIX ENVIADO COM SUCESSO!
        // Chama onSave(null) para indicar que o PIX foi salvo (a API /api/lancamentos/pix já salva)
        await handleSaveLancamento(null); 

        // Lógica do Recibo
        const apiResponse = result.pixResult;
        const contaOrigemCompleta = contasMaster.find(c => c.contaCorrente === pixPayload.contaOrigem)?.contaBancaria || pixPayload.contaOrigem;

        const newReceiptData = {
            valor: parseFloat(apiResponse.valor_pagamento || pixPayload.valor),
            data: new Date(apiResponse.data_pagamento || new Date()), // Usa a data da resposta ou 'agora'
            transactionId: apiResponse.cod_pagamento || apiResponse.transacaoPix?.endToEnd,
            descricao: apiResponse.informacoes_entre_usuarios || pixPayload.descricao,
            pagador: {
                nome: pixPayload.empresaAssociada || clienteMasterInfo.nome,
                cnpj: apiResponse.pagador?.documento,
                conta: contaOrigemCompleta,
            },
            recebedor: apiResponse.recebedor ? {
                nome: apiResponse.recebedor.nome,
                cnpj: apiResponse.recebedor.documento,
                instituicao: apiResponse.recebedor.banco,
                chavePix: apiResponse.recebedor.identificacao_chave
            } : null
        };

        setReceiptData(newReceiptData);
        setIsPixConfirmOpen(false);
        setIsReceiptModalOpen(true); // Abre o modal de recibo

    } catch (err) {
        showNotification(err.message, "error");
        setIsPixConfirmOpen(false);
    } finally {
        setIsSaving(false);
    }
  };


  const handleSaveLancamento = async (payload) => {
    // Se o payload for null, significa que o PIX já foi salvo pela API /api/lancamentos/pix
    // e só precisamos atualizar a UI.
    if (!payload) {
      showNotification("PIX enviado e lançamento registrado!", "success");
      fetchMovimentacoes(filters, sortConfig);
      fetchSaldos(filters);
      return true;
    }

    // Se houver payload, é um lançamento manual (Débito, Crédito, Transferência)
    try {
      const response = await fetch(`/api/lancamentos`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify(payload),
      });
      if (!response.ok)
        throw new Error(
          (await response.json()).message || "Falha ao salvar lançamento."
        );
      showNotification("Lançamento salvo com sucesso!", "success");
      fetchMovimentacoes(filters, sortConfig);
      fetchSaldos(filters);
      return true;
    } catch (error) {
      showNotification(error.message, "error");
      return false;
    }
  };

  // ... (O restante das funções: handleUpdateLancamento, handleEditRequest, handleDeleteRequest, handleConfirmDelete, handleEstornarRequest, confirmarEstorno, handleAbrirEmailModal, handleSendEmail, handleGeneratePdf, handleContextMenu, handleAbrirModalComplemento, handleSaveComplemento, handleSaveLancamentoManual, handleAbrirComprovantePix, e os 'useMemo' de paginação permanecem os mesmos) ...
  const handleUpdateLancamento = async (payload) => {
    try {
      const response = await fetch(`/api/movimentacoes-caixa/${payload.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify(payload),
      });
      if (!response.ok)
        throw new Error(
          (await response.json()).message || "Falha ao atualizar lançamento."
        );
      showNotification("Lançamento atualizado com sucesso!", "success");
      fetchMovimentacoes(filters, sortConfig);
      fetchSaldos(filters);
      return true;
    } catch (error) {
      showNotification(error.message, "error");
      return false;
    }
  };

  const handleEditRequest = () => {
    if (!contextMenu.selectedItem) return;
    setItemParaEditar(contextMenu.selectedItem);
    setIsEditModalOpen(true);
  };

  const handleDeleteRequest = () => {
    if (!contextMenu.selectedItem) return;
    setItemParaExcluir(contextMenu.selectedItem.id);
  };

  const handleConfirmDelete = async () => {
    if (!itemParaExcluir) return;
    try {
      const response = await fetch(
        `/api/movimentacoes-caixa/${itemParaExcluir}`,
        { method: "DELETE", headers: getAuthHeader() }
      );
      if (!response.ok) throw new Error("Falha ao excluir lançamento.");
      showNotification("Lançamento excluído com sucesso!", "success");
      fetchMovimentacoes(filters, sortConfig);
      fetchSaldos(filters);
    } catch (err) {
      showNotification(err.message, "error");
    } finally {
      setItemParaExcluir(null);
    }
  };

  const handleEstornarRequest = () => {
    if (!contextMenu.selectedItem) return;
    setEstornoInfo(contextMenu.selectedItem);
  };

  const confirmarEstorno = async () => {
    if (!estornoInfo || !estornoInfo.duplicata_id) {
      showNotification(
        "Erro: Lançamento não vinculado a uma duplicata para estornar.",
        "error"
      );
      setEstornoInfo(null);
      return;
    }
    try {
      const response = await fetch(
        `/api/duplicatas/${estornoInfo.duplicata_id}/estornar`,
        { method: "POST", headers: getAuthHeader() }
      );
      if (!response.ok)
        throw new Error(
          (await response.json()).message || "Falha ao estornar a liquidação."
        );
      showNotification("Liquidação estornada com sucesso!", "success");
      fetchMovimentacoes(filters, sortConfig);
      fetchSaldos(filters);
    } catch (err) {
      showNotification(err.message, "error");
    } finally {
      setEstornoInfo(null);
    }
  };

  const handleAbrirEmailModal = () => {
    if (!contextMenu.selectedItem) return;
    setOperacaoParaEmail({
      id: contextMenu.selectedItem.operacaoId,
      clienteId: contextMenu.selectedItem.operacao?.cliente_id,
    });
    setIsEmailModalOpen(true);
  };

  const handleSendEmail = async (destinatarios) => {
    if (!operacaoParaEmail) return;
    setIsSendingEmail(true);
    try {
      const response = await fetch(
        `/api/operacoes/${operacaoParaEmail.id}/enviar-email`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeader() },
          body: JSON.stringify({ destinatarios }),
        }
      );
      if (!response.ok)
        throw new Error(
          (await response.json()).message || "Falha ao enviar o e-mail."
        );
      showNotification("E-mail(s) enviado(s) com sucesso!", "success");
    } catch (err) {
      showNotification(err.message, "error");
    } finally {
      setIsSendingEmail(false);
      setIsEmailModalOpen(false);
    }
  };

  const handleGeneratePdf = async () => {
    if (!contextMenu.selectedItem?.operacaoId) {
      alert("Este lançamento não está associado a um borderô para gerar PDF.");
      return;
    }
    try {
      const response = await fetch(
        `/api/operacoes/${contextMenu.selectedItem.operacaoId}/pdf`,
        { headers: getAuthHeader() }
      );
      if (!response.ok)
        throw new Error(
          (await response.json()).message || "Não foi possível gerar o PDF."
        );
      const contentDisposition = response.headers.get("content-disposition");
      let filename = `bordero-${contextMenu.selectedItem.operacaoId}.pdf`;
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="([^"]+)"/);
        if (filenameMatch?.[1]) filename = filenameMatch[1];
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleContextMenu = (event, item) => {
    event.preventDefault();
    setContextMenu({
      visible: true,
      x: event.pageX,
      y: event.pageY,
      selectedItem: item,
    });
  };

  const handleAbrirModalComplemento = () => {
    if (!contextMenu.selectedItem) return;
    setLancamentoParaComplemento(contextMenu.selectedItem);
    setIsComplementModalOpen(true);
  };

  const handleSaveComplemento = async (payload, pixResult = null) => {
    if (!payload) {
      showNotification("PIX do complemento enviado e lançamento registrado!", "success");
      fetchMovimentacoes(filters, sortConfig);
      fetchSaldos(filters);

      if (pixResult) {
          const contaOrigem = contasMaster.find(c => c.contaCorrente === pixResult.pixPayload.contaOrigem);
          setReceiptData({
              valor: pixResult.pixPayload.valor,
              data: new Date(),
              transactionId: pixResult.pixResult.endToEndId,
              descricao: pixResult.pixPayload.descricao,
              pagador: {
                  nome: clienteMasterInfo.nome,
                  cnpj: clienteMasterInfo.cnpj,
                  conta: contaOrigem?.contaBancaria || pixResult.pixPayload.contaOrigem,
              }
          });
          setIsReceiptModalOpen(true);
      }
      return true;
    }

    try {
        const response = await fetch(`/api/operacoes/complemento`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...getAuthHeader() },
            body: JSON.stringify(payload),
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || "Falha ao salvar complemento.");
        }
        showNotification("Complemento do borderô salvo com sucesso!", "success");
        fetchMovimentacoes(filters, sortConfig);
        fetchSaldos(filters);
        return true;
    } catch (error) {
        showNotification(error.message, "error");
        return false;
    }
  };

  const handleSaveLancamentoManual = async (payload) => {
    try {
      const response = await fetch('/api/lancamentos/conciliar-manual', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader()
        },
        body: JSON.stringify(payload)
      });
  
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Erro ao salvar lançamento');
      }
  
      showNotification('Lançamento manual realizado com sucesso!', 'success');
      fetchMovimentacoes(filters, sortConfig);
      fetchSaldos(filters);
      
      if (ofxExtrato) {
          setOfxExtrato(prev => ({
              ...prev,
              transacoes: prev.transacoes.filter(t => t.idTransacao !== payload.transaction_id)
          }));
      }
  
      return true;
    } catch (err) {
      showNotification(err.message || 'Erro ao salvar lançamento', 'error');
      return false;
    }
  };

  const handleAbrirComprovantePix = async () => {
    if (!contextMenu.selectedItem) return;
    const item = contextMenu.selectedItem;

    const isManualPix = item.categoria === 'Pagamento PIX';
    const isOperacaoPix = item.categoria === 'Pagamento de Borderô' && item.transaction_id;

    let filename = '';
    let recebedorData = {};
    let mensagem = item.descricao;

    if (isOperacaoPix && item.operacao) {
        const op = item.operacao;
        const valorFormatado = formatBRLNumber(Math.abs(item.valor)).replace(/\s/g, '');
        const { data: duplicatas } = await fetchApiData(`/api/duplicatas/operacao/${item.operacaoId}`);
        let numerosDoc = 'N/A';
        if (duplicatas && duplicatas.length > 0) {
            numerosDoc = [...new Set(duplicatas.map(d => d.nfCte.split('.')[0]))].join('_');
        }
        const docType = op?.cliente?.ramo_de_atividade === 'Transportes' ? 'CTe' : 'NF';
        const prefixo = item.descricao.toLowerCase().includes('complemento') ? 'Complemento Borderô' : 'Borderô';
        filename = `${prefixo} ${docType} ${numerosDoc} - ${valorFormatado}.pdf`;
        mensagem = `Pagamento ref. Operação #${item.operacaoId}`;
        if (op && op.cliente) {
            const recebedorContas = op.cliente.contas_bancarias || [];
            const contaRecebedor = recebedorContas.find(c => c.chave_pix) || recebedorContas[0] || {};
            recebedorData = {
                nome: op.cliente.nome,
                cnpj: op.cliente.cnpj,
                instituicao: contaRecebedor.banco,
                chavePix: contaRecebedor.chave_pix
            };
        }
    } else if (isManualPix) {
        const valorFormatado = formatBRLNumber(Math.abs(item.valor)).replace(/\s/g, '');
        filename = `Comprovante PIX - ${item.descricao} - ${valorFormatado}.pdf`;
        recebedorData = { nome: item.empresaAssociada };
        mensagem = item.descricao;
    }

    setReceiptData({
        valor: Math.abs(item.valor),
        data: new Date(item.dataMovimento + 'T12:00:00Z'),
        transactionId: item.transaction_id,
        descricao: mensagem,
        filename: filename,
        pagador: {
            nome: clienteMasterInfo.nome,
            cnpj: clienteMasterInfo.cnpj,
            conta: item.contaBancaria,
        },
        recebedor: recebedorData
    });
    setIsReceiptModalOpen(true);
  };

  const indexOfLastItem = currentPage * ITEMS_PER_PAGE;
  const indexOfFirstItem = indexOfLastItem - ITEMS_PER_PAGE;
  const currentItems = movimentacoes.slice(indexOfFirstItem, indexOfLastItem);
  const saldosTitle =
    filters.dataInicio && filters.dataFim
      ? "Resultado do Período"
      : "Saldos Atuais";

  const interIndexOfLastItem = interCurrentPage * INTER_ITEMS_PER_PAGE;
  const interIndexOfFirstItem = interIndexOfLastItem - INTER_ITEMS_PER_PAGE;
  const currentInterItems = interExtratoProcessado.slice(
    interIndexOfFirstItem,
    interIndexOfLastItem
  );

  const ofxTotalPages = ofxExtrato ? Math.ceil((ofxExtrato.transacoes.length || 0) / OFX_ITEMS_PER_PAGE) : 0;
  const ofxStartIndex = (ofxPage - 1) * OFX_ITEMS_PER_PAGE;
  const ofxCurrentItems = ofxExtrato ? ofxExtrato.transacoes.slice(ofxStartIndex, ofxStartIndex + OFX_ITEMS_PER_PAGE) : [];

  return (
    <>
      <Notification
        message={notification.message}
        type={notification.type}
        onClose={() => setNotification({ message: "", type: "" })}
      />
      <LancamentoModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveLancamento}
        onPixSubmit={handleOpenPixConfirm} 
        contasMaster={contasMaster}
        clienteMasterNome={clienteMasterInfo.nome}
      />
      {/* --- CORREÇÃO: Renderizar os modais de PIX aqui --- */}
      <PixConfirmationModal
          isOpen={isPixConfirmOpen}
          onClose={() => setIsPixConfirmOpen(false)}
          onConfirm={handleConfirmAndSendPix}
          data={pixPayload}
          isSending={isSaving}
      />
      <PixReceiptModal
          isOpen={isReceiptModalOpen}
          onClose={() => setIsReceiptModalOpen(false)}
          receiptData={receiptData}
      />
      {/* --- FIM DA CORREÇÃO --- */}

      <ConciliacaoModal
        isOpen={isConciliacaoModalOpen}
        onClose={() => setIsConciliacaoModalOpen(false)}
        onConfirm={handleConfirmarConciliacao}
        transacao={transacaoParaConciliar}
        searchDuplicatas={searchDuplicatasParaConciliacao}
        contasInternas={saldos} 
        contaApi={filters.contaExterna}
      />
      <EditLancamentoModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onSave={handleUpdateLancamento}
        lancamento={itemParaEditar}
        contasMaster={contasMaster}
      />
      <ConfirmacaoModal
        isOpen={!!itemParaExcluir}
        onClose={() => setItemParaExcluir(null)}
        onConfirm={handleConfirmDelete}
        title="Confirmar Exclusão"
        message="Tem a certeza que deseja excluir este lançamento? Esta ação não pode ser desfeita."
      />
      <EmailModal
        isOpen={isEmailModalOpen}
        onClose={() => setIsEmailModalOpen(false)}
        onSend={handleSendEmail}
        isSending={isSendingEmail}
        clienteId={operacaoParaEmail?.clienteId}
      />
      <ConfirmacaoEstornoModal
        isOpen={!!estornoInfo}
        onClose={() => setEstornoInfo(null)}
        onConfirm={confirmarEstorno}
        item={estornoInfo}
      />
      <ComplementModal
        isOpen={isComplementModalOpen}
        onClose={() => setIsComplementModalOpen(false)}
        onSave={handleSaveComplemento}
        lancamentoOriginal={lancamentoParaComplemento}
        contasMaster={contasMaster}
        clienteMasterNome={clienteMasterInfo.nome}
      />      
      <LancamentoExtratoModal
        isOpen={isLancamentoManualOpen}
        onClose={() => setIsLancamentoManualOpen(false)}
        onSave={handleSaveLancamentoManual}
        transacao={transacaoParaConciliar}
        contasInternas={saldos}
        showNotification={showNotification}
      />

      <main className="h-full flex flex-col p-6 bg-gradient-to-br from-gray-900 to-gray-800 text-white">
        {/* ... (o restante do JSX da página permanece o mesmo) ... */}
        <div className="flex-shrink-0">
          <motion.header
            className="mb-4 flex flex-col md:flex-row justify-between md:items-center border-b-2 border-orange-500 pb-4"
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
          >
            <div className="mb-4 md:mb-0">
              <h1 className="text-3xl font-bold">Fluxo de Caixa</h1>
              <p className="text-sm text-gray-300">
                Visão geral das suas movimentações financeiras.
              </p>
            </div>
            <button
              onClick={() => setIsModalOpen(true)}
              className="bg-orange-500 text-white font-semibold py-2 px-4 rounded-md shadow-sm hover:bg-orange-600 transition w-full md:w-auto"
            >
              + Novo Lançamento
            </button>
          </motion.header>
        </div>

        <div className="flex-grow flex flex-col lg:flex-row gap-6 min-h-0">
          <div className="w-full lg:w-72 flex-shrink-0 flex flex-col gap-4 lg:overflow-y-auto lg:max-h-[calc(100vh-160px)] pr-2">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              <h2 className="text-lg font-semibold text-gray-100 mb-2">
                {saldosTitle}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4 pr-2">
                {saldos
                  .filter(saldo => saldo.saldo !== 0) // Adiciona o filtro aqui
                  .map((saldo, index) => (
                  <div
                    key={index}
                    className="bg-gray-800 p-3 rounded-lg shadow-lg border-l-4 border-orange-500"
                  >
                    <p className="text-sm text-gray-400 truncate">
                      {formatDisplayConta(saldo.contaBancaria)}
                    </p>
                    <p
                      className={`text-xl font-bold ${
                        saldo.saldo >= 0 ? "text-green-400" : "text-red-400"
                      }`}
                    >
                      {formatBRLNumber(saldo.saldo)}
                    </p>
                  </div>
                ))}
              </div>
            </motion.div>
            
            <FiltroLateral
              filters={filters}
              saldos={saldos}
              contasMaster={contasMaster}
              onFilterChange={handleFilterChange}
              onClear={clearFilters}
              onOfxUpload={handleOfxUpload}
              ofxExtrato={ofxExtrato}
              onOfxClear={() => setOfxExtrato(null)}
            />
          </div>

          <div className="w-full flex-grow bg-gray-800 p-4 rounded-lg shadow-md flex flex-col min-w-0">
            {(error || ofxError) && <p className="text-red-400 text-center py-10">{error || ofxError}</p>}
            {(loading || isLoadingOfx) && (
              <p className="text-center py-10 text-gray-400">A carregar...</p>
            )}

            {!loading && !isLoadingOfx && !error && !ofxError && (
              <>
                {filters.contaExterna || ofxExtrato ? (
                  <>
                    <div className="flex-grow overflow-y-auto">
                      {ofxExtrato ? (
                        <>
                          {ofxCurrentItems.length > 0 ? (
                            <div className="space-y-4">
                              {ofxCurrentItems.map((t, index) => (
                                <li
                                  key={t.idTransacao || index}
                                  className={`py-2 px-2 rounded flex justify-between items-center text-sm list-none ${
                                    reconciledTransactionIds.has(t.idTransacao)
                                      ? "cursor-not-allowed opacity-50 bg-gray-700/50"
                                      : "cursor-pointer hover:bg-gray-600/50"
                                  }`}
                                  onContextMenu={(e) => {
                                    e.preventDefault();
                                    handleConciliarTransacao(t);
                                  }}
                                >
                                  <div>
                                    <p className={`font-semibold ${
                                      t.tipoOperacao === "C" ? "text-green-400" : "text-red-400"
                                    }`}>
                                      {t.descricao}
                                    </p>
                                    <div className="text-xs text-gray-300">
                                      {t.dataEntrada || t.dataMovimento ? formatDate(t.dataEntrada || t.dataMovimento) : "Data N/D"}
                                    </div>
                                  </div>
                                  <span className={`font-bold ${
                                    t.tipoOperacao === "C" ? "text-green-400" : "text-red-400"
                                  }`}>
                                    {t.tipoOperacao === "D" ? "-" : "+"}
                                    {formatBRLNumber(parseFloat(t.valor))}
                                  </span>
                                </li>
                              ))}
                              {ofxTotalPages > 1 && (
                                <div className="flex items-center justify-center gap-2 pt-3">
                                  <button
                                    disabled={ofxPage <= 1}
                                    onClick={() => setOfxPage(p => Math.max(1, p - 1))}
                                    className="px-3 py-1 bg-gray-700 rounded disabled:opacity-50"
                                  >
                                    Anterior
                                  </button>
                                  <span className="text-xs text-gray-300">
                                    Página {ofxPage} de {ofxTotalPages}
                                  </span>
                                  <button
                                    disabled={ofxPage >= ofxTotalPages}
                                    onClick={() => setOfxPage(p => Math.min(ofxTotalPages, p + 1))}
                                    className="px-3 py-1 bg-gray-700 rounded disabled:opacity-50"
                                  >
                                    Próxima
                                  </button>
                                </div>
                              )}
                            </div>
                          ) : (
                            <p className="text-center py-10 text-gray-400">
                              Nenhuma transação encontrada no arquivo OFX.
                            </p>
                          )}
                        </>
                      ) : (
                        <>
                          {currentInterItems.length > 0 ? (
                            <div className="space-y-4">
                              {currentInterItems.map((group) => (
                                <div key={group.date}>
                                  <div className="flex justify-between items-center bg-gray-600 p-2 rounded-t-md sticky top-0 z-10">
                                    <h3 className="font-semibold text-sm capitalize">
                                      {formatHeaderDate(group.date)}
                                    </h3>
                                    <span className="text-sm text-gray-300">
                                      Saldo do dia:{" "}
                                      <span className="font-bold text-white">
                                        {formatBRLNumber(group.dailyBalance)}
                                      </span>
                                    </span>
                                  </div>
                                  <ul className="divide-y divide-gray-700 bg-gray-700/50 p-2 rounded-b-md">
                                    {group.transactions.map((t, index) => (
                                      <li
                                        key={t.idTransacao || index}
                                        className={`py-2 flex justify-between items-center text-sm ${
                                          reconciledTransactionIds.has(
                                            t.idTransacao
                                          )
                                            ? "cursor-not-allowed opacity-50"
                                            : "cursor-pointer hover:bg-gray-600/50"
                                        }`}
                                        onContextMenu={(e) => {
                                          e.preventDefault();
                                          handleConciliarTransacao(t);
                                        }}
                                      >
                                        <div>
                                          <p
                                            className={`font-semibold ${
                                              t.tipoOperacao === "C"
                                                ? "text-green-400"
                                                : "text-red-400"
                                            }`}
                                          >
                                            {t.descricao}
                                          </p>
                                          <p className="text-gray-400 text-xs">
                                            {t.titulo}
                                          </p>
                                        </div>
                                        <span
                                          className={`font-bold ${
                                            t.tipoOperacao === "C"
                                              ? "text-green-400"
                                              : "text-red-400"
                                          }`}
                                        >
                                          {t.tipoOperacao === "D" ? "-" : "+"}
                                          {formatBRLNumber(parseFloat(t.valor))}
                                        </span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-center py-10 text-gray-400">
                              Nenhuma transação encontrada para o período e conta
                              selecionada.
                            </p>
                          )}
                        </>
                      )}
                    </div>
                    <div className="flex-shrink-0 pt-4">
                      {filters.contaExterna && !ofxExtrato && (
                        <Pagination
                          totalItems={interExtratoProcessado.length}
                          itemsPerPage={INTER_ITEMS_PER_PAGE}
                          currentPage={interCurrentPage}
                          onPageChange={(page) => setInterCurrentPage(page)}
                        />
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex-grow overflow-auto">
                      <table className="min-w-full divide-y divide-gray-700">
                        <thead className="bg-gray-700 sticky top-0 z-10">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                              <button
                                onClick={() => handleSort("data_movimento")}
                                className="flex items-center gap-2"
                              >
                                Data {getSortIcon("data_movimento")}
                              </button>
                            </th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                              <button
                                onClick={() => handleSort("descricao")}
                                className="flex items-center gap-2"
                              >
                                Descrição {getSortIcon("descricao")}
                              </button>
                            </th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                              Conta
                            </th>
                            <th className="px-3 py-2 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">
                              <button
                                onClick={() => handleSort("valor")}
                                className="flex items-center gap-2 float-right"
                              >
                                Valor {getSortIcon("valor")}
                              </button>
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-gray-800 divide-y divide-gray-700">
                          {currentItems.length > 0 ? (
                            currentItems.map((mov) => (
                              <tr
                                key={mov.id}
                                onContextMenu={(e) => handleContextMenu(e, mov)}
                                className="hover:bg-gray-700 cursor-pointer"
                              >
                                <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-400 align-middle">
                                  {formatDate(mov.dataMovimento)}
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-100 align-middle">
                                  {mov.descricao}
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-400 align-middle">
                                  {formatDisplayConta(mov.contaBancaria)}
                                </td>
                                <td
                                  className={`px-3 py-2 whitespace-nowrap text-sm text-right font-semibold align-middle ${
                                    mov.valor >= 0
                                      ? "text-green-400"
                                      : "text-red-400"
                                  }`}
                                >
                                  {formatBRLNumber(mov.valor)}
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td
                                colSpan="4"
                                className="text-center py-10 text-gray-400"
                              >
                                Nenhuma movimentação encontrada.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex-shrink-0 pt-4">
                      <Pagination
                        totalItems={movimentacoes.length}
                        itemsPerPage={ITEMS_PER_PAGE}
                        currentPage={currentPage}
                        onPageChange={(page) => setCurrentPage(page)}
                      />
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {contextMenu.visible && !filters.contaExterna && !ofxExtrato && (
          <div
            ref={menuRef}
            style={{ top: contextMenu.y, left: contextMenu.x }}
            className="absolute origin-top-right w-56 rounded-md shadow-lg bg-gray-700 ring-1 ring-black ring-opacity-5 z-20"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="py-1">
                {contextMenu.selectedItem.categoria === "Pagamento de Borderô" && (
                    <>
                        <a href="#" onClick={(e) => { e.preventDefault(); handleAbrirModalComplemento(); }} className="block px-4 py-2 text-sm text-gray-200 hover:bg-gray-600">
                            Lançar Complemento
                        </a>
                        <a href="#" onClick={(e) => { e.preventDefault(); handleGeneratePdf(); }} className="block px-4 py-2 text-sm text-gray-200 hover:bg-gray-600">
                            Gerar PDF do Borderô
                        </a>
                        <a href="#" onClick={(e) => { e.preventDefault(); handleAbrirEmailModal(); }} className="block px-4 py-2 text-sm text-gray-200 hover:bg-gray-600">
                            Enviar Borderô por E-mail
                        </a>
                    </>
                )}

                {contextMenu.selectedItem.transaction_id && (
                    <>
                      <div className="border-t border-gray-600 my-1"></div>
                      <a href="#" onClick={(e) => { e.preventDefault(); handleAbrirComprovantePix(); }} className="block px-4 py-2 text-sm text-orange-400 hover:bg-gray-600">
                          Emitir Comprovante PIX
                      </a>
                    </>
                )}

                {contextMenu.selectedItem.categoria === "Recebimento" && (
                  <>
                    <div className="border-t border-gray-600 my-1"></div>
                    <a href="#" onClick={(e) => { e.preventDefault(); handleEstornarRequest(); }} className="block px-4 py-2 text-sm text-yellow-400 hover:bg-gray-600">
                        Estornar Liquidação
                    </a>
                  </>
                )}

                {["Despesa Avulsa", "Receita Avulsa", "Movimentação Avulsa", "Pagamento PIX"].includes(contextMenu.selectedItem.categoria) && (
                    <>
                        <div className="border-t border-gray-600 my-1"></div>
                        <a href="#" onClick={(e) => { e.preventDefault(); handleEditRequest(); }} className="block px-4 py-2 text-sm text-gray-200 hover:bg-gray-600">
                            Editar Lançamento
                        </a>
                        <a href="#" onClick={(e) => { e.preventDefault(); handleDeleteRequest(); }} className="block px-4 py-2 text-sm text-red-400 hover:bg-gray-600">
                            Excluir Lançamento
                        </a>
                    </>
                )}
            </div>
          </div>
        )}
      </main>
    </>
  );
}