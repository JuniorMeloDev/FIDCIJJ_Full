"use client";

import { useState, useEffect, useMemo } from "react";
import {
  formatBRLInput,
  parseBRL,
  formatBRLNumber,
} from "@/app/utils/formatters";

/**
 * Verifica se os juros da duplicata devem ser somados ao valor principal no momento da liquidação.
 * Isso acontece em operações pós-fixadas (baseadas em taxa de juros, não em valor fixo).
 * @param {object} operation - O objeto da operação.
 * @param {object} duplicate - O objeto da duplicata.
 * @returns {boolean}
 */
const isPostFixedInterest = (operation, duplicate) => {
  // Se não houver dados da operação ou da duplicata, não faz nada.
  if (!operation || !duplicate) return false;
  
  // Acessa o tipo de operação aninhado para verificar o valor_fixo
  const tipoOperacao = operation.tipo_operacao;

  // Se não houver tipo de operação ou se valor_fixo for maior que zero, os juros são PRÉ-FIXADOS.
  if (!tipoOperacao || tipoOperacao.valor_fixo > 0) {
    return false;
  }
  
  // Caso contrário, os juros são PÓS-FIXADOS e devem ser somados.
  return (duplicate.valor_juros || 0) > 0;
};

export default function LiquidacaoModal({
  isOpen,
  onClose,
  onConfirm,
  duplicata,
  contasMaster,
}) {
  const [dataLiquidacao, setDataLiquidacao] = useState("");
  const [jurosMora, setJurosMora] = useState("");
  const [desconto, setDesconto] = useState("");
  const [contaBancariaId, setContaBancariaId] = useState("");
  const [error, setError] = useState("");

  const isMultiple = Array.isArray(duplicata);

  // Cálculo do valor total com segurança para evitar "NaN"
  const totalValue = useMemo(() => {
    if (!duplicata) return 0;
    const items = isMultiple ? duplicata : [duplicata];

    return items.reduce((sum, d) => {
      const valorBruto = Number(d.valorBruto) || 0;
      const valorJuros = Number(d.valorJuros) || 0;

      // Usa a lógica para decidir se soma os juros
      if (isPostFixedInterest(d.operacao, d)) {
        return sum + valorBruto + valorJuros;
      }
      return sum + valorBruto;
    }, 0);
  }, [duplicata, isMultiple]);

  // Valor final que será exibido no modal
  const valorTotalFinal = useMemo(() => {
    return totalValue + parseBRL(jurosMora) - parseBRL(desconto);
  }, [totalValue, jurosMora, desconto]);

  const firstNfCte = isMultiple ? duplicata[0]?.nfCte : duplicata?.nfCte;

  useEffect(() => {
    if (isOpen) {
      setDataLiquidacao(new Date().toISOString().split("T")[0]);
      setJurosMora("");
      setDesconto("");
      setContaBancariaId("");
      setError("");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConfirmarCredito = () => {
    if (!contaBancariaId) {
      setError("Por favor, selecione uma conta para creditar o valor.");
      return;
    }
    setError("");
    const items = isMultiple ? duplicata : [duplicata];
    const liquidacoes = items.map(dup => ({ id: dup.id }));

    onConfirm(
      liquidacoes,
      dataLiquidacao,
      parseBRL(jurosMora),
      parseBRL(desconto),
      contaBancariaId
    );
    onClose();
  };

  const handleApenasBaixa = () => {
    setError("");
    const hoje = new Date().toISOString().split('T')[0];
    const items = isMultiple ? duplicata : [duplicata];
    const liquidacoes = items.map(d => ({ id: d.id }));
    
    onConfirm(liquidacoes, hoje, 0, 0, null);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50">
      <div className="relative bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-lg text-white">
        <h2 className="text-2xl font-bold mb-4">Confirmar Liquidação</h2>

        <p className="mb-4 text-gray-300">
          {isMultiple ? (
            <>
              Você está prestes a dar baixa em{" "}
              <span className="font-semibold text-orange-400">
                {duplicata.length} duplicatas
              </span>
              , somando o valor de{" "}
              <span className="font-semibold text-orange-400">
                {formatBRLNumber(valorTotalFinal)}
              </span>
              .
            </>
          ) : (
            <>
              Você está a dar baixa na duplicata{" "}
              <span className="font-semibold text-orange-400">
                {firstNfCte}
              </span>{" "}
              no valor de{" "}
              <span className="font-semibold text-orange-400">
                {formatBRLNumber(valorTotalFinal)}
              </span>
              .
            </>
          )}
        </p>

        <div className="mb-4 bg-gray-700 p-4 rounded-md space-y-4">
          <div>
            <label
              htmlFor="dataLiquidacao"
              className="block text-sm font-medium text-gray-300"
            >
              Data do Crédito na Conta
            </label>
            <input
              type="date"
              id="dataLiquidacao"
              value={dataLiquidacao}
              onChange={(e) => setDataLiquidacao(e.target.value)}
              className="mt-1 block w-full bg-gray-600 border-gray-500 rounded-md shadow-sm p-2"
            />
          </div>
          <div>
            <label
              htmlFor="jurosMora"
              className="block text-sm font-medium text-gray-300"
            >
              Juros / Mora (Opcional)
            </label>
            <input
              type="text"
              id="jurosMora"
              value={jurosMora}
              onChange={(e) => setJurosMora(formatBRLInput(e.target.value))}
              placeholder="R$ 0,00"
              className="mt-1 block w-full bg-gray-600 border-gray-500 rounded-md shadow-sm p-2"
            />
          </div>
          <div>
            <label
              htmlFor="desconto"
              className="block text-sm font-medium text-gray-300"
            >
              Desconto / Abatimento (Opcional)
            </label>
            <input
              type="text"
              id="desconto"
              value={desconto}
              onChange={(e) => setDesconto(formatBRLInput(e.target.value))}
              placeholder="R$ 0,00"
              className="mt-1 block w-full bg-gray-600 border-gray-500 rounded-md shadow-sm p-2"
            />
          </div>
          <div>
            <label
              htmlFor="contaBancariaId"
              className="block text-sm font-medium text-gray-300"
            >
              Conta para crédito
            </label>
            <select
              id="contaBancariaId"
              value={contaBancariaId}
              onChange={(e) => {
                setContaBancariaId(Number(e.target.value));
                setError("");
              }}
              className="mt-1 block w-full bg-gray-600 border-gray-500 rounded-md shadow-sm p-2"
            >
              <option value="">Selecione uma conta...</option>
              {contasMaster?.map((conta) => (
                <option key={conta.id} value={conta.id}>
                  {conta.banco} - Ag. {conta.agencia} / CC {conta.contaCorrente}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <p className="text-red-400 text-sm text-center mb-4">{error}</p>
        )}

        <div className="flex flex-col sm:flex-row justify-end gap-4">
          <button
            onClick={handleApenasBaixa}
            className="bg-gray-600 text-gray-100 font-semibold py-2 px-4 rounded-md hover:bg-gray-500 transition"
          >
            Apenas Dar Baixa (Sem Crédito)
          </button>
          <button
            onClick={handleConfirmarCredito}
            className="bg-green-500 text-white font-semibold py-2 px-4 rounded-md hover:bg-green-600 transition"
          >
            Confirmar e Creditar em Conta
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