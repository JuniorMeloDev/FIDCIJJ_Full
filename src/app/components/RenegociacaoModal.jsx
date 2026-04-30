"use client";

import { useEffect, useMemo, useState } from "react";
import {
  formatBRLNumber,
  formatDate,
} from "@/app/utils/formatters";

const toNumber = (value) => Number(value || 0);

const parsePercentual = (value) => {
  if (!value) return 0;
  return parseFloat(String(value).replace(",", ".")) || 0;
};

const getValorBruto = (duplicata) =>
  toNumber(duplicata?.valorBruto ?? duplicata?.valor_bruto);

const getValorJuros = (duplicata) =>
  toNumber(duplicata?.valorJuros ?? duplicata?.valor_juros);

const getDataVencimento = (duplicata) =>
  duplicata?.dataVencimento ?? duplicata?.data_vencimento ?? "";

const getNfCte = (duplicata) => duplicata?.nfCte ?? duplicata?.nf_cte ?? "-";

const getSacado = (duplicata) =>
  duplicata?.clienteSacado ?? duplicata?.cliente_sacado ?? duplicata?.sacado?.nome ?? "-";

const getTaxaMensal = (duplicata) =>
  toNumber(
    duplicata?.operacao?.tipo_operacao?.taxa_juros ??
      duplicata?.operacao?.tipo_operacao?.taxa_juros_mora ??
      duplicata?.operacao?.taxa_juros ??
      duplicata?.taxaJuros ??
      duplicata?.taxa_juros ??
      0
  );

const diffDias = (dataInicial, dataFinal) => {
  if (!dataInicial || !dataFinal) return 0;
  const inicio = new Date(`${dataInicial.split("T")[0]}T00:00:00`);
  const fim = new Date(`${dataFinal}T00:00:00`);
  const diff = Math.ceil((fim - inicio) / 86400000);
  return Number.isFinite(diff) ? Math.max(diff, 0) : 0;
};

