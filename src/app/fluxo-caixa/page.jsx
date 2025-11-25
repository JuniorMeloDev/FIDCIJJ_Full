// type: uploaded file
// fileName: app/fluxo-caixa/page.jsx

"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { motion } from "framer-motion";
import LancamentoModal from "@/app/components/LancamentoModal";
import EditLancamentoModal from "@/app/components/EditLancamentoModal";
import Notification from "@/app/components/Notification";
import ConfirmacaoModal from "@/app/components/ConfirmacaoModal";
import EmailModal from "@/app/components/EmailModal";
import {
  formatBRLNumber,
  formatDate,
  formatDisplayConta,
} from "@/app/utils/formatters";
import FiltroLateral from "@/app/components/FiltroLateral";
import Pagination from "@/app/components/Pagination";
import { FaSort, FaSortUp, FaSortDown, FaWallet } from "react-icons/fa";
import ComplementModal from "@/app/components/ComplementModal";
import ConfirmacaoEstornoModal from "@/app/components/ConfirmacaoEstornoModal";
import { format as formatDateFns, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import ConciliacaoModal from "@/app/components/ConciliacaoModal";
import PixReceiptModal from "@/app/components/PixReceiptModal";
import LancamentoExtratoModal from "@/app/components/LancamentoExtratoModal";
import PixConfirmationModal from "@/app/components/PixConfirmationModal";
import ConciliacaoOFXModal from "../components/ConciliacaoOFXModal";

const ITEMS_PER_PAGE = 8;
const INTER_ITEMS_PER_PAGE = 2;

export default function FluxoDeCaixaPage() {
  const [movimentacoes, setMovimentacoes] = useState([]);
  const [saldoAnterior, setSaldoAnterior] = useState(0); // Novo state para saldo inicial
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

  // States para PIX
  const [isSaving, setIsSaving] = useState(false);
  const [isPixConfirmOpen, setIsPixConfirmOpen] = useState(false);
  const [pixPayload, setPixPayload] = useState(null);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [receiptData, setReceiptData] = useState(null);

  // States para Lançamento Manual e OFX
  const [isLancamentoManualOpen, setIsLancamentoManualOpen] = useState(false);
  const [ofxExtrato, setOfxExtrato] = useState(null);
  const [isLoadingOfx, setIsLoadingOfx] = useState(false);
  const [ofxError, setOfxError] = useState(null);

  // NOVOS STATES PARA O MODAL DE OFX
  const [isOfxModalOpen, setIsOfxModalOpen] = useState(false);
  const [ofxData, setOfxData] = useState([]);
  const [itemOfxParaCriar, setItemOfxParaCriar] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // --- Upload OFX Atualizado ---
  const handleOfxUpload = async (file) => {
    setIsLoadingOfx(true);
    setOfxError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/upload/ofx", {
        method: "POST",
        headers: getAuthHeader(),
        body: formData,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.message || "Falha ao processar arquivo OFX.");
      }

      const data = await response.json();

      const normalized = (data.transacoes || data).map((t) => ({
        id: t.idTransacao || t.FITID || `${t.DTPOSTED}-${t.TRNAMT}`, 
        idTransacao: t.idTransacao || t.FITID,
        data: t.dataEntrada || t.DTPOSTED || t.data || null,
        descricao: t.descricao || t.MEMO || t.name || "",
        valor:
          typeof t.valor === "number"
            ? t.valor
            : parseFloat(t.valor || t.TRNAMT || 0),
        tipoOperacao:
          t.tipoOperacao ||
          (parseFloat(t.valor || t.TRNAMT || 0) >= 0 ? "C" : "D"),
      }));

      setOfxData(normalized);
      setIsOfxModalOpen(true);
      setFilters((prev) => ({ ...prev, contaExterna: "" }));
    } catch (err) {
      setOfxError(err.message || "Erro ao carregar OFX.");
      showNotification(err.message || "Erro ao carregar OFX.", "error");
    } finally {
      setIsLoadingOfx(false);
    }
  };

  const handleConciliarManual = async (ofxItem, sysItem) => {
    showNotification(
      `Item conciliado visualmente: ${ofxItem.descricao}`,
      "success"
    );
    setReconciledTransactionIds((prev) => new Set(prev).add(ofxItem.id));
  };

  const handleCriarLancamentoDoOfx = (ofxItem, contaId) => {
    let nomeConta = '';
    if (contaId) {
        const contaObj = contasMaster.find(c => String(c.id) === String(contaId));
        if (contaObj) nomeConta = contaObj.contaBancaria;
    }

    const novoLancamento = {
      data: ofxItem.data,
      descricao: ofxItem.descricao,
      valor: ofxItem.valor,
      conta_bancaria: nomeConta, 
      categoria: "Movimentação Avulsa",
      transaction_id: ofxItem.id,
    };

    setItemOfxParaCriar(novoLancamento);
    setIsLancamentoManualOpen(true);
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
    if (currentFilters.dataInicio) params.append("dataInicio", currentFilters.dataInicio);
    if (currentFilters.dataFim) params.append("dataFim", currentFilters.dataFim);
    if (currentFilters.descricao) params.append("descricao", currentFilters.descricao);
    if (currentFilters.contaBancaria) params.append("conta", currentFilters.contaBancaria);
    if (currentFilters.categoria && currentFilters.categoria !== "Todos") params.append("categoria", currentFilters.categoria);
    params.append("sort", currentSortConfig.key);
    params.append("direction", currentSortConfig.direction);

    try {
      const response = await fetch(
        `/api/movimentacoes-caixa?${params.toString()}`,
        { headers: getAuthHeader() }
      );
      if (!response.ok) throw new Error("Falha ao carregar movimentações.");
      
      const result = await response.json();
      
      // Verifica se veio no formato novo { data, saldoAnterior } ou antigo [data]
      if (Array.isArray(result)) {
          setMovimentacoes(result);
          setSaldoAnterior(0);
          setReconciledTransactionIds(new Set(result.map((m) => m.transaction_id).filter(Boolean)));
      } else {
          setMovimentacoes(result.data || []);
          setSaldoAnterior(result.saldoAnterior || 0);
          setReconciledTransactionIds(new Set((result.data || []).map((m) => m.transaction_id).filter(Boolean)));
      }

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
      if (!saldoRes.ok) throw new Error(`Erro saldo: ${saldoData.message}`);
      const extratoData = await extratoRes.json();
      if (!extratoRes.ok)
        throw new Error(`Erro extrato: ${extratoData.message}`);

      setInterSaldo(saldoData);
      setInterExtrato(extratoData);
    } catch (err) {
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
        if (!masterContasResponse.ok || !clientesResponse.ok) return;

        const masterContasData = await masterContasResponse.json();
        const clientesData = await clientesResponse.json();

        setContasMaster(
          masterContasData.map((c) => ({
            id: c.id,
            banco: c.banco,
            agencia: c.agencia,
            contaCorrente: c.conta_corrente,
            contaBancaria: `${c.banco} - ${c.agencia}/${c.conta_corrente}`,
            descricao: c.descricao
          }))
        );

        const masterClientId = parseInt(
          process.env.NEXT_PUBLIC_MASTER_CLIENT_ID,
          10
        );
        let clientePagador = masterClientId
          ? clientesData.find((c) => c.id === masterClientId)
          : clientesData[0];

        if (clientePagador) {
          setClienteMasterInfo({
            nome: clientePagador.nome,
            cnpj: clientePagador.cnpj,
          });
        }
      } catch (err) {
        console.error(err);
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
    } else {
      fetchMovimentacoes(filters, sortConfig);
    }
  }, [filters, sortConfig]);

  useEffect(() => {
    const handleClick = () =>
      setContextMenu((prev) => ({ ...prev, visible: false }));
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  // ... (Funções auxiliares searchDuplicatasParaConciliacao, handleConciliarTransacao, handleConfirmarConciliacao, interExtratoProcessado, formatHeaderDate mantidas iguais) ...
  
  const searchDuplicatasParaConciliacao = async (query) => {
    if (!query) return [];
    try {
      const response = await fetch(
        `/api/duplicatas/search-conciliacao?query=${query}`,
        { headers: getAuthHeader() }
      );
      if (!response.ok) return [];
      return await response.json();
    } catch {
      return [];
    }
  };

  const handleConciliarTransacao = (transacao) => {
    if (reconciledTransactionIds.has(transacao.idTransacao)) {
      showNotification("Transação já conciliada.", "error");
      return;
    }
    setTransacaoParaConciliar({
      id: transacao.idTransacao,
      data: transacao.dataEntrada || transacao.dataMovimento,
      descricao: transacao.descricao,
      valor: parseFloat(transacao.valor),
    });
    setIsConciliacaoModalOpen(true);
  };

  const handleConfirmarConciliacao = async ({
    items,
    detalhesTransacao,
    contaDestino,
  }) => {
    try {
      const contaSelecionada = filters.contaExterna || contaDestino;
      if (!items || items.length === 0 || detalhesTransacao.valor < 0) {
        const payload = {
          data_movimento: detalhesTransacao.data,
          descricao: detalhesTransacao.descricao,
          valor: detalhesTransacao.valor,
          conta_bancaria: contaSelecionada,
          categoria: detalhesTransacao.categoria || "Outros",
          transaction_id: detalhesTransacao.id,
        };
        await handleSaveLancamentoManual(payload);
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

      if (!response.ok) throw new Error("Falha ao conciliar pagamento.");

      showNotification("Conciliação realizada com sucesso!", "success");
      fetchMovimentacoes(filters, sortConfig);
      fetchSaldos(filters);
      setIsConciliacaoModalOpen(false);
    } catch (err) {
      showNotification(err.message, "error");
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
      const netChange = transactions.reduce((sum, t) => {
        const value = parseFloat(t.valor);
        return t.tipoOperacao === "C" ? sum + value : sum - value;
      }, 0);
      const dailyBalance = runningBalance;
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
    if (sortConfig.key === key && sortConfig.direction === "ASC")
      direction = "DESC";
    setCurrentPage(1);
    setSortConfig({ key, direction });
  };

  const getSortIcon = (key) => {
    if (sortConfig.key !== key) return <FaSort className="text-gray-400" />;
    return sortConfig.direction === "ASC" ? <FaSortUp /> : <FaSortDown />;
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
    setOfxExtrato(null);
    setCurrentPage(1);
  };

  const handleFilterChange = (e) => {
    setCurrentPage(1);
    setFilters((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleOpenPixConfirm = (payload) => {
    setPixPayload(payload);
    setIsModalOpen(false);
    setIsPixConfirmOpen(true);
  };

  // ... (handleConfirmAndSendPix, handleSaveLancamento, handleSaveLancamentoManual, etc. mantidas iguais) ...
  
  const handleConfirmAndSendPix = async () => {
    setIsSaving(true);
    setError("");
    try {
      const response = await fetch("/api/lancamentos/pix", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify(pixPayload),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.message || "Falha ao processar PIX.");

      await handleSaveLancamento(null);

      const apiResponse = result.pixResult;
      const contaOrigemCompleta =
        contasMaster.find((c) => c.contaCorrente === pixPayload.contaOrigem)
          ?.contaBancaria || pixPayload.contaOrigem;

      setReceiptData({
        valor: parseFloat(apiResponse.valor_pagamento || pixPayload.valor),
        data: new Date(),
        transactionId:
          apiResponse.cod_pagamento || apiResponse.transacaoPix?.endToEnd,
        descricao:
          apiResponse.informacoes_entre_usuarios || pixPayload.descricao,
        pagador: {
          nome: pixPayload.empresaAssociada || clienteMasterInfo.nome,
          cnpj: apiResponse.pagador?.documento,
          conta: contaOrigemCompleta,
        },
        recebedor: apiResponse.recebedor
          ? {
              nome: apiResponse.recebedor.nome,
              cnpj: apiResponse.recebedor.documento,
              instituicao: apiResponse.recebedor.banco,
              chavePix: apiResponse.recebedor.identificacao_chave,
            }
          : null,
      });

      setIsPixConfirmOpen(false);
      setIsReceiptModalOpen(true);
    } catch (err) {
      showNotification(err.message, "error");
      setIsPixConfirmOpen(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveLancamento = async (payload) => {
    if (!payload) {
      showNotification("PIX enviado e lançamento registrado!", "success");
      fetchMovimentacoes(filters, sortConfig);
      fetchSaldos(filters);
      return true;
    }
    try {
      const response = await fetch(`/api/lancamentos`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error("Falha ao salvar lançamento.");

      showNotification("Lançamento salvo com sucesso!", "success");
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
      const response = await fetch("/api/lancamentos/conciliar-manual", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Erro ao salvar lançamento");
      }

      // Atualiza a lista principal
      fetchMovimentacoes(filters, sortConfig);
      fetchSaldos(filters);

      // --- ALTERAÇÃO: Força a atualização do Modal OFX ---
      setRefreshKey(prev => prev + 1);
      // ---------------------------------------------------

      setItemOfxParaCriar(null);
      return true; // Retorna sucesso para o modal exibir a notificação e fechar
    } catch (err) {
      showNotification(err.message, "error");
      return false;
    }
  };

  const handleUpdateLancamento = async (payload) => {
    try {
      const response = await fetch(`/api/movimentacoes-caixa/${payload.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error("Falha ao atualizar.");
      showNotification("Atualizado com sucesso!", "success");
      fetchMovimentacoes(filters, sortConfig);
      fetchSaldos(filters);
      return true;
    } catch (error) {
      return false;
    }
  };
  const handleEditRequest = () => {
    if (contextMenu.selectedItem) {
      setItemParaEditar(contextMenu.selectedItem);
      setIsEditModalOpen(true);
    }
  };
  const handleDeleteRequest = () => {
    if (contextMenu.selectedItem)
      setItemParaExcluir(contextMenu.selectedItem.id);
  };
  const handleConfirmDelete = async () => {
    try {
      await fetch(`/api/movimentacoes-caixa/${itemParaExcluir}`, {
        method: "DELETE",
        headers: getAuthHeader(),
      });
      showNotification("Excluído com sucesso!", "success");
      fetchMovimentacoes(filters, sortConfig);
      fetchSaldos(filters);
    } catch {
      showNotification("Erro ao excluir.", "error");
    }
    setItemParaExcluir(null);
  };
  const handleEstornarRequest = () => {
    if (contextMenu.selectedItem) setEstornoInfo(contextMenu.selectedItem);
  };
  const confirmarEstorno = async () => {
    try {
      await fetch(`/api/duplicatas/${estornoInfo.duplicata_id}/estornar`, {
        method: "POST",
        headers: getAuthHeader(),
      });
      showNotification("Estornado com sucesso!", "success");
      fetchMovimentacoes(filters, sortConfig);
      fetchSaldos(filters);
    } catch {
      showNotification("Erro ao estornar.", "error");
    }
    setEstornoInfo(null);
  };
  const handleAbrirEmailModal = () => {
    if (contextMenu.selectedItem) {
      setOperacaoParaEmail({
        id: contextMenu.selectedItem.operacaoId,
        clienteId: contextMenu.selectedItem.operacao?.cliente_id,
      });
      setIsEmailModalOpen(true);
    }
  };
  const handleSendEmail = async (destinatarios) => {
    setIsSendingEmail(true);
    try {
      await fetch(`/api/operacoes/${operacaoParaEmail.id}/enviar-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({ destinatarios }),
      });
      showNotification("E-mails enviados!", "success");
    } catch (err) {
      showNotification(err.message, "error");
    }
    setIsSendingEmail(false);
    setIsEmailModalOpen(false);
  };
  const handleGeneratePdf = async () => {
    const operacaoId = contextMenu.selectedItem?.operacaoId;
    if (!operacaoId) return;
    try {
      const response = await fetch(`/api/operacoes/${operacaoId}/pdf`, { headers: getAuthHeader() });
      if (!response.ok) throw new Error("Erro ao gerar PDF");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bordero-${operacaoId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
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
    if (contextMenu.selectedItem) {
      setLancamentoParaComplemento(contextMenu.selectedItem);
      setIsComplementModalOpen(true);
    }
  };
  const handleSaveComplemento = async (payload, pixResult) => {
    if (!payload) return false;
    try {
        const response = await fetch('/api/operacoes/complemento', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
            body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error("Falha ao salvar complemento.");
        showNotification("Complemento salvo!", "success");
        fetchMovimentacoes(filters, sortConfig);
        fetchSaldos(filters);
        return true;
    } catch (err) {
        showNotification(err.message, "error");
        return false;
    }
  };
  // app/fluxo-caixa/page.jsx

  const handleAbrirComprovantePix = () => {
    const item = contextMenu.selectedItem;
    if (!item) return;

    // Tenta reconstruir os dados do recebedor baseando-se na operação vinculada
    let recebedorData = null;
    
    // Se tiver operação e cliente (trazidos pelo join da API movimentacoes-caixa)
    if (item.operacao && item.operacao.cliente) {
        const cliente = item.operacao.cliente;
        
        // Tenta encontrar a conta usada (geralmente a que tem chave PIX)
        // Como o histórico não salva qual conta exata do cliente recebeu, pegamos a primeira com chave ou deixamos genérico
        const contaPix = cliente.contas_bancarias?.find(c => c.chave_pix) || {};
        
        recebedorData = {
            nome: cliente.nome,
            cnpj: cliente.cnpj,
            instituicao: contaPix.banco || 'Não informado', // Banco do recebedor
            chavePix: contaPix.chave_pix || 'Não informada'
        };
    }

    // Preenche o state que o Modal de Recibo usa
    setReceiptData({
      valor: Math.abs(item.valor), // Garante positivo
      data: item.dataMovimento, // Data do banco
      transactionId: item.transaction_id,
      descricao: item.descricao,
      pagador: {
        nome: clienteMasterInfo.nome, // Nome da sua empresa (já carregado no state)
        cnpj: clienteMasterInfo.cnpj, // CNPJ da sua empresa
        conta: item.contaBancaria,    // Conta de saída salva no lançamento
      },
      recebedor: recebedorData
    });

    setIsReceiptModalOpen(true);
  };

  // --- NOVA LÓGICA: Processar linhas de "Saldo Total Disponível" ---
  const movimentacoesProcessadas = useMemo(() => {
    if (!movimentacoes || movimentacoes.length === 0) return [];

    // 1. Clona e ordena por data CRESCENTE para calcular o acumulado corretamente
    const sorted = [...movimentacoes].sort((a, b) => new Date(a.dataMovimento) - new Date(b.dataMovimento));
    
    const groupedByDate = {};
    
    // 2. Agrupa por data
    sorted.forEach(item => {
        const date = item.dataMovimento.split('T')[0];
        if (!groupedByDate[date]) groupedByDate[date] = [];
        groupedByDate[date].push(item);
    });

    const finalIds = [];
    let runningBalance = saldoAnterior || 0; // Começa do saldo anterior vindo do backend

    // 3. Processa dia a dia
    Object.keys(groupedByDate).sort().forEach(date => {
        const itemsDoDia = groupedByDate[date];
        
        // Adiciona os itens do dia
        itemsDoDia.forEach(item => {
            runningBalance += parseFloat(item.valor);
            finalIds.push(item);
        });

        // Adiciona a linha de saldo
        finalIds.push({
            id: `saldo-${date}`,
            isBalanceRow: true,
            dataMovimento: date, // Garante que a data seja a mesma para ordenação
            descricao: 'Saldo Total Disponível',
            valor: runningBalance,
            contaBancaria: '', // Não precisa exibir conta
            categoria: 'Saldo'
        });
    });

    // 4. Re-ordena conforme a escolha do usuário
    const isAsc = sortConfig.direction === 'ASC';
    return finalIds.sort((a, b) => {
        const dateA = new Date(a.dataMovimento);
        const dateB = new Date(b.dataMovimento);
        if (dateA - dateB !== 0) return isAsc ? dateA - dateB : dateB - dateA;
        
        // Se as datas forem iguais, o saldo deve sempre ficar "no final" do dia (para ASC) ou "no começo" (para DESC)
        // Mas na visualização de extrato, o saldo do dia geralmente é a última linha do dia.
        if (a.isBalanceRow) return isAsc ? 1 : -1; 
        if (b.isBalanceRow) return isAsc ? -1 : 1;
        
        return 0;
    });

  }, [movimentacoes, saldoAnterior, sortConfig]);

  const indexOfLastItem = currentPage * ITEMS_PER_PAGE;
  const indexOfFirstItem = indexOfLastItem - ITEMS_PER_PAGE;
  
  // Usa a lista processada para paginação
  const currentItems = movimentacoesProcessadas.slice(indexOfFirstItem, indexOfLastItem);
  
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

  return (
    <>
      {/* ... (Modais permanecem iguais) ... */}
      <Notification
        message={notification.message}
        type={notification.type}
        onClose={() => setNotification({ message: "", type: "" })}
      />

      {/* MODAIS */}
      <LancamentoModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveLancamento}
        onPixSubmit={handleOpenPixConfirm}
        contasMaster={contasMaster}
        clienteMasterNome={clienteMasterInfo.nome}
      />
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
      <ConciliacaoModal
        isOpen={isConciliacaoModalOpen}
        onClose={() => setIsConciliacaoModalOpen(false)}
        onConfirm={handleConfirmarConciliacao}
        transacao={transacaoParaConciliar}
        searchDuplicatas={searchDuplicatasParaConciliacao}
        contasInternas={saldos}
        contaApi={filters.contaExterna}
        onManualEntry={() => setIsLancamentoManualOpen(true)}
      />

      <ConciliacaoOFXModal
        isOpen={isOfxModalOpen}
        onClose={() => setIsOfxModalOpen(false)}
        ofxData={ofxData}
        onConciliar={handleConciliarManual}
        onCriarLancamento={handleCriarLancamentoDoOfx}
        contas={contasMaster}
        lancamentosDoGrid={movimentacoes}
        saldoInicial={saldoAnterior}
        refreshKey={refreshKey}
      />

      <LancamentoExtratoModal
        isOpen={isLancamentoManualOpen}
        onClose={() => {
          setIsLancamentoManualOpen(false);
          setItemOfxParaCriar(null);
        }}
        onSave={handleSaveLancamentoManual}
        transacao={itemOfxParaCriar || transacaoParaConciliar}
        contasInternas={contasMaster} 
        showNotification={showNotification}
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
        message="Deseja excluir?"
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

      <main className="h-full flex flex-col p-6 bg-gradient-to-br from-gray-900 to-gray-800 text-white">
        {/* Cabeçalho e Botão Novo Lançamento */}
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
                  .filter((saldo) => saldo.saldo !== 0)
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
              onOfxClear={() => setOfxData([])}
            />
          </div>

          <div className="w-full flex-grow bg-gray-800 p-4 rounded-lg shadow-md flex flex-col min-w-0">
            {(error || ofxError) && (
              <p className="text-red-400 text-center py-10">
                {error || ofxError}
              </p>
            )}
            {(loading || isLoadingOfx) && (
              <p className="text-center py-10 text-gray-400">A carregar...</p>
            )}

            {!loading && !isLoadingOfx && !error && !ofxError && (
              <>
                {filters.contaExterna ? (
                  <>
                    {/* VISUALIZAÇÃO EXTRATO INTER API (Mantida igual) */}
                    <div className="flex-grow overflow-y-auto">
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
                                    className="py-2 flex justify-between items-center text-sm hover:bg-gray-600/50 cursor-pointer"
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
                          Nenhuma transação encontrada para o período.
                        </p>
                      )}
                    </div>
                    <div className="flex-shrink-0 pt-4">
                      <Pagination
                        totalItems={interExtratoProcessado.length}
                        itemsPerPage={INTER_ITEMS_PER_PAGE}
                        currentPage={interCurrentPage}
                        onPageChange={setInterCurrentPage}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    {/* TABELA PADRÃO DO SISTEMA - COM LINHAS DE SALDO */}
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
                            currentItems.map((mov) => {
                              // Renderização especial para a linha de Saldo
                              if (mov.isBalanceRow) {
                                return (
                                    <tr key={mov.id} className="bg-gray-900/80 font-bold border-t border-gray-600">
                                        <td className="px-3 py-2 text-sm text-gray-300 align-middle">
                                            {formatDate(mov.dataMovimento)}
                                        </td>
                                        <td className="px-3 py-2 text-sm text-orange-400 uppercase tracking-wider align-middle flex items-center gap-2">
                                            <FaWallet /> {mov.descricao}
                                        </td>
                                        <td className="px-3 py-2"></td>
                                        <td className={`px-3 py-2 text-sm text-right align-middle ${mov.valor >= 0 ? "text-blue-400" : "text-red-400"}`}>
                                            {formatBRLNumber(mov.valor)}
                                        </td>
                                    </tr>
                                );
                              }

                              // Renderização normal
                              return (
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
                              );
                            })
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
                        totalItems={movimentacoesProcessadas.length}
                        itemsPerPage={ITEMS_PER_PAGE}
                        currentPage={currentPage}
                        onPageChange={setCurrentPage}
                      />
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {contextMenu.visible && (
          <div
            ref={menuRef}
            style={{ top: contextMenu.y, left: contextMenu.x }}
            className="absolute origin-top-right w-56 rounded-md shadow-lg bg-gray-700 ring-1 ring-black ring-opacity-5 z-20"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="py-1">
              {contextMenu.selectedItem.categoria ===
                "Pagamento de Borderô" && (
                <>
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      handleAbrirModalComplemento();
                    }}
                    className="block px-4 py-2 text-sm text-gray-200 hover:bg-gray-600"
                  >
                    Lançar Complemento
                  </a>
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      handleGeneratePdf();
                    }}
                    className="block px-4 py-2 text-sm text-gray-200 hover:bg-gray-600"
                  >
                    Gerar PDF do Borderô
                  </a>
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      handleAbrirEmailModal();
                    }}
                    className="block px-4 py-2 text-sm text-gray-200 hover:bg-gray-600"
                  >
                    Enviar Borderô por E-mail
                  </a>
                </>
              )}
              {contextMenu.selectedItem.transaction_id && (
                <>
                  <div className="border-t border-gray-600 my-1"></div>
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      handleAbrirComprovantePix();
                    }}
                    className="block px-4 py-2 text-sm text-orange-400 hover:bg-gray-600"
                  >
                    Emitir Comprovante PIX
                  </a>
                </>
              )}
              {[
                "Despesa Avulsa",
                "Receita Avulsa",
                "Movimentação Avulsa",
                "Pagamento PIX",
              ].includes(contextMenu.selectedItem.categoria) && (
                <>
                  <div className="border-t border-gray-600 my-1"></div>
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      handleEditRequest();
                    }}
                    className="block px-4 py-2 text-sm text-gray-200 hover:bg-gray-600"
                  >
                    Editar Lançamento
                  </a>
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      handleDeleteRequest();
                    }}
                    className="block px-4 py-2 text-sm text-red-400 hover:bg-gray-600"
                  >
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