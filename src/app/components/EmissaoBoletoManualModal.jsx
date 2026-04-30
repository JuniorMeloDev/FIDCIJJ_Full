"use client";

import { useEffect, useMemo, useState } from "react";
import { formatBRLInput, parseBRL, formatBRLNumber } from "@/app/utils/formatters";

const initialForm = {
  banco: "itau",
  sacadoId: "",
  vencimento: "",
  valor: "",
  seuNumero: "",
  descricao: "",
  abatimento: "",
};

const bancoLabels = {
  itau: "Itau",
  safra: "Safra",
  bradesco: "Bradesco",
  inter: "Inter",
};

export default function EmissaoBoletoManualModal({
  isOpen,
  onClose,
  getAuthHeader,
  showNotification,
}) {
  const [form, setForm] = useState(initialForm);
  const [sacadoBusca, setSacadoBusca] = useState("");
  const [sacados, setSacados] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [resultado, setResultado] = useState(null);

  const valorNumerico = useMemo(() => parseBRL(form.valor), [form.valor]);
  const abatimentoNumerico = useMemo(() => parseBRL(form.abatimento), [form.abatimento]);

  useEffect(() => {
    if (!isOpen) return;

    setForm(initialForm);
    setSacadoBusca("");
    setSacados([]);
    setResultado(null);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || sacadoBusca.trim().length < 2 || form.sacadoId) {
      setSacados([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const response = await fetch(
          `/api/cadastros/sacados/search?nome=${encodeURIComponent(sacadoBusca.trim())}`,
          { headers: getAuthHeader() }
        );
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.message || "Falha ao buscar sacados.");
        }
        const data = await response.json();
        setSacados(Array.isArray(data) ? data : []);
      } catch (error) {
        showNotification(error.message, "error");
      } finally {
        setIsSearching(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [form.sacadoId, getAuthHeader, isOpen, sacadoBusca, showNotification]);

  if (!isOpen) return null;

  const updateForm = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setResultado(null);
  };

  const selecionarSacado = (sacado) => {
    setSacadoBusca(sacado.nome || "");
    setSacados([]);
    updateForm("sacadoId", sacado.id);
  };

  const limparSacado = () => {
    setSacadoBusca("");
    setSacados([]);
    updateForm("sacadoId", "");
  };

  const validarFormulario = () => {
    if (!form.banco) return "Selecione o banco.";
    if (!form.sacadoId) return "Selecione um sacado da lista.";
    if (!form.vencimento) return "Informe o vencimento.";
    if (valorNumerico <= 0) return "Informe um valor maior que zero.";
    if (abatimentoNumerico < 0) return "O abatimento nao pode ser negativo.";
    if (abatimentoNumerico >= valorNumerico) return "O abatimento deve ser menor que o valor.";
    if (!form.seuNumero.trim()) return "Informe seu numero/referencia.";
    if (!form.descricao.trim()) return "Informe a descricao.";
    return null;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const validationError = validarFormulario();
    if (validationError) {
      showNotification(validationError, "error");
      return;
    }

    setIsLoading(true);
    setResultado(null);
    showNotification(`Emitindo boleto ${bancoLabels[form.banco]}...`, "info");

    try {
      const response = await fetch("/api/boletos/emitir-manual", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({
          banco: form.banco,
          sacadoId: form.sacadoId,
          vencimento: form.vencimento,
          valor: valorNumerico,
          seuNumero: form.seuNumero.trim(),
          descricao: form.descricao.trim(),
          abatimento: abatimentoNumerico,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Falha ao emitir boleto manual.");
      }

      setResultado(data);
      showNotification("Boleto emitido com sucesso!", "success");
    } catch (error) {
      showNotification(error.message, "error");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4">
      <div className="bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-3xl text-white">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <h2 className="text-2xl font-bold">Emissao Manual de Boletos</h2>
            <p className="text-sm text-gray-300 mt-1">
              Preencha os dados do boleto sem vincular a uma duplicata.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="text-gray-300 hover:text-white disabled:opacity-50"
          >
            Fechar
          </button>
        </div>

        {!resultado ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1" htmlFor="bancoManual">
                  Banco
                </label>
                <select
                  id="bancoManual"
                  value={form.banco}
                  onChange={(event) => updateForm("banco", event.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-md p-2"
                  disabled={isLoading}
                >
                  <option value="itau">Itau</option>
                  <option value="safra">Safra</option>
                  <option value="bradesco">Bradesco</option>
                  <option value="inter">Inter</option>
                </select>
              </div>

              <div className="relative">
                <label className="block text-sm font-medium text-gray-300 mb-1" htmlFor="sacadoManual">
                  Sacado
                </label>
                <div className="flex gap-2">
                  <input
                    id="sacadoManual"
                    type="text"
                    value={sacadoBusca}
                    onChange={(event) => {
                      setSacadoBusca(event.target.value);
                      updateForm("sacadoId", "");
                    }}
                    placeholder="Digite ao menos 2 letras"
                    className="w-full bg-gray-700 border border-gray-600 rounded-md p-2"
                    disabled={isLoading}
                  />
                  {form.sacadoId && (
                    <button
                      type="button"
                      onClick={limparSacado}
                      className="bg-gray-600 px-3 rounded-md hover:bg-gray-500"
                      disabled={isLoading}
                    >
                      Limpar
                    </button>
                  )}
                </div>
                {(isSearching || sacados.length > 0) && (
                  <div className="absolute z-10 mt-1 w-full bg-gray-900 border border-gray-600 rounded-md shadow-lg max-h-44 overflow-y-auto">
                    {isSearching ? (
                      <p className="px-3 py-2 text-sm text-gray-300">Buscando...</p>
                    ) : (
                      sacados.map((sacado) => (
                        <button
                          key={sacado.id}
                          type="button"
                          onClick={() => selecionarSacado(sacado)}
                          className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-700"
                        >
                          <span className="font-medium">{sacado.nome}</span>
                          <span className="block text-xs text-gray-400">{sacado.cnpj}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1" htmlFor="vencimentoManual">
                  Vencimento
                </label>
                <input
                  id="vencimentoManual"
                  type="date"
                  value={form.vencimento}
                  onChange={(event) => updateForm("vencimento", event.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-md p-2"
                  disabled={isLoading}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1" htmlFor="valorManual">
                  Valor
                </label>
                <input
                  id="valorManual"
                  type="text"
                  value={form.valor}
                  onChange={(event) => updateForm("valor", formatBRLInput(event.target.value))}
                  placeholder="R$ 0,00"
                  className="w-full bg-gray-700 border border-gray-600 rounded-md p-2"
                  disabled={isLoading}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1" htmlFor="seuNumeroManual">
                  Seu numero / referencia
                </label>
                <input
                  id="seuNumeroManual"
                  type="text"
                  value={form.seuNumero}
                  onChange={(event) => updateForm("seuNumero", event.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-md p-2"
                  disabled={isLoading}
                  maxLength={25}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1" htmlFor="abatimentoManual">
                  Abatimento opcional
                </label>
                <input
                  id="abatimentoManual"
                  type="text"
                  value={form.abatimento}
                  onChange={(event) => updateForm("abatimento", formatBRLInput(event.target.value))}
                  placeholder="R$ 0,00"
                  className="w-full bg-gray-700 border border-gray-600 rounded-md p-2"
                  disabled={isLoading}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1" htmlFor="descricaoManual">
                Descricao
              </label>
              <textarea
                id="descricaoManual"
                value={form.descricao}
                onChange={(event) => updateForm("descricao", event.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 min-h-24"
                disabled={isLoading}
                maxLength={180}
              />
            </div>

            <div className="bg-gray-900/70 rounded-md p-3 text-sm text-gray-300 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <span>Valor final</span>
              <strong className="text-white">
                {formatBRLNumber(Math.max(valorNumerico - abatimentoNumerico, 0))}
              </strong>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isLoading}
                className="bg-gray-600 text-gray-100 font-semibold py-2 px-4 rounded-md hover:bg-gray-500 transition disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="bg-orange-500 text-white font-semibold py-2 px-4 rounded-md hover:bg-orange-600 transition disabled:opacity-50"
              >
                {isLoading ? "Emitindo..." : "Confirmar Emissao"}
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="bg-green-900/40 border border-green-700 rounded-md p-4">
              <h3 className="font-semibold text-green-200 mb-3">Boleto emitido</h3>
              <div className="space-y-2 text-sm">
                <p><strong>ID salvo:</strong> {resultado.id}</p>
                <p><strong>Nosso numero:</strong> {resultado.nossoNumero || "N/A"}</p>
                <p><strong>Linha digitavel:</strong> {resultado.linhaDigitavel || "N/A"}</p>
                <p><strong>Codigo de barras:</strong> {resultado.codigoBarras || "N/A"}</p>
              </div>
            </div>

            <div className="flex justify-between gap-3">
              {resultado.pdfUrl ? (
                <a
                  href={resultado.pdfUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="bg-blue-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-blue-700 transition"
                >
                  Imprimir
                </a>
              ) : (
                <span className="text-sm text-gray-400 self-center">PDF ainda nao disponivel para emissao manual.</span>
              )}
              <button
                type="button"
                onClick={onClose}
                className="bg-gray-600 text-gray-100 font-semibold py-2 px-4 rounded-md hover:bg-gray-500 transition"
              >
                Fechar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
