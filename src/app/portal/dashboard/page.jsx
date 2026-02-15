"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import { formatBRLNumber, formatDate } from "@/app/utils/formatters";
import {
  FaChevronRight,
  FaHourglassHalf,
  FaCheckCircle,
  FaTimesCircle,
  FaCheck,
  FaExclamationCircle,
  FaClock,
  FaDownload,
  FaSort,
  FaSortUp,
  FaSortDown,
  FaTimes,
  FaCoins,
  FaFileInvoiceDollar,
  FaWallet
} from "react-icons/fa";
import Pagination from "@/app/components/Pagination";
import Notification from "@/app/components/Notification";
import TopFiveApex from "@/app/components/TopFiveApex";
import VolumeOperadoChart from "@/app/components/VolumeOperadoChart";
import RelatorioModal from "@/app/components/RelatorioModal";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

// ... (Todos os componentes internos como UploadIcon, useSortableData, HistoricoOperacoesTable, etc. permanecem inalterados) ...
const ITEMS_PER_PAGE_OPERATIONS = 5;
const ITEMS_PER_PAGE_DUPLICATAS = 5;
const ITEMS_PER_PAGE_EXTRATO = 2;

const UploadIcon = () => (
  <svg
    className="w-8 h-8 text-gray-400"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
    ></path>
  </svg>
);
const CheckCircleIcon = () => (
  <svg
    className="w-5 h-5 text-green-400"
    fill="currentColor"
    viewBox="0 0 20 20"
  >
    <path
      fillRule="evenodd"
      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
      clipRule="evenodd"
    ></path>
  </svg>
);

const useSortableData = (
  items,
  initialConfig = { key: null, direction: "DESC" }
) => {
  const [sortConfig, setSortConfig] = useState(initialConfig);
  const sortedItems = useMemo(() => {
    let sortableItems = [...items];
    if (sortConfig.key !== null) {
      sortableItems.sort((a, b) => {
        const valA = a[sortConfig.key];
        const valB = b[sortConfig.key];
        if (valA === null || valA === undefined) return 1;
        if (valB === null || valB === undefined) return -1;
        if (valA < valB) return sortConfig.direction === "ASC" ? -1 : 1;
        if (valA > valB) return sortConfig.direction === "ASC" ? 1 : -1;
        return 0;
      });
    }
    return sortableItems;
  }, [items, sortConfig]);
  const requestSort = (key) => {
    let direction = "ASC";
    if (sortConfig.key === key && sortConfig.direction === "ASC") {
      direction = "DESC";
    }
    setSortConfig({ key, direction });
  };
  const getSortIcon = (key) => {
    if (sortConfig.key !== key)
      return <FaSort className="inline-block ml-1 text-gray-500" />;
    if (sortConfig.direction === "ASC")
      return <FaSortUp className="inline-block ml-1" />;
    return <FaSortDown className="inline-block ml-1" />;
  };
  return { items: sortedItems, requestSort, getSortIcon };
};

