"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { addMonths } from "date-fns";
import { formatBRLNumber, formatDate } from "@/app/utils/formatters";
import { buildRenegociacaoPlano } from "@/app/lib/renegociacao";

const parsePercentual = (value) => {
  if (!value) return null;
  const parsed = parseFloat(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
};

const getValorBruto = (duplicata) =>
  Number(duplicata?.valorBruto ?? duplicata?.valor_bruto ?? 0);

const getValorJuros = (duplicata) =>
  Number(duplicata?.valorJuros ?? duplicata?.valor_juros ?? 0);

const getDataVencimento = (duplicata) =>
  duplicata?.dataVencimento ?? duplicata?.data_vencimento ?? "";

const getNfCte = (duplicata) => duplicata?.nfCte ?? duplicata?.nf_cte ?? "-";

const getSacado = (duplicata) =>
  duplicata?.clienteSacado ??
  duplicata?.cliente_sacado ??
  duplicata?.sacado?.nome ??
  "-";

const getTaxaMensal = (duplicata) =>
  Number(
    duplicata?.operacao?.tipo_operacao?.taxa_juros ??
      duplicata?.operacao?.tipo_operacao?.taxa_juros_mora ??
      duplicata?.operacao?.taxa_juros ??
      duplicata?.taxaJuros ??
      duplicata?.taxa_juros ??
      0
  );

export default function RenegociacaoModal({
  isOpen,
  onClose,
  onConfirm,
  duplicatas = [],
}) {
  const [novaDataVencimento, setNovaDataVencimento] = useState("");
  const [quantidadeParcelas, setQuantidadeParcelas] = useState(1);
  const [datasParcelas, setDatasParcelas] = useState([]);
  const [informarTaxaManual, setInformarTaxaManual] = useState(false);
  const [taxaManual, setTaxaManual] = useState("");
  const [observacao, setObservacao] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const lastBaseRef = useRef({ data: "", parcelas: 1 });

  const buildDefaultParcelas = (baseData, totalParcelas) => {
    const quantidade = Math.max(1, Number(totalParcelas) || 1);
    if (!baseData) return Array.from({ length: quantidade }, () => "");
    const base = new Date(`${baseData}T12:00:00Z`);
    return Array.from({ length: quantidade }, (_, index) =>
      addMonths(base, index).toISOString().split("T")[0]
    );
  };

  useEffect(() => {
    if (!isOpen) return;
    const ids = duplicatas.map((duplicata) => duplicata.id).filter(Boolean);
    setSelectedIds(ids);
    setNovaDataVencimento("");
    setQuantidadeParcelas(1);
    setInformarTaxaManual(false);
    setTaxaManual("");
    setObservacao("");
    setError("");
    setSubmitting(false);
    setDatasParcelas([]);
    lastBaseRef.current = { data: "", parcelas: 1 };
  }, [duplicatas, isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    setDatasParcelas((prev) => {
      const nextDefault = buildDefaultParcelas(
        novaDataVencimento,
        quantidadeParcelas
      );
      const quantityChanged = lastBaseRef.current.parcelas !== quantidadeParcelas;
      const baseChanged = lastBaseRef.current.data !== novaDataVencimento;

      lastBaseRef.current = {
        data: novaDataVencimento,
        parcelas: quantidadeParcelas,
      };

      if (baseChanged) {
        return nextDefault;
      }

      if (quantityChanged) {
        return nextDefault.map((data, index) => prev[index] || data);
      }

      if (prev.length === 0) return nextDefault;
      return prev.length === nextDefault.length ? prev : nextDefault;
    });
  }, [isOpen, novaDataVencimento, quantidadeParcelas]);

  const duplicatasSelecionadas = useMemo(
    () => duplicatas.filter((duplicata) => selectedIds.includes(duplicata.id)),
    [duplicatas, selectedIds]
  );

  const plano = useMemo(() => {
    return buildRenegociacaoPlano({
      duplicatas: duplicatasSelecionadas,
      novaDataVencimento,
      quantidadeParcelas,
      datasVencimentoParcelas: datasParcelas,
      taxaJurosManual: informarTaxaManual ? parsePercentual(taxaManual) : null,
    });
  }, [
    duplicatasSelecionadas,
    informarTaxaManual,
    datasParcelas,
    novaDataVencimento,
    quantidadeParcelas,
    taxaManual,
  ]);

  const totalOriginal = plano.totalOriginal;
  const jurosTotal = plano.jurosTotal;
  const totalRenegociado = plano.totalRenegociado;

  const toggleDuplicata = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const selectAll = () =>
    setSelectedIds(duplicatas.map((duplicata) => duplicata.id).filter(Boolean));

  const clearSelection = () => setSelectedIds([]);

  if (!isOpen) return null;

  const handleConfirmar = async () => {
    if (duplicatasSelecionadas.length === 0) {
      setError("Selecione ao menos uma duplicata para renegociar.");
      return;
    }

    if (!novaDataVencimento) {
      setError("Informe a data da primeira parcela.");
      return;
    }

    const taxa = parsePercentual(taxaManual);
    if (informarTaxaManual && taxa !== null && taxa < 0) {
      setError("Informe uma taxa de juros valida.");
      return;
    }

    if (quantidadeParcelas < 1) {
      setError("A quantidade de parcelas precisa ser maior que zero.");
      return;
    }

    setError("");
    setSubmitting(true);
    try {
      await onConfirm({
        duplicataIds: selectedIds,
        novaDataVencimento,
        quantidadeParcelas,
        datasVencimentoParcelas: datasParcelas,
        jurosManual: null,
        taxaJurosManual: informarTaxaManual ? taxa : null,
        observacao,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="relative w-full max-w-6xl rounded-lg bg-gray-800 p-6 text-white shadow-xl">
        <h2 className="mb-4 text-2xl font-bold">Renegociacao</h2>

        <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-4">
          <div>
            <label className="block text-sm font-medium text-gray-300">
              Data da primeira parcela
            </label>
            <input
              type="date"
              value={novaDataVencimento}
              onChange={(e) => setNovaDataVencimento(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-600 bg-gray-700 p-2 text-gray-100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300">
              Quantidade de parcelas
            </label>
            <input
              type="number"
              min={1}
              value={quantidadeParcelas}
              onChange={(e) =>
                setQuantidadeParcelas(Math.max(1, Number(e.target.value) || 1))
              }
              className="mt-1 block w-full rounded-md border border-gray-600 bg-gray-700 p-2 text-gray-100"
            />
          </div>
          <div className="lg:col-span-2">
            <label className="block text-sm font-medium text-gray-300">
              Observacao
            </label>
            <textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              rows={2}
              className="mt-1 block w-full rounded-md border border-gray-600 bg-gray-700 p-2 text-gray-100"
            />
          </div>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
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
              onChange={(e) => setTaxaManual(e.target.value.replace(/[^\d,]/g, ""))}
              disabled={!informarTaxaManual}
              placeholder="Ex: 2,50"
              className="mt-3 block w-full rounded-md border border-gray-500 bg-gray-600 p-2 text-gray-100 disabled:opacity-50"
            />
          </div>

          <div className="rounded-md bg-gray-700 p-4 space-y-2">
            <div className="flex justify-between gap-4 text-sm">
              <span className="text-gray-300">Total selecionado</span>
              <span className="font-semibold text-gray-100">
                {formatBRLNumber(totalOriginal)}
              </span>
            </div>
            <div className="flex justify-between gap-4 text-sm">
              <span className="text-gray-300">Juros projetados</span>
              <span className="font-semibold text-orange-300">
                {formatBRLNumber(jurosTotal)}
              </span>
            </div>
            <div className="flex justify-between gap-4 border-t border-gray-600 pt-2">
              <span className="font-semibold text-gray-100">
                Total renegociado
              </span>
              <span className="font-bold text-green-300">
                {formatBRLNumber(totalRenegociado)}
              </span>
            </div>
          </div>
        </div>

        <div className="mb-4 flex items-center justify-between gap-3 rounded-md border border-gray-700 bg-gray-900/60 px-4 py-3 text-sm text-gray-300">
          <div>
            <span className="font-semibold text-gray-100">
              {selectedIds.length}
            </span>{" "}
            duplicata(s) selecionada(s)
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={selectAll}
              className="rounded-md border border-gray-600 px-3 py-1 text-xs font-semibold text-gray-200 hover:bg-gray-700"
            >
              Selecionar todas
            </button>
            <button
              type="button"
              onClick={clearSelection}
              className="rounded-md border border-gray-600 px-3 py-1 text-xs font-semibold text-gray-200 hover:bg-gray-700"
            >
              Limpar selecao
            </button>
          </div>
        </div>

        <div className="mb-4 max-h-72 overflow-auto rounded-md border border-gray-700">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-900 text-gray-300">
              <tr>
                <th className="px-3 py-2 text-left">Sel.</th>
                <th className="px-3 py-2 text-left">Sacado</th>
                <th className="px-3 py-2 text-left">NF/CT-e</th>
                <th className="px-3 py-2 text-right">Valor original</th>
                <th className="px-3 py-2 text-center">Vencimento</th>
                <th className="px-3 py-2 text-right">Taxa mensal</th>
                <th className="px-3 py-2 text-right">Juros calculados</th>
                <th className="px-3 py-2 text-right">Novo valor</th>
              </tr>
            </thead>
            <tbody>
              {duplicatas.map((duplicata) => {
                const valorOriginal = getValorBruto(duplicata);
                const valorJuros = getValorJuros(duplicata);
                const taxaMensal = informarTaxaManual
                  ? parsePercentual(taxaManual) ?? 0
                  : getTaxaMensal(duplicata);

                return (
                  <tr key={duplicata.id} className="border-t border-gray-700">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(duplicata.id)}
                        onChange={() => toggleDuplicata(duplicata.id)}
                        className="h-4 w-4 accent-orange-500"
                      />
                    </td>
                    <td className="px-3 py-2 text-gray-100">{getSacado(duplicata)}</td>
                    <td className="px-3 py-2 text-gray-300">{getNfCte(duplicata)}</td>
                    <td className="px-3 py-2 text-right text-gray-100">
                      {formatBRLNumber(valorOriginal)}
                    </td>
                    <td className="px-3 py-2 text-center text-gray-300">
                      {formatDate(getDataVencimento(duplicata))}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-100">
                      {taxaMensal.toFixed(4).replace(".", ",")}%
                    </td>
                    <td className="px-3 py-2 text-right text-orange-300">
                      {formatBRLNumber(valorJuros)}
                    </td>
                    <td className="px-3 py-2 text-right text-green-300">
                      {formatBRLNumber(valorOriginal + valorJuros)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mb-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-200">
              Parcelas geradas
            </h3>
            <span className="text-xs text-gray-400">
              As parcelas seguem intervalo mensal a partir da primeira data.
            </span>
          </div>
          <div className="max-h-56 overflow-auto rounded-md border border-gray-700">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-900 text-gray-300">
                <tr>
                  <th className="px-3 py-2 text-left">Parcela</th>
                  <th className="px-3 py-2 text-center">Vencimento</th>
                  <th className="px-3 py-2 text-right">Principal</th>
                  <th className="px-3 py-2 text-right">Juros</th>
                  <th className="px-3 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {plano.parcelasCalculadas.map((parcela) => (
                  <tr key={parcela.numeroParcela} className="border-t border-gray-700">
                    <td className="px-3 py-2 text-gray-100">{parcela.numeroParcela}</td>
                    <td className="px-3 py-2 text-center text-gray-300">
                      <input
                        type="date"
                        value={datasParcelas[parcela.numeroParcela - 1] || parcela.dataVencimento || ""}
                        onChange={(e) => {
                          const value = e.target.value;
                          setDatasParcelas((prev) => {
                            const next = [...prev];
                            next[parcela.numeroParcela - 1] = value;
                            return next;
                          });
                        }}
                        className="w-full rounded-md border border-gray-600 bg-gray-700 px-2 py-1 text-center text-gray-100"
                      />
                    </td>
                    <td className="px-3 py-2 text-right text-gray-100">
                      {formatBRLNumber(parcela.valorPrincipal)}
                    </td>
                    <td className="px-3 py-2 text-right text-orange-300">
                      {formatBRLNumber(parcela.jurosParcela)}
                    </td>
                    <td className="px-3 py-2 text-right text-green-300">
                      {formatBRLNumber(parcela.valorParcela)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {error && <p className="mb-4 text-center text-sm text-red-400">{error}</p>}

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-md bg-gray-600 px-4 py-2 font-semibold text-gray-100 transition hover:bg-gray-500 disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirmar}
            disabled={submitting || selectedIds.length === 0}
            className="rounded-md bg-orange-500 px-4 py-2 font-semibold text-white transition hover:bg-orange-600 disabled:opacity-60"
          >
            Confirmar renegociacao
          </button>
        </div>

        <button
          onClick={onClose}
          className="absolute right-3 top-3 text-2xl text-gray-400 hover:text-white"
        >
          &times;
        </button>
      </div>
    </div>
  );
}
