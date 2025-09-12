"use client";

import { useState, useEffect, useRef } from "react";
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

const ITEMS_PER_PAGE = 6;

export default function FluxoDeCaixaPage() {
  const [movimentacoes, setMovimentacoes] = useState([]);
  const [saldos, setSaldos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState({ message: "", type: "" });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [itemParaEditar, setItemParaEditar] = useState(null);
  const [itemParaExcluir, setItemParaExcluir] = useState(null);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [operacaoParaEmail, setOperacaoParaEmail] = useState(null);
  const [isComplementModalOpen, setIsComplementModalOpen] = useState(false);
  const [lancamentoParaComplemento, setLancamentoParaComplemento] =
    useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [contasMaster, setContasMaster] = useState([]);
  const [clienteMasterNome, setClienteMasterNome] = useState("");
  const [filters, setFilters] = useState({
    dataInicio: "",
    dataFim: "",
    descricao: "",
    contaBancaria: "",
    categoria: "Todos",
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

  const getAuthHeader = () => {
    const token = sessionStorage.getItem("authToken");
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const showNotification = (message, type) => {
    setNotification({ message, type });
    setTimeout(() => setNotification({ message: "", type: "" }), 5000);
  };

  const fetchMovimentacoes = async (f, s) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (f.dataInicio) params.append("dataInicio", f.dataInicio);
    if (f.dataFim) params.append("dataFim", f.dataFim);
    if (f.descricao) params.append("descricao", f.descricao);
    if (f.contaBancaria) params.append("conta", f.contaBancaria);
    if (f.categoria && f.categoria !== "Todos")
      params.append("categoria", f.categoria);
    params.append("sort", s.key);
    params.append("direction", s.direction);
    try {
      const r = await fetch(`/api/movimentacoes-caixa?${params}`, {
        headers: getAuthHeader(),
      });
      if (!r.ok) throw new Error("Falha ao carregar movimentações.");
      setMovimentacoes(await r.json());
    } catch (e) {
      showNotification(e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const fetchSaldos = async (f) => {
    const params = new URLSearchParams();
    if (f.dataInicio) params.append("dataInicio", f.dataInicio);
    if (f.dataFim) params.append("dataFim", f.dataFim);
    try {
      const r = await fetch(`/api/dashboard/saldos?${params}`, {
        headers: getAuthHeader(),
      });
      if (!r.ok) throw new Error("Falha ao carregar saldos.");
      setSaldos(await r.json());
    } catch (e) {
      showNotification(e.message, "error");
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const headers = getAuthHeader();
        const [contasRes, clientesRes] = await Promise.all([
          fetch("/api/cadastros/contas/master", { headers }),
          fetch("/api/cadastros/clientes", { headers }),
        ]);
        const contas = await contasRes.json();
        const clientes = await clientesRes.json();
        setContasMaster(
          contas.map((c) => ({
            id: c.id,
            contaBancaria: `${c.banco} - ${c.agencia}/${c.conta_corrente}`,
          }))
        );
        if (clientes.length) setClienteMasterNome(clientes[0].nome);
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  useEffect(() => {
    fetchMovimentacoes(filters, sortConfig);
    fetchSaldos(filters);
  }, [filters, sortConfig]);

  useEffect(() => {
    const close = () => setContextMenu((c) => ({ ...c, visible: false }));
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  const handleSort = (key) => {
    let dir = "ASC";
    if (sortConfig.key === key && sortConfig.direction === "ASC") dir = "DESC";
    setSortConfig({ key, direction: dir });
    setCurrentPage(1);
  };
  const getSortIcon = (key) =>
    sortConfig.key !== key ? (
      <FaSort className="text-gray-400" />
    ) : sortConfig.direction === "ASC" ? (
      <FaSortUp />
    ) : (
      <FaSortDown />
    );

  const clearFilters = () => {
    setFilters({
      dataInicio: "",
      dataFim: "",
      descricao: "",
      contaBancaria: "",
      categoria: "Todos",
    });
    setCurrentPage(1);
  };

  const handleFilterChange = (e) => {
    setFilters((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setCurrentPage(1);
  };

  const indexOfLast = currentPage * ITEMS_PER_PAGE;
  const currentItems = movimentacoes.slice(
    indexOfLast - ITEMS_PER_PAGE,
    indexOfLast
  );
  const saldosTitle =
    filters.dataInicio && filters.dataFim
      ? "Resultado do Período"
      : "Saldos Atuais";

  return (
    <>
      <Notification
        message={notification.message}
        type={notification.type}
        onClose={() => setNotification({ message: "", type: "" })}
      />

      {/* Modais */}
      <LancamentoModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={async (p) => {
          const ok = await fetch("/api/lancamentos", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...getAuthHeader() },
            body: JSON.stringify(p),
          });
          if (ok.ok) {
            showNotification("Lançamento salvo!", "success");
            fetchMovimentacoes(filters, sortConfig);
            fetchSaldos(filters);
            return true;
          }
          showNotification("Erro ao salvar", "error");
          return false;
        }}
        contasMaster={contasMaster}
        clienteMasterNome={clienteMasterNome}
      />
      <EditLancamentoModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onSave={async (p) => {
          const ok = await fetch(`/api/movimentacoes-caixa/${p.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json", ...getAuthHeader() },
            body: JSON.stringify(p),
          });
          if (ok.ok) {
            showNotification("Atualizado!", "success");
            fetchMovimentacoes(filters, sortConfig);
            fetchSaldos(filters);
            return true;
          }
          showNotification("Erro ao atualizar", "error");
          return false;
        }}
        lancamento={itemParaEditar}
        contasMaster={contasMaster}
      />
      <ConfirmacaoModal
        isOpen={!!itemParaExcluir}
        onClose={() => setItemParaExcluir(null)}
        onConfirm={async () => {
          const ok = await fetch(
            `/api/movimentacoes-caixa/${itemParaExcluir}`,
            { method: "DELETE", headers: getAuthHeader() }
          );
          if (ok.ok) {
            showNotification("Excluído!", "success");
            fetchMovimentacoes(filters, sortConfig);
            fetchSaldos(filters);
          }
          setItemParaExcluir(null);
        }}
        title="Confirmar Exclusão"
        message="Tem certeza que deseja excluir este lançamento?"
      />
      <EmailModal
        isOpen={isEmailModalOpen}
        onClose={() => setIsEmailModalOpen(false)}
        onSend={async (d) => {
          const ok = await fetch(
            `/api/operacoes/${operacaoParaEmail.id}/enviar-email`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...getAuthHeader(),
              },
              body: JSON.stringify({ destinatarios: d }),
            }
          );
          ok.ok
            ? showNotification("E-mail enviado!", "success")
            : showNotification("Erro ao enviar e-mail", "error");
          setIsEmailModalOpen(false);
        }}
        isSending={isSendingEmail}
        clienteId={operacaoParaEmail?.clienteId}
      />
      <ComplementModal
        isOpen={isComplementModalOpen}
        onClose={() => setIsComplementModalOpen(false)}
        onSave={async (p) => {
          const ok = await fetch(`/api/operacoes/complemento`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...getAuthHeader() },
            body: JSON.stringify(p),
          });
          ok.ok
            ? showNotification("Complemento salvo!", "success")
            : showNotification("Erro ao salvar complemento", "error");
          fetchMovimentacoes(filters, sortConfig);
          fetchSaldos(filters);
          return ok.ok;
        }}
        lancamentoOriginal={lancamentoParaComplemento}
        contasMaster={contasMaster}
      />

      {/* Layout sem rolagem global */}
      <main className="h-full flex flex-col bg-gradient-to-br from-gray-900 to-gray-800 text-white overflow-hidden">
        {/* Cabeçalho fixo */}
        <div className="flex-shrink-0 px-6 pt-6">
          <motion.header
            className="mb-4 flex flex-col md:flex-row justify-between md:items-center border-b-2 border-orange-500 pb-4"
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
          >
            <div className="mb-4 md:mb-0">
              <h1 className="text-3xl font-bold">Fluxo de Caixa</h1>
              <p className="text-sm text-gray-300">
                Visão geral das movimentações.
              </p>
            </div>
            <button
              onClick={() => setIsModalOpen(true)}
              className="bg-orange-500 text-white font-semibold py-2 px-4 rounded-md hover:bg-orange-600 transition"
            >
              + Novo Lançamento
            </button>
          </motion.header>
        </div>

        {/* Conteúdo com rolagens internas */}
        <div className="flex-grow flex flex-col lg:flex-row gap-6 px-6 pb-6 min-h-0 overflow-hidden">
          {/* Painel Esquerdo */}
          <div className="w-full lg:w-72 flex-shrink-0 flex flex-col gap-4 overflow-hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              <h2 className="text-lg font-semibold text-gray-100 mb-2">
                {saldosTitle}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4">
                {saldos.map((s, i) => (
                  <div
                    key={i}
                    className="bg-gray-800 p-3 rounded-lg shadow-lg border-l-4 border-orange-500"
                  >
                    <p className="text-sm text-gray-400 truncate">
                      {s.contaBancaria}
                    </p>
                    <p
                      className={`text-xl font-bold ${
                        s.saldo >= 0 ? "text-green-400" : "text-red-400"
                      }`}
                    >
                      {formatBRLNumber(s.saldo)}
                    </p>
                  </div>
                ))}
              </div>
            </motion.div>
            <div className="flex-grow overflow-y-auto">
              <FiltroLateral
                filters={filters}
                saldos={saldos}
                onFilterChange={handleFilterChange}
                onClear={clearFilters}
              />
            </div>
          </div>

          {/* Painel Direito */}
          <div className="flex-grow bg-gray-800 rounded-lg shadow-md flex flex-col min-h-0">
            <div className="flex-grow overflow-y-auto p-4">
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
                  {loading ? (
                    <tr>
                      <td
                        colSpan="4"
                        className="text-center py-10 text-gray-400"
                      >
                        Carregando...
                      </td>
                    </tr>
                  ) : currentItems.length ? (
                    currentItems.map((m) => (
                      <tr
                        key={m.id}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setContextMenu({
                            visible: true,
                            x: e.pageX,
                            y: e.pageY,
                            selectedItem: m,
                          });
                        }}
                        className="hover:bg-gray-700 cursor-pointer"
                      >
                        <td className="px-3 py-2 text-sm text-gray-400">
                          {formatDate(m.dataMovimento)}
                        </td>
                        <td className="px-3 py-2 text-sm font-medium text-gray-100">
                          {m.descricao}
                        </td>
                        <td className="px-3 py-2 text-sm text-gray-400">
                          {m.contaBancaria}
                        </td>
                        <td
                          className={`px-3 py-2 text-sm text-right font-semibold ${
                            m.valor >= 0 ? "text-green-400" : "text-red-400"
                          }`}
                        >
                          {formatBRLNumber(m.valor)}
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
            <div className="flex-shrink-0 p-4">
              <Pagination
                totalItems={movimentacoes.length}
                itemsPerPage={ITEMS_PER_PAGE}
                currentPage={currentPage}
                onPageChange={(p) => setCurrentPage(p)}
              />
            </div>
          </div>
        </div>
      </main>

      {contextMenu.visible && (
        <div
          ref={menuRef}
          style={{ top: contextMenu.y, left: contextMenu.x }}
          className="absolute origin-top-right w-56 rounded-md shadow-lg bg-gray-700 ring-1 ring-black ring-opacity-5 z-20"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="py-1">
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                setItemParaEditar(contextMenu.selectedItem);
                setIsEditModalOpen(true);
              }}
              className="block px-4 py-2 text-sm text-gray-200 hover:bg-gray-600"
            >
              Editar Lançamento
            </a>
            {contextMenu.selectedItem?.operacaoId && (
              <>
                <div className="border-t border-gray-600 my-1"></div>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault(); /* gerar PDF */
                  }}
                  className="block px-4 py-2 text-sm text-gray-200 hover:bg-gray-600"
                >
                  Gerar PDF
                </a>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    setOperacaoParaEmail({
                      id: contextMenu.selectedItem.operacaoId,
                      clienteId: contextMenu.selectedItem.operacao?.cliente_id,
                    });
                    setIsEmailModalOpen(true);
                  }}
                  className="block px-4 py-2 text-sm text-gray-200 hover:bg-gray-600"
                >
                  Enviar por E-mail
                </a>
              </>
            )}
            <div className="border-t border-gray-600 my-1"></div>
            <button
              onClick={(e) => {
                e.preventDefault();
                setItemParaExcluir(contextMenu.selectedItem.id);
              }}
              className="block w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-gray-600"
            >
              Excluir Lançamento
            </button>
          </div>
        </div>
      )}
    </>
  );
}