const HistoricoOperacoesTable = ({
  operacoes,
  loading,
  error,
  getAuthHeader,
  showNotification,
}) => {
  const [expandedRow, setExpandedRow] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [downloadingId, setDownloadingId] = useState(null);
  const {
    items: sortedOperacoes,
    requestSort,
    getSortIcon,
  } = useSortableData(operacoes, { key: "data_operacao", direction: "DESC" });
  const toggleRow = (id) => setExpandedRow(expandedRow === id ? null : id);
  const indexOfLastItem = currentPage * ITEMS_PER_PAGE_OPERATIONS;
  const indexOfFirstItem = indexOfLastItem - ITEMS_PER_PAGE_OPERATIONS;
  const currentOperacoes = sortedOperacoes.slice(
    indexOfFirstItem,
    indexOfLastItem
  );
  const getStatusTag = (status) => {
    const styles = {
      Pendente: "bg-orange-800 text-amber-100",
      Aprovada: "bg-green-800 text-green-100",
      Rejeitada: "bg-red-800 text-red-100",
    };
    const icons = {
      Pendente: <FaHourglassHalf />,
      Aprovada: <FaCheckCircle />,
      Rejeitada: <FaTimesCircle />,
    };
    return (
      <span
        className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${styles[status] || "bg-gray-600"
          }`}
      >
        {icons[status]} {status}
      </span>
    );
  };
  const handleDownloadBordero = async (operacaoId) => {
    setDownloadingId(operacaoId);
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
        if (filenameMatch && filenameMatch.length > 1)
          filename = filenameMatch[1];
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
      showNotification(err.message, "error");
    } finally {
      setDownloadingId(null);
    }
  };
  return (
    <div className="bg-gray-800 p-6 rounded-lg shadow-lg mb-8">
      <h2 className="text-xl font-semibold mb-4 text-white">
        Histórico de Operações
      </h2>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-700">
          <thead className="bg-gray-700/50">
            <tr>
              <th className="w-12"></th>
              <th
                className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer"
                onClick={() => requestSort("id")}
              >
                ID{getSortIcon("id")}
              </th>
              <th
                className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer"
                onClick={() => requestSort("data_operacao")}
              >
                Data de Envio{getSortIcon("data_operacao")}
              </th>
              <th
                className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer"
                onClick={() => requestSort("valor_total_bruto")}
              >
                Valor Bruto{getSortIcon("valor_total_bruto")}
              </th>
              <th
                className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer"
                onClick={() => requestSort("valor_liquido")}
              >
                Valor Líquido{getSortIcon("valor_liquido")}
              </th>
              <th
                className="px-6 py-3 text-center text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer"
                onClick={() => requestSort("status")}
              >
                Status{getSortIcon("status")}
              </th>
            </tr>
          </thead>
          <tbody className="bg-gray-800 divide-y divide-gray-700">
            {loading ? (
              <tr>
                <td colSpan="6" className="text-center py-8">
                  Carregando...
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan="6" className="text-center py-8 text-red-400">
                  {error}
                </td>
              </tr>
            ) : currentOperacoes.length === 0 ? (
              <tr>
                <td colSpan="6" className="text-center py-8">
                  Nenhuma operação encontrada.
                </td>
              </tr>
            ) : (
              currentOperacoes.map((op) => (
                <React.Fragment key={op.id}>
                  <tr
                    onClick={() => toggleRow(op.id)}
                    className={`cursor-pointer hover:bg-gray-700/50 ${expandedRow === op.id ? "bg-gray-700/50" : ""
                      }`}
                  >
                    <td className="px-4 py-4">
                      <FaChevronRight
                        className={`text-gray-500 transition-transform duration-300 ${expandedRow === op.id ? "rotate-90" : ""
                          }`}
                      />
                    </td>
                    <td className="px-6 py-4 font-medium text-white">
                      #{op.id}
                    </td>
                    <td className="px-6 py-4 text-gray-300">
                      {formatDate(op.data_operacao)}
                    </td>
                    <td className="px-6 py-4 text-right text-gray-300">
                      {formatBRLNumber(op.valor_total_bruto)}
                    </td>
                    <td className="px-6 py-4 text-right text-gray-300">
                      {formatBRLNumber(op.valor_liquido)}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {getStatusTag(op.status)}
                    </td>
                  </tr>
                  {expandedRow === op.id && (
                    <tr className="bg-gray-900/50">
                      <td colSpan="6" className="p-0">
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          className="overflow-hidden p-4 space-y-4"
                        >
                          <div className="flex justify-between items-center">
                            <h4 className="font-semibold text-sm text-orange-400">
                              Detalhes da Operação #{op.id}
                            </h4>
                            {op.status === "Aprovada" && (
                              <button
                                onClick={() => handleDownloadBordero(op.id)}
                                disabled={downloadingId === op.id}
                                className="text-xs bg-blue-600 hover:bg-blue-700 text-white py-1 px-3 rounded-md flex items-center gap-2 ml-auto disabled:bg-blue-400"
                              >
                                <FaDownload />
                                {downloadingId === op.id
                                  ? "Baixando..."
                                  : "Baixar Borderô"}
                              </button>
                            )}
                          </div>
                          <table className="min-w-full text-xs">
                            <thead className="bg-gray-700/50">
                              <tr>
                                <th className="px-3 py-2 text-left">NF/CT-e</th>
                                <th className="px-3 py-2 text-left">Sacado</th>
                                <th className="px-3 py-2 text-center">
                                  Vencimento
                                </th>
                                <th className="px-3 py-2 text-right">
                                  Valor Bruto
                                </th>
                                <th className="px-3 py-2 text-right">
                                  Juros (Deságio)
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-700">
                              {op.duplicatas.map((dup) => (
                                <tr key={dup.id}>
                                  <td className="px-3 py-2">{dup.nf_cte}</td>
                                  <td className="px-3 py-2">
                                    {dup.cliente_sacado}
                                  </td>
                                  <td className="px-3 py-2 text-center">
                                    {formatDate(dup.data_vencimento)}
                                  </td>
                                  <td className="px-3 py-2 text-right">
                                    {formatBRLNumber(dup.valor_bruto)}
                                  </td>
                                  <td className="px-3 py-2 text-right text-red-400">
                                    {formatBRLNumber(dup.valor_juros)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </motion.div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
      <Pagination
        totalItems={operacoes.length}
        itemsPerPage={ITEMS_PER_PAGE_OPERATIONS}
        currentPage={currentPage}
        onPageChange={setCurrentPage}
      />
    </div>
  );
};

const AcompanhamentoDuplicatasTable = ({ duplicatas, loading, error }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("Todos");

  const getDuplicataStatus = (dup) => {
    if (dup.status_recebimento === "Recebido") {
      return "Liquidada";
    }
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const vencimento = new Date(dup.data_vencimento + "T00:00:00-03:00");
    const diffTime = vencimento - hoje;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays < 0) {
      return "Vencida";
    }
    return "A Vencer";
  };

  const filteredDuplicatas = useMemo(() => {
    if (statusFilter === "Todos") {
      return duplicatas;
    }
    return duplicatas.filter((dup) => getDuplicataStatus(dup) === statusFilter);
  }, [duplicatas, statusFilter]);

  const {
    items: sortedDuplicatas,
    requestSort,
    getSortIcon,
  } = useSortableData(filteredDuplicatas, {
    key: "data_vencimento",
    direction: "DESC",
  });

  const currentDuplicatas = sortedDuplicatas.slice(
    (currentPage - 1) * ITEMS_PER_PAGE_DUPLICATAS,
    currentPage * ITEMS_PER_PAGE_DUPLICATAS
  );

  const getDuplicataStatusTag = (dup) => {
    const status = getDuplicataStatus(dup);
    if (status === "Liquidada") {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-800 text-blue-100">
          <FaCheck /> Liquidada
        </span>
      );
    }
    if (status === "Vencida") {
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      const vencimento = new Date(dup.data_vencimento + "T00:00:00-03:00");
      const diffTime = vencimento - hoje;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-red-900 text-red-200">
          <FaExclamationCircle /> Vencida ({Math.abs(diffDays)} dia
          {Math.abs(diffDays) > 1 ? "s" : ""})
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-sky-900 text-sky-100">
        <FaClock /> A Vencer
      </span>
    );
  };
  return (
    <div className="bg-gray-800 p-6 rounded-lg shadow-lg mb-8">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold text-white">
          Acompanhamento de Duplicatas
        </h2>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setCurrentPage(1); // Reseta a paginação ao mudar o filtro
          }}
          className="bg-gray-700 text-gray-200 border-gray-600 rounded-md p-1 text-sm focus:ring-orange-500 focus:border-orange-500"
        >
          <option value="Todos">Todos os Status</option>
          <option value="A Vencer">A Vencer</option>
          <option value="Liquidada">Liquidada</option>
          <option value="Vencida">Vencida</option>
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-700">
          <thead className="bg-gray-700/50">
            <tr>
              <th
                className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer"
                onClick={() => requestSort("nf_cte")}
              >
                NF/CT-e{getSortIcon("nf_cte")}
              </th>
              <th
                className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer"
                onClick={() => requestSort("cliente_sacado")}
              >
                Sacado{getSortIcon("cliente_sacado")}
              </th>
              <th
                className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer"
                onClick={() => requestSort("data_vencimento")}
              >
                Vencimento{getSortIcon("data_vencimento")}
              </th>
              <th
                className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer"
                onClick={() => requestSort("valor_bruto")}
              >
                Valor{getSortIcon("valor_bruto")}
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-300 uppercase">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="bg-gray-800 divide-y divide-gray-700">
            {loading ? (
              <tr>
                <td colSpan="5" className="text-center py-8">
                  Carregando...
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan="5" className="text-center py-8 text-red-400">
                  {error}
                </td>
              </tr>
            ) : currentDuplicatas.length === 0 ? (
              <tr>
                <td colSpan="5" className="text-center py-8">
                  Nenhuma duplicata encontrada para o filtro selecionado.
                </td>
              </tr>
            ) : (
              currentDuplicatas.map((d) => (
                <tr key={d.id}>
                  <td className="px-6 py-4 font-medium text-white">
                    {d.nf_cte}
                  </td>
                  <td className="px-6 py-4 text-gray-300">
                    {d.cliente_sacado}
                  </td>
                  <td
                    className={`px-6 py-4 ${getDuplicataStatus(d) === 'Vencida'
                      ? "text-red-400 font-semibold"
                      : "text-gray-300"
                      }`}
                  >
                    {formatDate(d.data_vencimento)}
                  </td>
                  <td className="px-6 py-4 text-right text-gray-300">
                    {formatBRLNumber(d.valor_bruto)}
                  </td>
                  <td className="px-6 py-4 text-center">
                    {getDuplicataStatusTag(d)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <Pagination
        totalItems={sortedDuplicatas.length}
        itemsPerPage={ITEMS_PER_PAGE_DUPLICATAS}
        currentPage={currentPage}
        onPageChange={setCurrentPage}
      />
    </div>
  );
};

const toDDMMYYYY = (isoDate) => {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return "";
  const [yyyy, mm, dd] = isoDate.split("-");
  return `${dd}${mm}${yyyy}`;
};

const parseBrMoney = (value) => {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const cleaned = raw
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeBradescoDate = (value) => {
  const raw = String(value || "").trim();
  const ddmmyyyy = raw.match(/^(\d{2})(\d{2})(\d{4})$/);
  if (ddmmyyyy) return `${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`;

  const withSlash = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (withSlash) return `${withSlash[3]}-${withSlash[2]}-${withSlash[1]}`;

  const withDot = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (withDot) return `${withDot[3]}-${withDot[2]}-${withDot[1]}`;

  return raw;
};

const isDateInRange = (dateIso, startIso, endIso) => {
  if (!dateIso || !startIso || !endIso) return false;
  const date = new Date(`${dateIso}T12:00:00`);
  const start = new Date(`${startIso}T00:00:00`);
  const end = new Date(`${endIso}T23:59:59`);
  if (Number.isNaN(date.getTime()) || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return false;
  }
  return date >= start && date <= end;
};

const buildDateRange = (startIso, endIso) => {
  if (!startIso || !endIso) return [];
  const start = new Date(`${startIso}T00:00:00`);
  const end = new Date(`${endIso}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    return [];
  }

  const days = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
};

const toCompactDate = (isoDate) => {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return "";
  const [yyyy, mm, dd] = isoDate.split("-");
  return `${yyyy}${mm}${dd}`;
};

const sanitizeOfxText = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[<>\r\n]/g, " ")
    .trim();

const normalizeBradescoExtrato = (raw) => {
  const ultimos = raw?.extratoUltimosLancamentos?.listaLancamentos || {};

  const pickArray = (keyIncludes) =>
    Object.entries(ultimos).find(([key, value]) => {
      if (!Array.isArray(value)) return false;
      const normalizedKey = key
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
      return keyIncludes.some((term) => normalizedKey.includes(term));
    })?.[1] || [];

  const listaUltimos = pickArray(["ultimos"]);
  const listaDia = pickArray(["dia"]);
  const listaFuturos =
    raw?.extratoLancamentosFuturos?.listaLancamentos?.["Lancamentos Futuros"] ||
    raw?.extratoLancamentosFuturos?.listaLancamentos?.["Lançamentos Futuros"] ||
    [];
  const listaPeriodo = raw?.extratoPorPeriodo?.lstLancamentoMensal || [];

  // Mescla os blocos para não perder lançamentos futuros (ex.: próximo dia com movimento).
  const all = [
    ...listaPeriodo.map((item) => ({ item, origem: "periodo" })),
    ...listaUltimos.map((item) => ({ item, origem: "ultimos" })),
    ...listaDia.map((item) => ({ item, origem: "dia" })),
    ...listaFuturos.map((item) => ({ item, origem: "futuro" })),
  ];

  const seen = new Set();

  return all
    .map((entry, index) => {
      const { item, origem } = entry;
      const tipoOperacao = item.sinalLancamento === "-" ? "D" : "C";
      const valor = parseBrMoney(item.valorLancamento);
      const dataEntrada = normalizeBradescoDate(item.dataLancamento);
      const saldoSemSinal = parseBrMoney(item.valorSaldoAposLancamento);
      const saldoApos =
        saldoSemSinal === null
          ? null
          : item.sinalSaldo === "-"
            ? saldoSemSinal * -1
            : saldoSemSinal;

      return {
        idTransacao: String(item.numeroDocumento || `bradesco-${index}`),
        order: index,
        tipoLancamento: item.tipoLancamento || null,
        dataEntrada,
        tipoOperacao,
        valor: valor ?? 0,
        descricao:
          item.descritivoLancamentoCompleto ||
          item.descritivoLancamentoAbreviado ||
          item.segundaLinhalLancamento ||
          "Lancamento",
        titulo: item.numeroDocumento || "",
        saldoApos: Number.isFinite(saldoApos) ? saldoApos : null,
        isFuturo: origem === "futuro",
      };
    })
    .filter((t) => {
      if (!t.dataEntrada) return false;
      const dedupeKey = `${t.dataEntrada}|${t.idTransacao}|${t.tipoOperacao}|${t.valor}|${t.descricao}|${t.isFuturo ? "futuro" : "normal"}`;
      if (seen.has(dedupeKey)) return false;
      seen.add(dedupeKey);
      return true;
    });
};

const ExtratoBancarioView = ({ getAuthHeader, showNotification }) => {
  const [dataInicio, setDataInicio] = useState(() => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    return firstDay.toISOString().slice(0, 10);
  });
  const [dataFim, setDataFim] = useState(() => new Date().toISOString().slice(0, 10));
  const [loadingExtrato, setLoadingExtrato] = useState(false);
  const [extratoError, setExtratoError] = useState("");
  const [transacoes, setTransacoes] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [contaBradesco, setContaBradesco] = useState(null);

  const carregarContaBradescoCliente = async () => {
    const response = await fetch("/api/portal/profile", {
      headers: getAuthHeader(),
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data?.message || "Falha ao carregar perfil do cliente.");
    }

    const contas = Array.isArray(data?.contas_bancarias) ? data.contas_bancarias : [];
    const conta =
      contas.find((c) => String(c?.banco || "").toLowerCase().includes("bradesco")) ||
      null;

    if (!conta) {
      throw new Error("Cliente logado nao possui conta Bradesco vinculada.");
    }

    setContaBradesco(conta);
    return conta;
  };

  const consultarExtrato = async () => {
    setLoadingExtrato(true);
    setExtratoError("");
    setTransacoes([]);

    try {
      const inicio = toDDMMYYYY(dataInicio);
      const fim = toDDMMYYYY(dataFim);
      if (!inicio || !fim) {
        throw new Error("Periodo invalido para consulta.");
      }

      const contaCliente = contaBradesco || (await carregarContaBradescoCliente());
      const agencia = String(contaCliente.agencia || "").replace(/\D/g, "").slice(0, 4);
      const conta = String(contaCliente.conta_corrente || "").replace(/\D/g, "").slice(0, 7);

      if (!agencia || !conta) {
        throw new Error("Agencia/conta Bradesco do cliente estao invalidas no cadastro.");
      }

      const response = await fetch(
        `/api/portal/bradesco/extrato?dataInicio=${inicio}&dataFim=${fim}&tipo=cc&tipoOperacao=2`,
        { headers: getAuthHeader() }
      );

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.message || "Falha ao consultar extrato Bradesco.");
      }

      const normalized = normalizeBradescoExtrato(data);
      const filtered = normalized.filter((t) =>
        isDateInRange(t.dataEntrada, dataInicio, dataFim)
      );
      setTransacoes(filtered);
      setCurrentPage(1);
    } catch (err) {
      const msg = err.message || "Erro ao consultar extrato Bradesco.";
      setExtratoError(msg);
      showNotification(msg, "error");
    } finally {
      setLoadingExtrato(false);
    }
  };

  useEffect(() => {
    carregarContaBradescoCliente()
      .then(() => consultarExtrato())
      .catch((err) => {
        const msg = err.message || "Erro ao carregar conta Bradesco do cliente.";
        setExtratoError(msg);
        showNotification(msg, "error");
      });
  }, []);

  const extratoProcessado = useMemo(() => {
    const groupedByDate = (Array.isArray(transacoes) ? transacoes : []).reduce((acc, t) => {
      const date = t.dataEntrada;
      if (!acc[date]) acc[date] = [];
      acc[date].push(t);
      return acc;
    }, {});

    const sortedDatesAsc = buildDateRange(dataInicio, dataFim);
    if (sortedDatesAsc.length === 0) return [];

    let previousDayClosing = null;
    const processedAsc = sortedDatesAsc.map((date) => {
      const transactions = [...(groupedByDate[date] || [])].sort(
        (a, b) => (a.order ?? 0) - (b.order ?? 0)
      );

      if (transactions.length === 0) {
        return {
          date,
          transactions: [],
          dailyBalance: Number.isFinite(previousDayClosing) ? previousDayClosing : null,
        };
      }

      // Regra de negócio: saldo final do dia = saldo do último lançamento do dia.
      const lastWithBalance = [...transactions]
        .reverse()
        .find((t) => Number.isFinite(t.saldoApos));

      let dailyBalance = lastWithBalance?.saldoApos ?? null;
      if (!Number.isFinite(dailyBalance) && Number.isFinite(previousDayClosing)) {
        dailyBalance = previousDayClosing;
      }

      if (Number.isFinite(dailyBalance)) {
        dailyBalance = Math.round(dailyBalance * 100) / 100;
        previousDayClosing = dailyBalance;
      }

      return {
        date,
        transactions,
        dailyBalance,
      };
    });

    return processedAsc.sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [transacoes]);

  const indexOfLastItem = currentPage * ITEMS_PER_PAGE_EXTRATO;
  const indexOfFirstItem = indexOfLastItem - ITEMS_PER_PAGE_EXTRATO;
  const currentItems = extratoProcessado.slice(indexOfFirstItem, indexOfLastItem);

  const transacoesFlatOrdenadas = useMemo(() => {
    const ascGroups = [...extratoProcessado].sort((a, b) => new Date(a.date) - new Date(b.date));
    return ascGroups.flatMap((group) =>
      (group.transactions || []).map((t) => ({
        ...t,
        groupDate: group.date,
      }))
    );
  }, [extratoProcessado]);

  const saldoFinalPeriodo = useMemo(() => {
    const groupFim = extratoProcessado.find((g) => g.date === dataFim);
    if (groupFim && Number.isFinite(groupFim.dailyBalance)) return groupFim.dailyBalance;
    const latest = extratoProcessado[0];
    return latest && Number.isFinite(latest.dailyBalance) ? latest.dailyBalance : 0;
  }, [extratoProcessado, dataFim]);

  const handleExportPdf = () => {
    if (!extratoProcessado.length) {
      showNotification("Nao ha dados para exportar em PDF.", "error");
      return;
    }

    const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
    const contaInfo = contaBradesco
      ? `${contaBradesco.banco} - ${contaBradesco.agencia}/${contaBradesco.conta_corrente}`
      : "Conta Bradesco";

    doc.setFontSize(14);
    doc.text("Extrato Bancario - Portal do Cliente", 40, 40);
    doc.setFontSize(10);
    doc.text(`Conta: ${contaInfo}`, 40, 58);
    doc.text(`Periodo: ${formatDate(dataInicio)} a ${formatDate(dataFim)}`, 40, 72);

    const saldoDiaRows = [...extratoProcessado]
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .map((group) => [
        formatDate(group.date),
        Number.isFinite(group.dailyBalance) ? formatBRLNumber(group.dailyBalance) : "-",
      ]);

    autoTable(doc, {
      startY: 86,
      head: [["Data", "Saldo final do dia"]],
      body: saldoDiaRows.length ? saldoDiaRows : [["-", "-"]],
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [55, 65, 81] },
      margin: { left: 30, right: 30 },
      tableWidth: 260,
      columnStyles: {
        1: { halign: "right" },
      },
    });

    const startMovimentosY = (doc.lastAutoTable?.finalY || 86) + 16;

    const rows = transacoesFlatOrdenadas.map((t) => {
      const isDebito = t.tipoOperacao === "D";
      const valorFormatado = formatBRLNumber(Math.abs(t.valor || 0));
      return [
        formatDate(t.groupDate || t.dataEntrada),
        isDebito ? "Debito" : "Credito",
        `${t.descricao}${t.isFuturo ? " [FUTURO]" : ""}`,
        t.titulo || "-",
        `${isDebito ? "-" : ""}${valorFormatado}`,
        Number.isFinite(t.saldoApos) ? formatBRLNumber(t.saldoApos) : "-",
      ];
    });

    autoTable(doc, {
      startY: startMovimentosY,
      head: [["Data", "Tipo", "Descricao", "Documento", "Valor", "Saldo apos"]],
      body: rows.length ? rows : [["-", "-", "Sem movimentacoes no periodo", "-", "-", "-"]],
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [31, 41, 55] },
      margin: { left: 30, right: 30 },
      didParseCell: (hookData) => {
        if (hookData.section !== "body") return;
        const tipo = String(hookData.row.raw?.[1] || "");
        // Coluna de valor com debito em vermelho.
        if (hookData.column.index === 4 && tipo === "Debito") {
          hookData.cell.styles.textColor = [220, 38, 38];
        }
      },
    });

    const finalY = doc.lastAutoTable?.finalY || 120;
    doc.setFontSize(11);
    doc.text(`Saldo final do periodo: ${formatBRLNumber(saldoFinalPeriodo)}`, 40, finalY + 24);

    doc.save(`extrato-bradesco-${dataInicio}-a-${dataFim}.pdf`);
  };

  const handleExportOfx = () => {
    if (!extratoProcessado.length) {
      showNotification("Nao ha dados para exportar em OFX.", "error");
      return;
    }

    const dtStart = toCompactDate(dataInicio) || toCompactDate(new Date().toISOString().slice(0, 10));
    const dtEnd = toCompactDate(dataFim) || dtStart;
    const contaNumero = String(contaBradesco?.conta_corrente || "").replace(/\D/g, "").slice(0, 7);
    const agenciaNumero = String(contaBradesco?.agencia || "").replace(/\D/g, "").slice(0, 4);

    const saldoDiaMap = extratoProcessado.reduce((acc, group) => {
      acc[group.date] = group.dailyBalance;
      return acc;
    }, {});

    const lastIndexByDate = {};
    transacoesFlatOrdenadas.forEach((t, idx) => {
      const dateKey = t.groupDate || t.dataEntrada;
      lastIndexByDate[dateKey] = idx;
    });

    const stmtLines = transacoesFlatOrdenadas
      .flatMap((t, idx) => {
        const trnType = t.tipoOperacao === "D" ? "DEBIT" : "CREDIT";
        const trnAmt = (t.tipoOperacao === "D" ? -1 : 1) * Math.abs(Number(t.valor || 0));
        const dateKey = t.groupDate || t.dataEntrada;
        const compactDate = toCompactDate(dateKey);
        const posted = `${compactDate}000000`;
        const fitIdBase = `${compactDate}${String(t.idTransacao || idx).replace(/\D/g, "")}`;
        const fitId = fitIdBase || `${compactDate}${idx + 1}`;
        const name = sanitizeOfxText(t.descricao).slice(0, 32) || "LANCAMENTO";
        const saldoDia = saldoDiaMap[dateKey];
        const isLastOfDay = lastIndexByDate[dateKey] === idx;
        const memo = sanitizeOfxText(
          `${t.descricao}${t.isFuturo ? " [FUTURO]" : ""}`
        ).slice(0, 120);
        const checkNum = sanitizeOfxText(t.titulo || "").slice(0, 30);

        const lancamentoPrincipal = [
          "<STMTTRN>",
          `<TRNTYPE>${trnType}`,
          `<DTPOSTED>${posted}`,
          `<TRNAMT>${trnAmt.toFixed(2)}`,
          `<FITID>${fitId}`,
          `<NAME>${name}`,
          checkNum ? `<CHECKNUM>${checkNum}` : "",
          memo ? `<MEMO>${memo}` : "",
          "</STMTTRN>",
        ]
          .filter(Boolean)
          .join("\n");

        if (!isLastOfDay || !Number.isFinite(saldoDia)) {
          return [lancamentoPrincipal];
        }

        const saldoMemo = sanitizeOfxText(`SALDO FINAL DIA: ${formatBRLNumber(saldoDia)}`).slice(0, 120);
        const saldoFitId = `${compactDate}SFD${String(idx + 1).padStart(4, "0")}`;
        const lancamentoSaldoDia = [
          "<STMTTRN>",
          `<TRNTYPE>CREDIT`,
          `<DTPOSTED>${posted}`,
          `<TRNAMT>0.00`,
          `<FITID>${saldoFitId}`,
          `<NAME>SALDO FINAL DO DIA`,
          `<MEMO>${saldoMemo}`,
          "</STMTTRN>",
        ].join("\n");

        return [lancamentoPrincipal, lancamentoSaldoDia];
      })
      .join("\n");

    const now = new Date();
    const generatedAt = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(
      now.getDate()
    ).padStart(2, "0")}${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(
      now.getSeconds()
    ).padStart(2, "0")}`;

    const ofxContent = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:${generatedAt}

<OFX>
<SIGNONMSGSRSV1>
<SONRS>
<STATUS>
<CODE>0
<SEVERITY>INFO
</STATUS>
<DTSERVER>${generatedAt}
<LANGUAGE>POR
</SONRS>
</SIGNONMSGSRSV1>
<BANKMSGSRSV1>
<STMTTRNRS>
<TRNUID>1
<STATUS>
<CODE>0
<SEVERITY>INFO
</STATUS>
<STMTRS>
<CURDEF>BRL
<BANKACCTFROM>
<BANKID>237
<BRANCHID>${agenciaNumero || "0000"}
<ACCTID>${contaNumero || "0000000"}
<ACCTTYPE>CHECKING
</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>${dtStart}000000
<DTEND>${dtEnd}235959
${stmtLines}
</BANKTRANLIST>
<LEDGERBAL>
<BALAMT>${Number(saldoFinalPeriodo || 0).toFixed(2)}
<DTASOF>${dtEnd}235959
</LEDGERBAL>
<AVAILBAL>
<BALAMT>${Number(saldoFinalPeriodo || 0).toFixed(2)}
<DTASOF>${dtEnd}235959
</AVAILBAL>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>`;

    const blob = new Blob([ofxContent], { type: "application/x-ofx" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `extrato-bradesco-${dataInicio}-a-${dataFim}.ofx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl font-bold text-white">Extrato Bancário</h2>
            <p className="text-sm text-gray-400">Consulta de extrato Bradesco (CC + Invest Facil)</p>
            {contaBradesco && (
              <p className="text-xs text-gray-500 mt-1">
                Conta vinculada: {contaBradesco.banco} - {contaBradesco.agencia}/{contaBradesco.conta_corrente}
              </p>
            )}
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="date"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
              className="bg-gray-700 border-gray-600 rounded-md shadow-sm p-2 text-white"
            />
            <input
              type="date"
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
              className="bg-gray-700 border-gray-600 rounded-md shadow-sm p-2 text-white"
            />
            <button
              onClick={consultarExtrato}
              disabled={loadingExtrato}
              className="bg-orange-500 text-white font-semibold py-2 px-4 rounded-md hover:bg-orange-600 transition disabled:opacity-60"
            >
              {loadingExtrato ? "Consultando..." : "Consultar"}
            </button>
            <button
              onClick={handleExportPdf}
              disabled={loadingExtrato || !extratoProcessado.length}
              className="bg-gray-700 text-white font-semibold py-2 px-4 rounded-md hover:bg-gray-600 transition disabled:opacity-50"
            >
              Exportar PDF
            </button>
            <button
              onClick={handleExportOfx}
              disabled={loadingExtrato || !extratoProcessado.length}
              className="bg-gray-700 text-white font-semibold py-2 px-4 rounded-md hover:bg-gray-600 transition disabled:opacity-50"
            >
              Exportar OFX
            </button>
          </div>
        </div>

        {extratoError && <p className="text-red-400 text-sm mb-4">{extratoError}</p>}

        {loadingExtrato ? (
          <p className="text-center py-10 text-gray-400">Carregando...</p>
        ) : currentItems.length > 0 ? (
          <div className="space-y-4">
            {currentItems.map((group) => (
              <div key={group.date}>
                <div className="flex justify-between items-center bg-gray-700 p-2 rounded-t-md sticky top-0 z-10">
                  <h3 className="font-semibold text-sm">{formatDate(group.date)}</h3>
                  <span className="text-sm text-gray-300">
                    Saldo final do dia:{" "}
                    <span className="font-bold text-white">
                      {group.dailyBalance === null ? "-" : formatBRLNumber(group.dailyBalance)}
                    </span>
                  </span>
                </div>
                <ul className="divide-y divide-gray-700 bg-gray-700/50 p-2 rounded-b-md">
                  {group.transactions.length === 0 ? (
                    <li className="py-3 text-sm text-gray-400">Sem movimentações no dia.</li>
                  ) : (
                    group.transactions.map((t, index) => (
                      <li
                        key={`${group.date}-${t.idTransacao || "sem-id"}-${index}-${t.valor || 0}-${t.tipoOperacao || "N"}`}
                        className="py-2 flex justify-between items-center text-sm"
                      >
                        <div>
                          <p className={`font-semibold ${t.tipoOperacao === "C" ? "text-green-400" : "text-red-400"}`}>
                            {t.descricao}
                            {t.isFuturo && (
                              <span className="ml-2 align-middle text-[10px] px-2 py-0.5 rounded bg-amber-600/20 text-amber-300 border border-amber-500/40">
                                Futuro
                              </span>
                            )}
                          </p>
                          <p className="text-gray-400 text-xs">{t.titulo}</p>
                        </div>
                        <span className={`font-bold ${t.tipoOperacao === "C" ? "text-green-400" : "text-red-400"}`}>
                          {t.tipoOperacao === "D" ? "-" : "+"}
                          {formatBRLNumber(parseFloat(t.valor))}
                          {Number.isFinite(t.saldoApos) && (
                            <span className="block text-xs text-gray-300 font-medium">
                              Saldo: {formatBRLNumber(t.saldoApos)}
                            </span>
                          )}
                        </span>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            ))}

            <div className="pt-4">
              <Pagination
                totalItems={extratoProcessado.length}
                itemsPerPage={ITEMS_PER_PAGE_EXTRATO}
                currentPage={currentPage}
                onPageChange={setCurrentPage}
              />
            </div>
          </div>
        ) : (
          <p className="text-center py-10 text-gray-400">
            Nenhum lancamento encontrado para o periodo.
          </p>
        )}
      </div>
    </motion.div>
  );
};

const NovaOperacaoView = ({ showNotification, getAuthHeader, onOperationSubmitted }) => {
  const [tiposOperacao, setTiposOperacao] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [tipoOperacaoId, setTipoOperacaoId] = useState("");
  const [simulationResult, setSimulationResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const fetchTiposOperacao = async () => {
      try {
        const res = await fetch("/api/portal/tipos-operacao", {
          headers: getAuthHeader(),
        });
        if (!res.ok)
          throw new Error("Não foi possível carregar os tipos de operação.");
        const data = await res.json();
        const formattedData = data.map((t) => ({
          ...t,
          taxaJuros: t.taxa_juros,
          valorFixo: t.valor_fixo,
        }));
        setTiposOperacao(formattedData);
      } catch (error) {
        showNotification(error.message, "error");
      }
    };
    fetchTiposOperacao();
  }, [getAuthHeader, showNotification]);

  const handleFileChange = (event) => {
    const newFiles = Array.from(event.target.files);
    const xmlFiles = newFiles.filter(file => file.type === "text/xml" || file.name.endsWith('.xml'));

    if (xmlFiles.length !== newFiles.length) {
      showNotification("Apenas arquivos XML são permitidos. Alguns arquivos foram ignorados.", "error");
    }

    setSelectedFiles(prevFiles => {
      const existingNames = new Set(prevFiles.map(f => f.name));
      const uniqueNewFiles = xmlFiles.filter(f => !existingNames.has(f.name));
      return [...prevFiles, ...uniqueNewFiles];
    });
  };

  const handleRemoveFile = (fileName) => {
    setSelectedFiles(prevFiles => prevFiles.filter(f => f.name !== fileName));
  };

  const handleSimulate = async () => {
    if (selectedFiles.length === 0 || !tipoOperacaoId) {
      showNotification(
        "Por favor, selecione ao menos um arquivo e um tipo de operação.",
        "error"
      );
      return;
    }
    setIsLoading(true);
    setSimulationResult(null);

    const formData = new FormData();
    selectedFiles.forEach(file => {
      formData.append("files", file);
    });
    formData.append("tipoOperacaoId", tipoOperacaoId);

    try {
      const response = await fetch("/api/portal/simular-operacao", {
        method: "POST",
        headers: getAuthHeader(),
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Falha ao simular operação.");
      }

      setSimulationResult(data);

    } catch (error) {
      showNotification(error.message, "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmSubmit = async () => {
    const validResults = simulationResult?.results.filter(r => !r.isDuplicate && !r.error);
    if (!validResults || validResults.length === 0) return;

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/portal/operacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({
          dataOperacao: new Date().toISOString().split("T")[0],
          tipoOperacaoId: parseInt(tipoOperacaoId),
          notasFiscais: validResults,
        }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Falha ao enviar operação.");
      }
      showNotification("Operação enviada para análise com sucesso!", "success");
      setSelectedFiles([]);
      setTipoOperacaoId("");
      setSimulationResult(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      onOperationSubmitted();
    } catch (error) {
      showNotification(error.message, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const SimulationDetails = ({ result, onSubmit, onCancel, isSubmitting }) => {
    const [expandedRow, setExpandedRow] = useState(null);
    const validResults = result.results.filter(r => !r.isDuplicate && !r.error);
    const duplicateResults = result.results.filter(r => r.isDuplicate);
    const errorResults = result.results.filter(r => r.error);

    const toggleRow = (chaveNfe) => {
      setExpandedRow(prev => (prev === chaveNfe ? null : chaveNfe));
    };

    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="bg-gray-800 p-6 rounded-lg shadow-lg"
      >
        <h3 className="text-xl font-semibold mb-4 text-orange-400">
          Resultado da Simulação
        </h3>

        {errorResults.length > 0 && (
          <div className="mb-6 bg-red-900/50 border border-red-500 rounded-lg p-4">
            <h4 className="font-bold text-red-300">Arquivos com Erro</h4>
            <ul className="mt-2 text-sm text-red-200 list-disc list-inside space-y-1">
              {errorResults.map((res, i) => <li key={i}><strong>{res.fileName}:</strong> {res.error}</li>)}
            </ul>
          </div>
        )}

        {duplicateResults.length > 0 && (
          <div className="mb-6 bg-yellow-900/50 border border-yellow-500 rounded-lg p-4">
            <h4 className="font-bold text-yellow-300">Arquivos Duplicados (Ignorados)</h4>
            <ul className="mt-2 text-sm text-yellow-200 list-disc list-inside">
              {duplicateResults.map((res, i) => <li key={i}>NF/CT-e {res.nfCte}</li>)}
            </ul>
          </div>
        )}

        {validResults.length > 0 ? (
          <div>
            <h4 className="font-bold text-green-300 mb-2">Arquivos Válidos para Envio</h4>
            <div className="border border-gray-700 rounded-lg overflow-hidden">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-700">
                  <tr className="text-left text-gray-300">
                    <th className="p-3 w-12"></th>
                    <th className="p-3">NF/CT-e</th>
                    <th className="p-3">Sacado</th>
                    <th className="p-3 text-right">Valor Bruto</th>
                    <th className="p-3 text-right">Juros (Deságio)</th>
                    <th className="p-3 text-right">Valor Líquido</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {validResults.map((res) => (
                    <React.Fragment key={res.chave_nfe}>
                      <tr onClick={() => toggleRow(res.chave_nfe)} className="cursor-pointer hover:bg-gray-700/50">
                        <td className="p-3 text-center">
                          <FaChevronRight className={`text-gray-500 transition-transform duration-200 ${expandedRow === res.chave_nfe ? 'rotate-90' : ''}`} />
                        </td>
                        <td className="p-3">{res.nfCte}</td>
                        <td className="p-3">{res.clienteSacado}</td>
                        <td className="p-3 text-right">{formatBRLNumber(res.valorNf)}</td>
                        <td className="p-3 text-right text-red-400">-{formatBRLNumber(res.jurosCalculado)}</td>
                        <td className="p-3 text-right">{formatBRLNumber(res.valorLiquidoCalculado)}</td>
                      </tr>
                      {expandedRow === res.chave_nfe && (
                        <tr className="bg-gray-900/50">
                          <td colSpan="6" className="p-0">
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="p-4">
                              <h5 className="text-xs font-bold text-gray-400 mb-2">DETALHES DAS PARCELAS</h5>
                              <table className="min-w-full text-xs bg-gray-800 rounded">
                                <thead className="bg-gray-700/50">
                                  <tr>
                                    <th className="p-2 text-left">Parcela</th>
                                    <th className="p-2 text-left">Vencimento</th>
                                    <th className="p-2 text-right">Valor</th>
                                    <th className="p-2 text-right">Juros</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-700">
                                  {res.parcelasCalculadas.map(p => (
                                    <tr key={p.numeroParcela}>
                                      <td className="p-2">{p.numeroParcela}</td>
                                      <td className="p-2">{formatDate(p.dataVencimento)}</td>
                                      <td className="p-2 text-right">{formatBRLNumber(p.valorParcela)}</td>
                                      <td className="p-2 text-right text-red-500">-{formatBRLNumber(p.jurosParcela)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </motion.div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
                <tfoot className="bg-gray-700 font-bold">
                  <tr>
                    <td className="p-3 text-right" colSpan="3">TOTAIS DA OPERAÇÃO:</td>
                    <td className="p-3 text-right">{formatBRLNumber(result.totals.totalBruto)}</td>
                    <td className="p-3 text-right text-red-400">-{formatBRLNumber(result.totals.totalJuros)}</td>
                    <td className="p-3 text-right text-green-400">{formatBRLNumber(result.totals.totalLiquido)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        ) : (
          <p className="text-center text-gray-400">Nenhum arquivo válido para ser enviado.</p>
        )}

        <div className="mt-8 flex justify-end gap-4">
          <button
            onClick={onCancel}
            className="bg-gray-600 text-gray-100 font-semibold py-2 px-6 rounded-md hover:bg-gray-500 transition"
          >
            Voltar
          </button>
          <button
            onClick={onSubmit}
            disabled={isSubmitting || validResults.length === 0}
            className="bg-green-500 text-white font-semibold py-2 px-6 rounded-md shadow-sm hover:bg-green-600 transition disabled:bg-gray-500 disabled:cursor-not-allowed"
          >
            {isSubmitting ? "Enviando..." : `Enviar ${validResults.length} Documento(s) Válido(s)`}
          </button>
        </div>
      </motion.div>
    );
  };

  return (
    <>
      {!simulationResult ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-gray-800 p-6 rounded-lg shadow-lg"
        >
          <h2 className="text-2xl font-bold text-white mb-6">
            Enviar Nova Operação
          </h2>
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                1. Selecione o Tipo de Operação
              </label>
              <select
                value={tipoOperacaoId}
                onChange={(e) => setTipoOperacaoId(e.target.value)}
                className="w-full bg-gray-700 border-gray-600 rounded-md shadow-sm p-3 text-white"
              >
                <option value="">Escolha uma opção...</option>
                {tiposOperacao.map((op) => (
                  <option key={op.id} value={op.id}>
                    {op.nome} (Taxa: {op.taxaJuros}%, Fixo:{" "}
                    {formatBRLNumber(op.valorFixo)})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                2. Faça o Upload do(s) Arquivo(s) XML
              </label>
              <div
                className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-600 border-dashed rounded-md cursor-pointer hover:border-orange-400"
                onClick={() => fileInputRef.current.click()}
              >
                <div className="space-y-1 text-center">
                  {selectedFiles.length > 0 ? (
                    <div className="flex flex-col items-center text-green-400">
                      <CheckCircleIcon />
                      <span className="font-medium mt-1">{selectedFiles.length} arquivo(s) selecionado(s)</span>
                    </div>
                  ) : (
                    <>
                      <UploadIcon />
                      <p className="text-sm text-gray-400">
                        Clique para selecionar ou arraste os arquivos aqui
                      </p>
                    </>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  id="file-upload"
                  name="file-upload"
                  type="file"
                  className="sr-only"
                  onChange={handleFileChange}
                  accept=".xml"
                  multiple
                />
              </div>
              {selectedFiles.length > 0 && (
                <div className="mt-2 text-sm text-gray-300 space-y-1">
                  {selectedFiles.map(f => (
                    <div key={f.name} className="flex items-center justify-between bg-gray-700/50 p-1 rounded">
                      <span>{f.name}</span>
                      <button onClick={() => handleRemoveFile(f.name)} className="text-red-400 hover:text-red-300">
                        <FaTimes />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="mt-8 text-right">
            <button
              onClick={handleSimulate}
              disabled={isLoading}
              className="bg-orange-500 text-white font-semibold py-2 px-6 rounded-md shadow-sm hover:bg-orange-600 transition disabled:bg-orange-400"
            >
              {isLoading ? "Processando..." : "Simular Operação"}
            </button>
          </div>
        </motion.div>
      ) : (
        <SimulationDetails
          result={simulationResult}
          onSubmit={handleConfirmSubmit}
          onCancel={() => setSimulationResult(null)}
          isSubmitting={isSubmitting}
        />
      )}
    </>
  );
};

export default function ClientDashboardPage() {
  const [operacoes, setOperacoes] = useState([]);
  const [duplicatas, setDuplicatas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeView, setActiveView] = useState("consultas");
  const [notification, setNotification] = useState({ message: "", type: "" });
  const [isRelatorioModalOpen, setIsRelatorioModalOpen] = useState(false);
  const [tiposOperacao, setTiposOperacao] = useState([]);

  const [volumeFilter, setVolumeFilter] = useState("last_6_months");
  const [volumeData, setVolumeData] = useState([]);
  const [maioresSacadosData, setMaioresSacadosData] = useState([]);
  const [chartsLoading, setChartsLoading] = useState(true);

  const [vencimentos, setVencimentos] = useState([]);
  const [diasVencimento, setDiasVencimento] = useState(15);
  const [today, setToday] = useState("");
  const [limiteCredito, setLimiteCredito] = useState(null);

  const getAuthHeader = () => {
    const token = sessionStorage.getItem("authToken");
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const showNotification = (message, type) => {
    setNotification({ message, type });
    setTimeout(() => setNotification({ message: "", type: "" }), 5000);
  };

  const fetchTableData = async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = getAuthHeader();
      const [operacoesRes, duplicatasRes] = await Promise.all([
        fetch("/api/portal/operacoes", { headers }),
        fetch("/api/portal/duplicatas", { headers }),
      ]);
      if (!operacoesRes.ok)
        throw new Error("Falha ao buscar suas operações.");
      if (!duplicatasRes.ok)
        throw new Error("Falha ao buscar suas duplicatas.");
      const operacoesData = await operacoesRes.json();
      const duplicatasData = await duplicatasRes.json();
      setOperacoes(operacoesData);
      setDuplicatas(duplicatasData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setToday(new Date().toISOString().split("T")[0]);
    const fetchDashboardData = async () => {
      setChartsLoading(true);
      try {
        const headers = getAuthHeader();
        const [volumeRes, sacadosRes, vencimentosRes, limiteRes] = await Promise.all([
          fetch(`/api/portal/volume-operado?period=${volumeFilter}`, { headers }),
          fetch(`/api/portal/maiores-sacados?period=${volumeFilter}`, { headers }),
          fetch(`/api/portal/vencimentos?diasVencimento=${diasVencimento}`, { headers }),
          fetch(`/api/portal/limite-credito`, { headers }),
        ]);
        if (!volumeRes.ok || !sacadosRes.ok || !vencimentosRes.ok || !limiteRes.ok)
          throw new Error("Falha ao carregar dados do dashboard.");

        setVolumeData(await volumeRes.json());
        setMaioresSacadosData(await sacadosRes.json());
        setVencimentos(await vencimentosRes.json());
        setLimiteCredito(await limiteRes.json());

      } catch (err) {
        showNotification(err.message, "error");
      } finally {
        setChartsLoading(false);
      }
    };

    if (activeView === "consultas") {
      fetchTableData();
      fetchDashboardData();

      // Busca todos os tipos de operação para o relatório (apenas os utilizados pelo cliente)
      const fetchAllTiposOperacao = async () => {
        try {
          const res = await fetch("/api/portal/tipos-operacao?source=used", { headers: getAuthHeader() });
          if (res.ok) {
            const data = await res.json();
            setTiposOperacao(data);
          }
        } catch (error) {
          console.error("Erro ao buscar tipos de operação para relatório:", error);
        }
      };
      fetchAllTiposOperacao();
    }
  }, [activeView, volumeFilter, diasVencimento]);

  const TabButton = ({ viewName, currentView, setView, children }) => (
    <button
      onClick={() => setView(viewName)}
      className={`font-semibold py-2 px-5 rounded-md transition-colors text-sm
                  ${currentView === viewName
          ? "bg-orange-500 text-white"
          : "bg-gray-700 text-gray-300 hover:bg-gray-600"
        }
              `}
    >
      {children}
    </button>
  );

  return (
    <div className="py-8">
      <Notification
        message={notification.message}
        type={notification.type}
        onClose={() => setNotification({ message: "", type: "" })}
      />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <RelatorioModal
          isOpen={isRelatorioModalOpen}
          onClose={() => setIsRelatorioModalOpen(false)}
          tiposOperacao={tiposOperacao}
          isPortal={true}
          fetchClientes={() => { }}
          fetchSacados={() => { }}
        />

        <div className="flex justify-between items-center mb-6">
          <div className="bg-gray-800 p-2 rounded-lg inline-flex items-center space-x-2">
            <TabButton
              viewName="consultas"
              currentView={activeView}
              setView={setActiveView}
            >
              Minhas Operações
            </TabButton>
            <TabButton
              viewName="nova-operacao"
              currentView={activeView}
              setView={setActiveView}
            >
              Enviar Nova Operação
            </TabButton>
            <TabButton
              viewName="extrato-bancario"
              currentView={activeView}
              setView={setActiveView}
            >
              Extrato Bancário
            </TabButton>
          </div>

          <button
            onClick={() => setIsRelatorioModalOpen(true)}
            className="bg-gray-800 text-orange-500 border border-orange-500 hover:bg-orange-500 hover:text-white font-semibold py-2 px-4 rounded-md transition text-sm flex items-center gap-2"
          >
            <FaFileInvoiceDollar />
            Imprimir Relatórios
          </button>
        </div>

        {/* ... (Rest of content) */}

        <div id="page-content">
          {activeView === "consultas" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                {/* Card de Limite de Crédito */}
                {limiteCredito && (
                  <div className="bg-gray-800 p-6 rounded-lg shadow-lg space-y-4">
                    <h3 className="text-lg font-semibold text-white">Limite de Crédito</h3>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-400 flex items-center gap-2"><FaCoins /> Limite Total</span>
                      <span className="font-bold text-gray-200">{formatBRLNumber(limiteCredito.limite_total)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-400 flex items-center gap-2"><FaFileInvoiceDollar /> Limite Utilizado</span>
                      <span className="font-bold text-yellow-400">{formatBRLNumber(limiteCredito.limite_utilizado)}</span>
                    </div>
                    <div className="border-t border-gray-700 my-2"></div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-green-400 flex items-center gap-2"><FaWallet /> Limite Disponível</span>
                      <span className="font-bold text-xl text-green-400">{formatBRLNumber(limiteCredito.limite_disponivel)}</span>
                    </div>
                  </div>
                )}

                {/* Card de Pendências e Vencimentos */}
                <div className="p-6 rounded-lg shadow-lg transition bg-gray-800">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold text-gray-100">
                      Pendências e Vencimentos
                    </h3>
                    <select
                      value={diasVencimento}
                      onChange={(e) => setDiasVencimento(Number(e.target.value))}
                      className="bg-gray-700 text-gray-200 border-gray-600 rounded-md p-1 text-sm focus:ring-orange-500 focus:border-orange-500"
                    >
                      <option value={5}>Próximos 5 dias</option>
                      <option value={15}>Próximos 15 dias</option>
                      <option value={30}>Próximos 30 dias</option>
                    </select>
                  </div>
                  <div className="space-y-3 max-h-48 overflow-auto pr-2">
                    {chartsLoading ? <p className="text-center text-gray-400">Carregando...</p> : vencimentos.length > 0 ? (
                      vencimentos.map((dup) => {
                        const isVencido = dup.data_vencimento < today;
                        return (
                          <div
                            key={dup.id}
                            className="flex justify-between items-center text-sm border-b border-gray-700 pb-2 last:border-none p-2"
                          >
                            <div>
                              <p className="font-medium text-gray-200">
                                {dup.cliente_sacado}
                              </p>
                              <p className="text-xs text-gray-400">
                                NF {dup.nf_cte}
                              </p>
                            </div>
                            <div className="text-right">
                              <p
                                className={`font-semibold ${isVencido ? "text-red-500" : "text-yellow-400"
                                  }`}
                              >
                                {formatDate(dup.data_vencimento)}
                              </p>
                              <p className="text-gray-300">
                                {formatBRLNumber(dup.valor_bruto)}
                              </p>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-gray-400 text-center py-10">
                        Nenhuma duplicata a vencer nos próximos {diasVencimento} dias.
                      </p>
                    )}
                  </div>
                </div>

                {/* Gráfico de Volume Operado */}
                <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold text-white">
                      Volume Operado
                    </h3>
                    <select
                      value={volumeFilter}
                      onChange={(e) => setVolumeFilter(e.target.value)}
                      className="bg-gray-700 text-gray-200 border-gray-600 rounded-md p-1 text-sm focus:ring-orange-500 focus:border-orange-500"
                    >
                      <option value="last_6_months">Últimos 6 Meses</option>
                      <option value="current_month">Mês Atual</option>
                      <option value="last_month">Mês Passado</option>
                      <option value="current_year">Este Ano</option>
                    </select>
                  </div>
                  {chartsLoading ? (
                    <div className="h-[250px] flex items-center justify-center text-gray-400">
                      Carregando...
                    </div>
                  ) : (
                    <VolumeOperadoChart data={volumeData} />
                  )}
                </div>
              </div>

              <HistoricoOperacoesTable
                operacoes={operacoes}
                loading={loading}
                error={error}
                getAuthHeader={getAuthHeader}
                showNotification={showNotification}
              />
              <AcompanhamentoDuplicatasTable
                duplicatas={duplicatas}
                loading={loading}
                error={error}
              />
              <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
                <h3 className="text-lg font-semibold text-white mb-4">
                  Maiores Sacados (no período selecionado)
                </h3>
                {chartsLoading ? (
                  <div className="h-[250px] flex items-center justify-center text-gray-400">
                    Carregando...
                  </div>
                ) : (
                  <TopFiveApex data={maioresSacadosData} />
                )}
              </div>
            </motion.div>
          )}

          {activeView === "nova-operacao" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <NovaOperacaoView
                showNotification={showNotification}
                getAuthHeader={getAuthHeader}
                onOperationSubmitted={() => {
                  setTimeout(() => {
                    fetchTableData();
                  }, 1500);
                  setActiveView('consultas');
                }}
              />
            </motion.div>
          )}

          {activeView === "extrato-bancario" && (
            <ExtratoBancarioView
              showNotification={showNotification}
              getAuthHeader={getAuthHeader}
            />
          )}
        </div>
      </div>
    </div>
  );
}
