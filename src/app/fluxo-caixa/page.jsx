"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { motion } from "framer-motion";
import LancamentoModal from "@/app/components/LancamentoModal";
import EditLancamentoModal from "@/app/components/EditLancamentoModal";
import Notification from "@/app/components/Notification";
import ConfirmacaoModal from "@/app/components/ConfirmacaoModal";
import EmailModal from "@/app/components/EmailModal";
import { formatBRLNumber, formatDate } from "@/app/utils/formatters";
import FiltroLateral from "@/app/components/FiltroLateral";
import Pagination from "@/app/components/Pagination";
import { FaSort, FaSortUp, FaSortDown } from "react-icons/fa";
import ComplementModal from "@/app/components/ComplementModal";
import ConfirmacaoEstornoModal from "@/app/components/ConfirmacaoEstornoModal";
import { format as formatDateFns } from "date-fns";
import { ptBR } from "date-fns/locale";

const ITEMS_PER_PAGE = 8;

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
  const [contasMaster, setContasMaster] = useState([]);
  const [clienteMasterNome, setClienteMasterNome] = useState("");

  // Filtro antigo mantido, e um novo para conta externa adicionado
  const [filters, setFilters] = useState({
    dataInicio: "",
    dataFim: "",
    descricao: "",
    contaBancaria: "",
    categoria: "Todos",
    contaExterna: "", // Novo filtro para a conta do Inter
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

  // NOVO: States para os dados da API do Inter
  const [interSaldo, setInterSaldo] = useState(null);
  const [interExtrato, setInterExtrato] = useState(null);

  const getAuthHeader = () => {
    const token = sessionStorage.getItem("authToken");
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const showNotification = (message, type) => {
    setNotification({ message, type });
    setTimeout(() => setNotification({ message: "", type: "" }), 5000);
  };

  const fetchMovimentacoes = async (currentFilters, currentSortConfig) => {
    setLoading(true);
    setError(null);
    setInterExtrato(null); // Limpa o extrato externo ao buscar o interno
    const params = new URLSearchParams();
    if (currentFilters.dataInicio)
      params.append("dataInicio", currentFilters.dataInicio);
    if (currentFilters.dataFim)
      params.append("dataFim", currentFilters.dataFim);
    if (currentFilters.descricao)
      params.append("descricao", currentFilters.descricao);
    if (currentFilters.contaBancaria)
      params.append("conta", currentFilters.contaBancaria);
    if (currentFilters.categoria && currentFilters.categoria !== "Todos") {
      params.append("categoria", currentFilters.categoria);
    }
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
    const url = `/api/dashboard/saldos?${params.toString()}`;
    try {
      const saldosResponse = await fetch(url, { headers: getAuthHeader() });
      if (!saldosResponse.ok) throw new Error("Falha ao carregar saldos.");
      const saldosData = await saldosResponse.json();
      setSaldos(saldosData);
    } catch (err) {
      showNotification(err.message, "error");
    }
  };

  // NOVA FUNÇÃO para buscar dados do Inter
  const fetchExtratoInter = async (conta, dataInicio, dataFim) => {
    setLoading(true);
    setError("");
    setMovimentacoes([]); // Limpa movimentações internas
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
      const extratoData = await extratoRes.json();
      if (!saldoRes.ok)
        throw new Error(saldoData.message || "Erro ao buscar saldo.");
      if (!extratoRes.ok)
        throw new Error(extratoData.message || "Erro ao buscar extrato.");
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
      // ... (seu código para buscar contasMaster e clienteMasterNome)
    };
    fetchStaticData();
  }, []);

  // UseEffect principal agora decide o que buscar
  useEffect(() => {
    // A busca de saldos agora é chamada independentemente da fonte do extrato principal
    fetchSaldos(filters);

    if (filters.contaExterna) {
      if (filters.dataInicio && filters.dataFim) {
        fetchExtratoInter(
          filters.contaExterna,
          filters.dataInicio,
          filters.dataFim
        );
      } else if (!loading) {
        showNotification(
          "Por favor, defina um período (Data Início e Fim) para consultar o extrato externo.",
          "error"
        );
        setLoading(false);
      }
    } else {
      fetchMovimentacoes(filters, sortConfig);
    }
  }, [filters, sortConfig]);

  useEffect(() => {
    const handleClick = () =>
      setContextMenu({ ...contextMenu, visible: false });
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [contextMenu]);

  // ... O restante do seu código original (handleSort, getSortIcon, handleSaveLancamento, etc.)
  // permanece exatamente como estava. Cole-o aqui.

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
    const cleared = {
      dataInicio: "",
      dataFim: "",
      descricao: "",
      contaBancaria: "",
      categoria: "Todos",
      contaExterna: "",
    };
    setFilters(cleared);
    setCurrentPage(1);
  };

  const handleFilterChange = (e) => {
    setCurrentPage(1);
    setFilters((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSaveLancamento = async (payload) => {
    try {
      const response = await fetch(`/api/lancamentos`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errorText = await response.json();
        throw new Error(errorText.message || "Falha ao salvar lançamento.");
      }
      showNotification("Lançamento salvo com sucesso!", "success");
      fetchMovimentacoes(filters, sortConfig);
      fetchSaldos(filters);
      return true;
    } catch (error) {
      showNotification(error.message, "error");
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
      if (!response.ok) {
        const errorText = await response.json();
        throw new Error(errorText.message || "Falha ao atualizar lançamento.");
      }
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
        {
          method: "DELETE",
          headers: getAuthHeader(),
        }
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
    if (!estornoInfo) return;

    const duplicataParaEstornar = estornoInfo.duplicata;

    if (!duplicataParaEstornar?.id) {
      showNotification(
        "Erro: Lançamento de recebimento não está vinculado a uma duplicata específica para estornar.",
        "error"
      );
      setEstornoInfo(null);
      return;
    }

    try {
      const response = await fetch(
        `/api/duplicatas/${duplicataParaEstornar.id}/estornar`,
        {
          method: "POST",
          headers: getAuthHeader(),
        }
      );
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Falha ao estornar a liquidação.");
      }
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
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Falha ao enviar o e-mail.");
      }
      showNotification("E-mail(s) enviado(s) com sucesso!", "success");
    } catch (err) {
      showNotification(err.message, "error");
    } finally {
      setIsSendingEmail(false);
      setIsEmailModalOpen(false);
    }
  };

  const handleGeneratePdf = async () => {
    if (!contextMenu.selectedItem) return;
    const operacaoId = contextMenu.selectedItem.operacaoId;
    if (!operacaoId) {
      alert("Este lançamento não está associado a um borderô para gerar PDF.");
      return;
    }
    try {
      const response = await fetch(`/api/operacoes/${operacaoId}/pdf`, {
        headers: getAuthHeader(),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Não foi possível gerar o PDF.");
      }

      const contentDisposition = response.headers.get("content-disposition");
      let filename = `bordero-${operacaoId}.pdf`;
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="([^"]+)"/);
        if (filenameMatch && filenameMatch.length > 1) {
          filename = filenameMatch[1];
        }
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
  const handleSaveComplemento = async (payload) => {
    try {
      const response = await fetch(`/api/operacoes/complemento`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.json();
        throw new Error(errorText.message || "Falha ao salvar complemento.");
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

  const indexOfLastItem = currentPage * ITEMS_PER_PAGE;
  const indexOfFirstItem = indexOfLastItem - ITEMS_PER_PAGE;
  const currentItems = movimentacoes.slice(indexOfFirstItem, indexOfLastItem);
  const saldosTitle =
    filters.dataInicio && filters.dataFim
      ? "Resultado do Período"
      : "Saldos Atuais";

  // NOVA LÓGICA (igual à da página de teste)
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

  const formatHeaderDate = (dateString) => {
    const date = new Date(dateString + "T12:00:00Z");
    return formatDateFns(date, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR });
  };

  return (
    <>
      <Notification
        message={notification.message}
        type={notification.type}
        onClose={() => setNotification({ message: "", type: "" })}
      />
      {/* ... (todos os seus modais) ... */}
      <LancamentoModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveLancamento}
        contasMaster={contasMaster}
        clienteMasterNome={clienteMasterNome}
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
      />

      <main className="h-full flex flex-col p-6 bg-gradient-to-br from-gray-900 to-gray-800 text-white">
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

        <div className="flex flex-col lg:flex-row gap-6 flex-grow min-h-0">
          <div className="w-full lg:w-72 flex-shrink-0">
            <div className="flex flex-col gap-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
              >
                <h2 className="text-lg font-semibold text-gray-100 mb-2">
                  {saldosTitle}
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4">
                  {saldos.map((saldo, index) => (
                    <div
                      key={index}
                      className="bg-gray-800 p-3 rounded-lg shadow-lg border-l-4 border-orange-500"
                    >
                      <p className="text-sm text-gray-400 truncate">
                        {saldo.contaBancaria}
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
                onFilterChange={handleFilterChange}
                onClear={clearFilters}
              />
            </div>
          </div>

          <div className="w-full flex-grow bg-gray-800 p-4 rounded-lg shadow-md flex flex-col min-h-0">
            {error && <p className="text-red-400 text-center py-10">{error}</p>}
            {loading && (
              <p className="text-center py-10 text-gray-400">A carregar...</p>
            )}

            {!loading && !error && (
              <>
                {filters.contaExterna ? (
                  <div className="flex-grow overflow-y-auto">
                    {interExtratoProcessado.length > 0 ? (
                      <div className="space-y-4">
                        {interExtratoProcessado.map((group) => (
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
                                  className="py-2 flex justify-between items-center text-sm"
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
                  </div>
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
                                  {mov.contaBancaria}
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

        {contextMenu.visible && !filters.contaExterna && (
          <div
            ref={menuRef}
            style={{ top: contextMenu.y, left: contextMenu.x }}
            className="absolute origin-top-right w-56 rounded-md shadow-lg bg-gray-700 ring-1 ring-black ring-opacity-5 z-20"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="py-1">
              {/* ... (código do menu de contexto) ... */}
            </div>
          </div>
        )}
      </main>
    </>
  );
}
