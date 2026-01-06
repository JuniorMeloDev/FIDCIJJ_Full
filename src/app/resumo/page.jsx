"use client";

import { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";
import TopFiveApex from "../components/TopFiveApex";
import { formatBRLNumber, formatDate } from "../utils/formatters";
import RelatorioModal from "@/app/components/RelatorioModal";
import DashboardFiltros from "@/app/components/DashboardFiltros";
import LiquidacaoModal from "@/app/components/LiquidacaoModal";
import Notification from "@/app/components/Notification";
import { FaChartLine, FaDollarSign, FaClock } from "react-icons/fa";
import { startOfMonth, endOfMonth, format } from "date-fns";

// --- FUNÇÃO ADICIONADA AQUI ---
// Esta é a mesma lógica do modal, agora aplicada a esta página.
const isPostFixedInterest = (operation, duplicate) => {
  if (!operation) return false;
  const totalDescontadoNaOrigem = (operation.valor_total_bruto || 0) - (operation.valor_liquido || 0);
  const descontosEsperadosPreFixado = (operation.valor_total_juros || 0) + (operation.valor_total_descontos || 0);
  if (totalDescontadoNaOrigem < (descontosEsperadosPreFixado - 0.01)) {
    return (duplicate.valorJuros || duplicate.valor_juros || 0) > 0;
  }
  return false;
};

export default function ResumoPage() {
  const [saldos, setSaldos] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [tiposOperacao, setTiposOperacao] = useState([]);
  const [contasBancarias, setContasBancarias] = useState([]);

  const [filters, setFilters] = useState({
    dataInicio: format(startOfMonth(new Date()), "yyyy-MM-dd"),
    dataFim: format(endOfMonth(new Date()), "yyyy-MM-dd"),
    tipoOperacaoId: "",
    clienteId: "",
    clienteNome: "",
    sacado: "",
    contaBancaria: "",
  });

  const [debouncedFilters, setDebouncedFilters] = useState(filters);
  const [diasVencimento, setDiasVencimento] = useState(5);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isRelatorioModalOpen, setIsRelatorioModalOpen] = useState(false);
  const [topFiveChartType, setTopFiveChartType] = useState("cedentes");
  const [topNLimit, setTopNLimit] = useState(5);
  const [today, setToday] = useState("");

  const [notification, setNotification] = useState({ message: "", type: "" });
  const [isLiquidarModalOpen, setIsLiquidarModalOpen] = useState(false);
  const [duplicataParaLiquidar, setDuplicataParaLiquidar] = useState(null);
  const [contextMenu, setContextMenu] = useState({
    visible: false,
    x: 0,
    y: 0,
    selectedItem: null,
  });
  const menuRef = useRef(null);

  useEffect(() => {
    setToday(new Date().toISOString().split("T")[0]);
  }, []);

  const getAuthHeader = () => {
    const token = sessionStorage.getItem("authToken");
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

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

  const fetchDashboardData = async () => {
    if (!metrics) setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      Object.entries(debouncedFilters).forEach(
        ([k, v]) => v && params.append(k, v)
      );
      params.append("diasVencimento", diasVencimento);
      params.append("topNLimit", topNLimit);

      const headers = getAuthHeader();
      const [saldosRes, metricsRes] = await Promise.all([
        fetch(`/api/dashboard/saldos?${params}`, { headers }),
        fetch(`/api/dashboard/metrics?${params}`, { headers }),
      ]);
      if (!saldosRes.ok || !metricsRes.ok) {
        throw new Error("Falha ao buscar dados do dashboard.");
      }
      setSaldos(await saldosRes.json());
      setMetrics(await metricsRes.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    (async () => {
      const [tiposData, contasData] = await Promise.all([
        fetchApiData(`/api/cadastros/tipos-operacao`),
        fetchApiData(`/api/cadastros/contas/master`),
      ]);
      setTiposOperacao(tiposData);
      setContasBancarias(contasData);
    })();
  }, []);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedFilters(filters);
    }, 500);
    return () => clearTimeout(handler);
  }, [filters]);

  useEffect(() => {
    fetchDashboardData();
  }, [debouncedFilters, diasVencimento, topNLimit]);

  useEffect(() => {
    const handleClick = () =>
      setContextMenu({ ...contextMenu, visible: false });
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [contextMenu]);

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters((prev) => ({
      ...prev,
      [name]: value,
      ...(name === "clienteNome" && !value ? { clienteId: "" } : {}),
      ...(name === "sacado" && !value ? { sacado: "" } : {}),
    }));
  };

  const handleAutocompleteSelect = (name, item) => {
    if (name === "cliente") {
      setFilters((prev) => ({
        ...prev,
        clienteId: item?.id || "",
        clienteNome: item?.nome || "",
      }));
    } else {
      setFilters((prev) => ({ ...prev, sacado: item?.nome || "" }));
    }
  };

  const clearFilters = () =>
    setFilters({
      dataInicio: "",
      dataFim: "",
      tipoOperacaoId: "",
      clienteId: "",
      clienteNome: "",
      sacado: "",
      contaBancaria: "",
    });

  const handleContextMenu = (event, item) => {
    event.preventDefault();
    setContextMenu({
      visible: true,
      x: event.pageX,
      y: event.pageY,
      selectedItem: item,
    });
  };

  const handleAbrirModalLiquidacao = () => {
    if (contextMenu.selectedItem) {
      setDuplicataParaLiquidar([contextMenu.selectedItem]);
      setIsLiquidarModalOpen(true);
    }
  };

  const handleConfirmarLiquidacao = async (
    liquidacoes,
    dataLiquidacao,
    jurosMora,
    desconto,
    contaBancariaId
  ) => {
    try {
      const response = await fetch("/api/duplicatas/liquidar-em-massa", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({
          liquidacoes,
          dataLiquidacao,
          jurosMora,
          desconto,
          contaBancariaId,
        }),
      });

      if (!response.ok) throw new Error("Falha ao liquidar a duplicata.");
      showNotification(`Duplicata liquidada com sucesso!`, "success");
      fetchDashboardData();
    } catch (err) {
      showNotification(err.message, "error");
    } finally {
      setIsLiquidarModalOpen(false);
    }
  };


  const totalGeral = saldos.reduce((sum, c) => sum + (c.saldo || 0), 0);

  const shouldShowGlobalMetrics =
    !filters.tipoOperacaoId &&
    !filters.clienteId &&
    !filters.sacado &&
    !filters.contaBancaria;

  if (loading) {
    return (
      <main className="flex items-center justify-center h-full bg-gradient-to-br from-gray-900 to-gray-800">
        <p className="text-gray-400 text-xl">Carregando resumo...</p>
      </main>
    );
  }

  return (
    <main className="h-full overflow-y-auto p-6 bg-gradient-to-br from-gray-900 to-gray-800">
      <Notification
        message={notification.message}
        type={notification.type}
        onClose={() => setNotification({ message: "", type: "" })}
      />
      <LiquidacaoModal
        isOpen={isLiquidarModalOpen}
        onClose={() => setIsLiquidarModalOpen(false)}
        onConfirm={handleConfirmarLiquidacao}
        duplicata={duplicataParaLiquidar}
        contasMaster={contasBancarias}
      />
      <RelatorioModal
        isOpen={isRelatorioModalOpen}
        onClose={() => setIsRelatorioModalOpen(false)}
        tiposOperacao={tiposOperacao}
        fetchClientes={(q) =>
          fetchApiData(`/api/cadastros/clientes/search?nome=${q}`)
        }
        fetchSacados={(q) =>
          fetchApiData(`/api/cadastros/sacados/search?nome=${q}`)
        }
      />

      <motion.div
        className="max-w-7xl mx-auto space-y-8"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
      >
        <motion.header
          className="flex justify-between items-center mb-6 border-b-2 border-orange-500 pb-4"
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
        >
          <div>
            <h1 className="text-3xl font-bold text-gray-100">
              Resumo da Carteira
            </h1>
            <p className="text-gray-300 mt-1">
              Visão geral da sua operação financeira
            </p>
          </div>
          <button
            onClick={() => setIsRelatorioModalOpen(true)}
            className="border-2 border-orange-500 text-orange-500 font-semibold py-2 px-4 rounded-md hover:bg-orange-500 hover:text-white transition"
          >
            Imprimir Relatórios
          </button>
        </motion.header>

        <DashboardFiltros
          filters={filters}
          onFilterChange={handleFilterChange}
          onAutocompleteSelect={handleAutocompleteSelect}
          tiposOperacao={tiposOperacao}
          contasBancarias={contasBancarias}
          fetchClientes={(q) =>
            fetchApiData(`/api/cadastros/clientes/search?nome=${q}`)
          }
          fetchSacados={(q) =>
            fetchApiData(`/api/cadastros/sacados/search?nome=${q}`)
          }
          onClear={clearFilters}
        />

        {error && <div className="text-center py-4 text-red-500">{error}</div>}

        {metrics && (
          <div className="transition-opacity duration-300 opacity-100">
            {/* Contas Bancárias */}
            <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {saldos
                .filter(conta => conta.saldo !== 0) // Filtra contas com saldo zero
                .map((conta, index) => {
                  const cores = [
                    "bg-blue-700 border-blue-400",
                    "bg-green-700 border-green-400",
                    "bg-purple-700 border-purple-400",
                    "bg-pink-700 border-pink-400",
                    "bg-indigo-700 border-indigo-400",
                    "bg-teal-700 border-teal-400",
                  ];
                  const cor = cores[index % cores.length];
                  return (
                    <motion.div
                      key={conta.contaBancaria}
                      className={`p-4 rounded-lg shadow-lg transition border-l-4 flex flex-col justify-between ${cor}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 * index }}
                    >
                      <div>
                        <h3 className="text-sm font-medium text-gray-100 truncate">
                          {conta.contaBancaria}
                        </h3>
                        <p
                          className={`mt-2 text-2xl font-semibold ${conta.saldo < 0 ? "text-red-200" : "text-white"
                            }`}
                        >
                          {formatBRLNumber(conta.saldo)}
                        </p>
                      </div>
                    </motion.div>
                  );
                })}
            </section>

            <section className="mt-2">
              <motion.div
                className="p-4 rounded-lg shadow-xl transition border-l-8 bg-gray-700 border-yellow-400 w-full text-center"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
              >
                <h3 className="text-lg font-medium text-gray-300">
                  Total Geral
                </h3>
                <p
                  className={`mt-2 text-3xl font-semibold ${totalGeral < 0 ? "text-red-400" : "text-gray-100"
                    }`}
                >
                  {formatBRLNumber(totalGeral)}
                </p>
              </motion.div>
            </section>

            <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-8">
              <motion.div
                key="juros"
                className="p-4 rounded-lg shadow-lg transition bg-gray-700 border-l-4 border-green-400"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <div className="flex items-center space-x-3">
                  <FaDollarSign className="w-6 h-6 text-green-400" />
                  <div>
                    <p className="text-sm text-gray-300">Juros Total</p>
                    <p className="text-lg font-semibold text-gray-100">
                      {formatBRLNumber(metrics.totalJuros || 0)}
                    </p>
                  </div>
                </div>
              </motion.div>

              {shouldShowGlobalMetrics && (
                <>
                  <motion.div
                    key="despesas"
                    className="p-4 rounded-lg shadow-lg transition bg-gray-700 border-l-4 border-red-400"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                  >
                    <div className="flex items-center space-x-3">
                      <FaDollarSign className="w-6 h-6 text-red-400" />
                      <div>
                        <p className="text-sm text-gray-300">Despesas Totais</p>
                        <p className="text-lg font-semibold text-gray-100">
                          {formatBRLNumber(metrics.totalDespesas || 0)}
                        </p>
                      </div>
                    </div>
                  </motion.div>

                  <motion.div
                    key="lucro"
                    className="p-4 rounded-lg shadow-lg transition bg-gray-700 border-l-4 border-yellow-300"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                  >
                    <div className="flex items-center space-x-3">
                      <FaClock className="w-6 h-6 text-yellow-300" />
                      <div>
                        <p className="text-sm text-gray-300">Lucro Líquido</p>
                        <p className="text-lg font-semibold text-gray-100">
                          {formatBRLNumber(metrics.lucroLiquido || 0)}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                </>
              )}

              <motion.div
                key="operado"
                className="p-4 rounded-lg shadow-lg transition bg-gray-700 border-l-4 border-gray-400"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
              >
                <div className="flex items-center space-x-3">
                  <FaChartLine className="w-6 h-6 text-gray-400" />
                  <div>
                    <p className="text-sm text-gray-300">Total Operado</p>
                    <p className="text-lg font-semibold text-gray-100">
                      {formatBRLNumber(metrics.valorOperadoNoMes || 0)}
                    </p>
                  </div>
                </div>
              </motion.div>
            </section>

            <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-8">
              <motion.div
                className="p-6 rounded-lg shadow-lg transition bg-gray-700"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8 }}
              >
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-gray-100">
                    Pendências e Vencimentos
                  </h3>
                  <select
                    value={diasVencimento}
                    onChange={(e) => setDiasVencimento(Number(e.target.value))}
                    className="bg-gray-800 text-gray-200 border-gray-600 rounded-md p-1 text-sm focus:ring-orange-500 focus:border-orange-500"
                  >
                    <option value={5}>Próximos 5 dias</option>
                    <option value={15}>Próximos 15 dias</option>
                    <option value={30}>Próximos 30 dias</option>
                  </select>
                </div>
                <div className="space-y-3 max-h-80 overflow-auto pr-2">
                  {metrics.vencimentosProximos?.length > 0 ? (
                    metrics.vencimentosProximos
                      .sort(
                        (a, b) =>
                          new Date(a.dataVencimento) -
                          new Date(b.dataVencimento)
                      )
                      .map((dup) => {
                        const isVencido = dup.dataVencimento < today;

                        // --- INÍCIO DA CORREÇÃO ---
                        // Calcula o valor a ser exibido usando a mesma lógica do modal
                        const valorExibido = isPostFixedInterest(dup.operacao, dup)
                          ? (dup.valorBruto || 0) + (dup.valorJuros || 0)
                          : (dup.valorBruto || 0);
                        // --- FIM DA CORREÇÃO ---

                        return (
                          <div
                            key={dup.id}
                            onContextMenu={(e) => handleContextMenu(e, dup)}
                            className="flex justify-between items-center text-sm border-b border-gray-600 pb-2 last:border-none cursor-pointer hover:bg-gray-600 rounded-md p-2"
                          >
                            <div>
                              <p className="font-medium text-gray-200">
                                {dup.clienteSacado}
                              </p>
                              <p className="text-xs text-gray-400">
                                {dup.operacao?.cliente?.ramo_de_atividade === "Transportes"
                                  ? `CT-e ${dup.nfCte.split('.')[0]}`
                                  : `NF ${dup.nfCte}`}
                              </p>
                            </div>
                            <div className="text-right">
                              <p
                                className={`font-semibold ${isVencido ? "text-red-500" : "text-yellow-400"
                                  }`}
                              >
                                {formatDate(dup.dataVencimento)}
                              </p>
                              <p className="text-gray-300">
                                {formatBRLNumber(valorExibido)}
                              </p>
                            </div>
                          </div>
                        );
                      })
                  ) : (
                    <p className="text-gray-400">
                      Nenhuma duplicata vencida ou a vencer nos próximos{" "}
                      {diasVencimento} dias.
                    </p>
                  )}
                </div>
              </motion.div>

              <motion.div
                className="lg:col-span-2 bg-gray-700 p-6 rounded-lg shadow-lg"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.9 }}
              >
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-gray-100">{`Top ${topNLimit} ${topFiveChartType === "cedentes" ? "Cedentes" : "Sacados"
                    } por Valor`}</h3>
                  <div className="flex items-center gap-2">
                    <select
                      value={topNLimit}
                      onChange={(e) => setTopNLimit(Number(e.target.value))}
                      className="bg-gray-800 text-gray-200 border-gray-600 rounded-md p-1 text-sm focus:ring-orange-500 focus:border-orange-500"
                    >
                      <option value={5}>Top 5</option>
                      <option value={10}>Top 10</option>
                      <option value={15}>Top 15</option>
                      <option value={20}>Top 20</option>
                    </select>
                    <div className="flex space-x-1 rounded-lg bg-gray-800 p-1 w-auto">
                      <button
                        onClick={() => setTopFiveChartType("cedentes")}
                        className={`px-4 py-1 text-sm font-medium rounded-md transition ${topFiveChartType === "cedentes"
                          ? "bg-orange-500 text-white"
                          : "text-gray-300 hover:bg-gray-700"
                          }`}
                      >
                        Cedentes
                      </button>
                      <button
                        onClick={() => setTopFiveChartType("sacados")}
                        className={`px-4 py-1 text-sm font-medium rounded-md transition ${topFiveChartType === "sacados"
                          ? "bg-orange-500 text-white"
                          : "text-gray-300 hover:bg-gray-700"
                          }`}
                      >
                        Sacados
                      </button>
                    </div>
                  </div>
                </div>
                <TopFiveApex
                  data={
                    topFiveChartType === "cedentes"
                      ? metrics.topClientes || []
                      : metrics.topSacados || []
                  }
                />
              </motion.div>
            </section>
          </div>
        )}
      </motion.div>

      {contextMenu.visible && (
        <div
          ref={menuRef}
          style={{ top: contextMenu.y, left: contextMenu.x }}
          className="absolute origin-top-right w-48 rounded-md shadow-lg bg-gray-700 ring-1 ring-black ring-opacity-5 z-50"
        >
          <div className="py-1" onClick={(e) => e.stopPropagation()}>
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                handleAbrirModalLiquidacao();
              }}
              className="block px-4 py-2 text-sm text-gray-200 hover:bg-gray-600"
            >
              Liquidar Duplicata
            </a>
          </div>
        </div>
      )}
    </main>
  );
}