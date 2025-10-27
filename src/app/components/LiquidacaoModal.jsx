// src/app/components/LiquidacaoModal.jsx
"use client";

import { useState, useEffect, useMemo } from "react";
// Importar a função de formatação correta
import {
  formatBRLInput,
  parseBRL,
  formatBRLNumber,
  formatDate, // Adicione se precisar formatar datas aqui
  formatDisplayConta // Certifique-se que esta função está importada
} from "@/app/utils/formatters";

export default function LiquidacaoModal({
  isOpen,
  onClose,
  onConfirm,
  duplicata,
  contasMaster, // Verifique se esta prop está sendo recebida corretamente
}) {
  const [dataLiquidacao, setDataLiquidacao] = useState("");
  const [jurosMora, setJurosMora] = useState("");
  const [desconto, setDesconto] = useState("");
  const [contaBancariaId, setContaBancariaId] = useState("");
  const [error, setError] = useState("");

  const isMultiple = Array.isArray(duplicata);

  // Função interna para verificar juros pós-fixados (mantida)
  const isPostFixedInterest = (operation, duplicate) => {
    if (!operation) return false;
    const totalDescontadoNaOrigem = (operation.valor_total_bruto || 0) - (operation.valor_liquido || 0);
    const descontosEsperadosPreFixado = (operation.valor_total_juros || 0) + (operation.valor_total_descontos || 0);
    // Considera uma pequena margem para erros de arredondamento
    if (totalDescontadoNaOrigem < (descontosEsperadosPreFixado - 0.01)) {
        return (duplicate.valorJuros || duplicate.valor_juros || 0) > 0;
    }
    return false;
  };

  // Calcula o valor total a ser liquidado (considerando juros pós-fixados se aplicável)
  const totalValue = useMemo(() => {
    if (!duplicata) return 0;
    const items = isMultiple ? duplicata : [duplicata];
    return items.reduce((sum, d) => {
      const valorBruto = Number(d.valorBruto || d.valor_bruto) || 0;
      const valorJuros = Number(d.valorJuros || d.valor_juros) || 0;
      // Assume que 'd.operacao' está disponível se 'duplicata' for um array de objetos completos
      const ehPosFixado = isPostFixedInterest(d.operacao, d);
      return sum + (ehPosFixado ? valorBruto + valorJuros : valorBruto);
    }, 0);
  }, [duplicata, isMultiple]);


  // Calcula o valor final considerando juros/mora e descontos
  const valorTotalFinal = useMemo(() => {
    return totalValue + parseBRL(jurosMora) - parseBRL(desconto);
  }, [totalValue, jurosMora, desconto]);

  const firstNfCte = isMultiple ? duplicata[0]?.nfCte : duplicata?.nfCte;

  // Reseta o estado do modal quando ele é aberto
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

  // Função chamada ao confirmar o crédito
  const handleConfirmarCredito = () => {
    if (!contaBancariaId) {
      setError("Por favor, selecione uma conta para creditar o valor.");
      return;
    }
    setError("");
    const items = isMultiple ? duplicata : [duplicata];
    // A API só aceita o ID, não podemos mandar o nome formatado aqui sem mudar o backend
    const liquidacoes = items.map(dup => ({ id: dup.id }));

    // Chama a função onConfirm passada pelo componente pai
    onConfirm(
      liquidacoes,
      dataLiquidacao,
      parseBRL(jurosMora),
      parseBRL(desconto),
      contaBancariaId // Envia o ID numérico como esperado pela API atual
    );
    onClose(); // Fecha o modal
  };

  // Função chamada para apenas dar baixa (sem crédito em conta)
  const handleApenasBaixa = () => {
    setError("");
    const hoje = new Date().toISOString().split('T')[0];
    const items = isMultiple ? duplicata : [duplicata];
    const liquidacoes = items.map(d => ({ id: d.id }));

    // Chama onConfirm sem contaBancariaId
    onConfirm(liquidacoes, hoje, 0, 0, null);
    onClose(); // Fecha o modal
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50">
      <div className="relative bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-lg text-white">
        <h2 className="text-2xl font-bold mb-4">Confirmar Liquidação</h2>

        {/* Mensagem descritiva */}
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

        {/* Inputs */}
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
                // Converte para número ou string vazia
                setContaBancariaId(e.target.value ? Number(e.target.value) : "");
                setError("");
              }}
              className="mt-1 block w-full bg-gray-600 border-gray-500 rounded-md shadow-sm p-2"
            >
              <option value="">Selecione uma conta...</option>
              {/* --- EXIBIÇÃO CORRIGIDA --- */}
              {Array.isArray(contasMaster) && contasMaster.map((conta) => {
                  // Verifica se o objeto 'conta' e suas propriedades existem
                  if (!conta || !conta.id || !conta.banco || !conta.agencia || !conta.conta_corrente) {
                      console.warn("Item inválido em contasMaster:", conta);
                      return null; // Pula a renderização deste item
                  }
                  // Monta a string completa ANTES de formatar para exibição
                  const contaCompleta = `${conta.banco} - Ag. ${conta.agencia} / CC ${conta.conta_corrente}`;
                  return (
                    // O 'value' é o ID numérico
                    <option key={conta.id} value={conta.id}>
                      {formatDisplayConta(contaCompleta)} {/* Formata apenas para EXIBIÇÃO */}
                    </option>
                  );
                })}
              {/* --- FIM DA CORREÇÃO --- */}
            </select>
          </div>
        </div>

        {error && (
          <p className="text-red-400 text-sm text-center mb-4">{error}</p>
        )}

        {/* Botões */}
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