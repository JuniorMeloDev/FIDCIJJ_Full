'use client';

import { useState, useEffect } from 'react';
import { formatBRLNumber, formatDisplayConta } from '@/app/utils/formatters';

const formatarDataParaDisplay = (dataISO) => {
  if (!dataISO || typeof dataISO !== 'string') return '';
  const partes = dataISO.split('-');
  if (partes.length === 3) {
    return `${partes[2]}/${partes[1]}/${partes[0]}`;
  }
  return dataISO;
};

export default function LancamentoExtratoModal({
  isOpen,
  onClose,
  onSave,
  transacao,
  contasInternas = [],
  showNotification
}) {
  const [descricao, setDescricao] = useState('');
  const [contaBancaria, setContaBancaria] = useState('');
  const [categoria, setCategoria] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [natureza, setNatureza] = useState('Despesas Financeiras');

  const isDebito = transacao?.valor < 0;

  useEffect(() => {
    if (isOpen && transacao) {
      setDescricao(transacao.descricao || '');
      const contaInicial = transacao.conta_bancaria || '';
      setContaBancaria(contaInicial);
      setCategoria(isDebito ? 'Despesa Avulsa' : 'Receita Avulsa');
      setNatureza(isDebito ? 'Despesas Financeiras' : 'Receitas Financeiras');
      setError('');
    }
  }, [isOpen, transacao, isDebito]);

  const handleSave = async () => {
    setError('');

    if (!contaBancaria) {
      setError('Por favor, selecione a conta interna para vincular este lançamento.');
      return;
    }
    if (!descricao || descricao.trim() === '') {
      setError('A descrição é obrigatória.');
      return;
    }
    if (!categoria) {
      setError('Erro interno: Categoria não definida.');
      return;
    }

    setLoading(true);

    const dataISO = transacao.data;
    if (!dataISO || typeof dataISO !== 'string') {
      setError('Data da transação inválida ou não encontrada.');
      setLoading(false);
      return;
    }

    const payload = {
      data_movimento: dataISO,
      descricao,
      valor: parseFloat(transacao.valor),
      conta_bancaria: contaBancaria,
      categoria,
      transaction_id: transacao.idTransacao || transacao.transaction_id,
      natureza: isDebito ? natureza : 'Receitas Financeiras'
    };

    const success = await onSave(payload);

    if (success) {
      if (showNotification) {
        showNotification('Movimento Criado com Sucesso', 'success');
      }
      onClose();
    }

    setLoading(false);
  };

  if (!isOpen || !transacao) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl border border-gray-600 bg-gray-800 text-white shadow-2xl sm:max-w-lg sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-gray-700 px-5 py-4 sm:px-6">
          <h2 className="text-lg font-bold sm:text-xl">Conciliação Manual</h2>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-6">
          <div className="space-y-4">
            <div className="rounded-md bg-gray-700 p-4">
              <p className="text-sm text-gray-300">Data: {formatarDataParaDisplay(transacao.data)}</p>
              <p className="text-sm text-gray-300">
                Valor:
                <span className={`ml-2 font-bold ${isDebito ? 'text-red-400' : 'text-green-400'}`}>
                  {formatBRLNumber(transacao.valor)}
                </span>
              </p>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-300">
                Descrição <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={descricao}
                onChange={(e) => {
                  setDescricao(e.target.value);
                  if (error) setError('');
                }}
                className="w-full rounded border border-gray-600 bg-gray-700 p-3 text-white outline-none focus:border-orange-500"
                placeholder="Descrição do lançamento..."
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-300">
                Conta Interna <span className="text-red-400">*</span>
              </label>
              <select
                value={contaBancaria}
                onChange={(e) => setContaBancaria(e.target.value)}
                className="w-full rounded border border-gray-600 bg-gray-700 p-3 text-white outline-none focus:border-orange-500"
              >
                <option value="">Selecione uma conta...</option>
                {contasInternas.map((conta) => (
                  <option key={conta.id} value={conta.contaBancaria}>
                    {formatDisplayConta(conta.contaBancaria)}
                  </option>
                ))}
              </select>
            </div>

            {isDebito && (
              <div>
                <label className="mb-1 block text-sm font-medium text-orange-400">
                  Natureza (Classificação DRE) <span className="text-red-400">*</span>
                </label>
                <select
                  value={natureza}
                  onChange={(e) => setNatureza(e.target.value)}
                  className="w-full rounded-md border border-gray-600 bg-gray-700 p-3 text-white outline-none focus:border-orange-500"
                >
                  <option value="Despesas Administrativas">Despesas Administrativas</option>
                  <option value="Despesas Financeiras">Despesas Financeiras</option>
                  <option value="Despesas Tributárias">Despesas Tributárias</option>
                  <option value="Serviços de Terceiros (FIDC)">Serviços de Terceiros</option>
                  <option value="Aquisição de Direitos Creditórios">Aquisição de Direitos Creditórios</option>
                  <option value="Distribuição de Lucros / Amortização">Distribuição de Lucros / Amortização</option>
                  <option value="Transferência Entre Contas">Transferência Entre Contas</option>
                  <option value="Empréstimos / Mútuos">Empréstimos / Mútuos</option>
                  <option value="Outras Despesas">Outras Despesas</option>
                </select>
              </div>
            )}
          </div>

          {error && (
            <div className="mt-4 rounded border border-red-500 bg-red-900/50 p-3 text-center text-sm text-red-200">
              {error}
            </div>
          )}
        </div>

        <div className="border-t border-gray-700 px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <button
              onClick={onClose}
              className="w-full rounded-md bg-gray-600 px-4 py-3 font-semibold text-white transition hover:bg-gray-500 sm:w-auto"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={loading}
              className="w-full rounded-md bg-green-600 px-4 py-3 font-semibold text-white transition hover:bg-green-700 disabled:opacity-50 sm:w-auto"
            >
              {loading ? 'Salvando...' : 'Confirmar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
