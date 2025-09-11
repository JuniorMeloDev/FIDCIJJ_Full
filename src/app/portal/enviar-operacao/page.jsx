"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import {formatBRLNumber, formatDate,} from "@/app/utils/formatters";
import Notification from "@/app/components/Notification";

// Ícones SVG embutidos
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

export default function EnviarOperacaoPage() {
  const [tiposOperacao, setTiposOperacao] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState([]); // Alterado para array
  const [tipoOperacaoId, setTipoOperacaoId] = useState("");
  const [simulationResult, setSimulationResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notification, setNotification] = useState({ message: "", type: "" });
  const fileInputRef = useRef(null);

  const getAuthHeader = () => {
    const token = sessionStorage.getItem("authToken");
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const showNotification = (message, type) => {
    setNotification({ message, type });
    setTimeout(() => setNotification({ message: "", type: "" }), 5000);
  };

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
  }, []);

  const handleFileChange = (event) => {
    const files = Array.from(event.target.files);
    const xmlFiles = files.filter(file => file.type === "text/xml" || file.name.endsWith('.xml'));
    
    if (xmlFiles.length !== files.length) {
        showNotification("Apenas arquivos XML são permitidos. Alguns arquivos foram ignorados.", "error");
    }
    
    setSelectedFiles(xmlFiles);
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
        formData.append("files", file); // Usar 'files' no plural
    });
    formData.append("tipoOperacaoId", tipoOperacaoId);

    try {
      const response = await fetch("/api/portal/simular-operacao", {
        method: "POST",
        headers: getAuthHeader(),
        body: formData,
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Falha ao simular operação.");
      }
      const data = await response.json();
      
      if (data.results.some(r => r.isDuplicate)) {
          showNotification("Atenção: Um ou mais documentos já foram processados e foram ignorados.", "error");
      }
      
      const validResults = data.results.filter(r => !r.isDuplicate && !r.error);
      if (validResults.length === 0) {
          throw new Error("Nenhum dos arquivos enviados pôde ser processado. Verifique os arquivos e tente novamente.");
      }
      
      setSimulationResult({ ...data, results: validResults });

    } catch (error) {
      showNotification(error.message, "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmSubmit = async () => {
    if (!simulationResult || simulationResult.results.length === 0) return;
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/portal/operacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({
          dataOperacao: new Date().toISOString().split("T")[0],
          tipoOperacaoId: parseInt(tipoOperacaoId),
          notasFiscais: simulationResult.results,
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
    } catch (error) {
      showNotification(error.message, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const SimulationDetails = ({ result, onSubmit, onCancel }) => (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="bg-gray-800 p-6 rounded-lg shadow-lg"
    >
      <h3 className="text-xl font-semibold mb-4 text-orange-400">
        Resumo da Operação
      </h3>
      <div className="space-y-4">
        <div className="border border-gray-700 rounded-lg overflow-hidden">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-700">
              <tr className="text-left text-gray-300">
                <th className="p-3">NF/CT-e</th>
                <th className="p-3">Sacado</th>
                <th className="p-3 text-right">Valor Bruto</th>
                <th className="p-3 text-right">Juros (Deságio)</th>
                <th className="p-3 text-right">Valor Líquido</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {result.results.map((res) => (
                <tr key={res.chave_nfe}>
                  <td className="p-3">{res.nfCte}</td>
                  <td className="p-3">{res.clienteSacado}</td>
                  <td className="p-3 text-right">{formatBRLNumber(res.valorNf)}</td>
                  <td className="p-3 text-right text-red-400">-{formatBRLNumber(res.jurosCalculado)}</td>
                  <td className="p-3 text-right">{formatBRLNumber(res.valorLiquidoCalculado)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-700 font-bold">
                <tr>
                    <td className="p-3 text-right" colSpan="2">TOTAIS DA OPERAÇÃO:</td>
                    <td className="p-3 text-right">{formatBRLNumber(result.totals.totalBruto)}</td>
                    <td className="p-3 text-right text-red-400">-{formatBRLNumber(result.totals.totalJuros)}</td>
                    <td className="p-3 text-right text-green-400">{formatBRLNumber(result.totals.totalLiquido)}</td>
                </tr>
            </tfoot>
          </table>
        </div>
      </div>
      <div className="mt-8 flex justify-end gap-4">
        <button
          onClick={onCancel}
          className="bg-gray-600 text-gray-100 font-semibold py-2 px-6 rounded-md hover:bg-gray-500 transition"
        >
          Cancelar
        </button>
        <button
          onClick={onSubmit}
          disabled={isSubmitting}
          className="bg-green-500 text-white font-semibold py-2 px-6 rounded-md shadow-sm hover:bg-green-600 transition disabled:bg-green-400"
        >
          {isSubmitting ? "Enviando..." : "Confirmar e Enviar para Análise"}
        </button>
      </div>
    </motion.div>
  );

  return (
    <>
      <Notification
        message={notification.message}
        type={notification.type}
        onClose={() => setNotification({ message: "", type: "" })}
      />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
                        <ul className="text-xs text-gray-400 list-disc list-inside">
                            {selectedFiles.map(f => <li key={f.name}>{f.name}</li>)}
                        </ul>
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
                    multiple // Habilita a seleção múltipla
                  />
                </div>
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
          />
        )}
      </div>
    </>
  );
}