export default function RenegociacaoModal({
  isOpen,
  onClose,
  onConfirm,
  duplicatas = [],
}) {
  const [novaDataVencimento, setNovaDataVencimento] = useState("");
  const [informarTaxaManual, setInformarTaxaManual] = useState(false);
  const [taxaManual, setTaxaManual] = useState("");
  const [observacao, setObservacao] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setNovaDataVencimento("");
      setInformarTaxaManual(false);
      setTaxaManual("");
      setObservacao("");
      setError("");
      setSubmitting(false);
    }
  }, [isOpen]);

  const linhas = useMemo(
    () =>
      duplicatas.map((duplicata) => {
        const valorOriginal = getValorBruto(duplicata);
        const vencimentoAtual = getDataVencimento(duplicata);
        const dias = diffDias(vencimentoAtual, novaDataVencimento);
        const taxaMensal = informarTaxaManual
          ? parsePercentual(taxaManual)
          : getTaxaMensal(duplicata);
        const jurosCalculado = valorOriginal * (taxaMensal / 100 / 30) * dias;

        return {
          id: duplicata.id,
          sacado: getSacado(duplicata),
          nfCte: getNfCte(duplicata),
          valorOriginal,
          vencimentoAtual,
          dias,
          taxaMensal,
          jurosCalculado,
          novoValor: valorOriginal + jurosCalculado,
        };
      }),
    [duplicatas, informarTaxaManual, novaDataVencimento, taxaManual]
  );

  const totalOriginal = useMemo(
    () => linhas.reduce((sum, linha) => sum + linha.valorOriginal, 0),
    [linhas]
  );

  const jurosCalculadoTotal = useMemo(
    () => linhas.reduce((sum, linha) => sum + linha.jurosCalculado, 0),
    [linhas]
  );

  const jurosTotal = jurosCalculadoTotal;
  const totalRenegociado = totalOriginal + jurosTotal;

  if (!isOpen) return null;

  const handleConfirmar = async () => {
    if (!novaDataVencimento) {
      setError("Informe a nova data de pagamento.");
      return;
    }

    if (informarTaxaManual && taxaManual && parsePercentual(taxaManual) < 0) {
      setError("Informe uma taxa de juros válida.");
      return;
    }

    setError("");
    setSubmitting(true);
    try {
      await onConfirm({
        duplicataIds: duplicatas.map((duplicata) => duplicata.id),
        novaDataVencimento,
        jurosManual: null,
        taxaJurosManual: informarTaxaManual ? parsePercentual(taxaManual) : null,
        observacao,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4">
      <div className="relative bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-5xl text-white">
        <h2 className="text-2xl font-bold mb-4">Renegociação</h2>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-300">
              Nova data de pagamento
            </label>
            <input
              type="date"
              value={novaDataVencimento}
              onChange={(e) => setNovaDataVencimento(e.target.value)}
              className="mt-1 block w-full bg-gray-700 border border-gray-600 rounded-md shadow-sm p-2 text-gray-100 focus:ring-orange-500 focus:border-orange-500"
            />
          </div>
          <div className="lg:col-span-2">
            <label className="block text-sm font-medium text-gray-300">
              Observação
            </label>
            <textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              rows={2}
              className="mt-1 block w-full bg-gray-700 border border-gray-600 rounded-md shadow-sm p-2 text-gray-100 focus:ring-orange-500 focus:border-orange-500"
            />
          </div>
        </div>

        <div className="max-h-80 overflow-auto rounded-md border border-gray-700 mb-4">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-900 text-gray-300">
              <tr>
                <th className="px-3 py-2 text-left">Sacado</th>
                <th className="px-3 py-2 text-left">NF/CT-e</th>
                <th className="px-3 py-2 text-right">Valor original</th>
                <th className="px-3 py-2 text-center">Vencimento</th>
                <th className="px-3 py-2 text-right">Dias</th>
                <th className="px-3 py-2 text-right">Taxa mensal</th>
                <th className="px-3 py-2 text-right">Juros calculados</th>
                <th className="px-3 py-2 text-right">Novo valor</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((linha) => (
                <tr key={linha.id} className="border-t border-gray-700">
                  <td className="px-3 py-2 text-gray-100">{linha.sacado}</td>
                  <td className="px-3 py-2 text-gray-300">{linha.nfCte}</td>
                  <td className="px-3 py-2 text-right text-gray-100">
                    {formatBRLNumber(linha.valorOriginal)}
                  </td>
                  <td className="px-3 py-2 text-center text-gray-300">
                    {formatDate(linha.vencimentoAtual)}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-100">
                    {linha.dias}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-100">
                    {linha.taxaMensal.toFixed(4).replace(".", ",")}%
                  </td>
                  <td className="px-3 py-2 text-right text-orange-300">
                    {formatBRLNumber(linha.jurosCalculado)}
                  </td>
                  <td className="px-3 py-2 text-right text-green-300">
                    {formatBRLNumber(linha.novoValor)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div className="rounded-md bg-gray-700 p-4">
            <label className="flex items-center gap-2 text-sm text-gray-200">
              <input
                type="checkbox"
                checked={informarTaxaManual}
                onChange={(e) => setInformarTaxaManual(e.target.checked)}
                className="h-4 w-4 accent-orange-500"
              />
              Informar taxa de juros manualmente
            </label>
            <input
              type="text"
              value={taxaManual}
              onChange={(e) =>
                setTaxaManual(e.target.value.replace(/[^\d,]/g, ""))
              }
              disabled={!informarTaxaManual}
              placeholder="Ex: 2,50"
              className="mt-3 block w-full bg-gray-600 border border-gray-500 rounded-md shadow-sm p-2 text-gray-100 disabled:opacity-50"
            />
          </div>

          <div className="rounded-md bg-gray-700 p-4 space-y-2">
            <div className="flex justify-between gap-4 text-sm">
              <span className="text-gray-300">Total original</span>
              <span className="font-semibold text-gray-100">
                {formatBRLNumber(totalOriginal)}
              </span>
            </div>
            <div className="flex justify-between gap-4 text-sm">
              <span className="text-gray-300">
                Juros calculados
              </span>
              <span className="font-semibold text-orange-300">
                {formatBRLNumber(jurosTotal)}
              </span>
            </div>
            <div className="flex justify-between gap-4 border-t border-gray-600 pt-2">
              <span className="font-semibold text-gray-100">
                Novo total renegociado
              </span>
              <span className="font-bold text-green-300">
                {formatBRLNumber(totalRenegociado)}
              </span>
            </div>
          </div>
        </div>

        {error && <p className="text-red-400 text-sm text-center mb-4">{error}</p>}

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="bg-gray-600 text-gray-100 font-semibold py-2 px-4 rounded-md hover:bg-gray-500 transition disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirmar}
            disabled={submitting || duplicatas.length === 0}
            className="bg-orange-500 text-white font-semibold py-2 px-4 rounded-md hover:bg-orange-600 transition disabled:opacity-60"
          >
            Confirmar renegociação
          </button>
        </div>

        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-400 hover:text-white text-2xl"
        >
          &times;
        </button>
      </div>
    </div>
  );
}
