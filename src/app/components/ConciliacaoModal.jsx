'use client';

import { useState, useEffect, useMemo } from 'react';
import { formatBRLNumber, formatDate, formatBRLInput, parseBRL } from '../utils/formatters';

const isPostFixedInterest = (operation, duplicate) => {
  if (!operation) return false;

  const totalDescontadoNaOrigem = (operation.valor_total_bruto || 0) - (operation.valor_liquido || 0);
  const descontosEsperadosPreFixado = (operation.valor_total_juros || 0) + (operation.valor_total_descontos || 0);

  if (totalDescontadoNaOrigem < (descontosEsperadosPreFixado - 0.01)) {
    return (duplicate.valorJuros || duplicate.valor_juros || 0) > 0;
  }

  return false;
};

const getDuplicateDisplayValue = (duplicate) => {
  const valorBase = Number(duplicate.valorBruto ?? duplicate.valor_bruto ?? 0);
  const valorJuros = Number(duplicate.valorJuros ?? duplicate.valor_juros ?? 0);
  return isPostFixedInterest(duplicate.operacao, duplicate) ? valorBase + valorJuros : valorBase;
};

const getEmbeddedInterestValue = (duplicate) => {
  return isPostFixedInterest(duplicate.operacao, duplicate)
    ? Number(duplicate.valorJuros ?? duplicate.valor_juros ?? 0)
    : 0;
};

export default function ConciliacaoModal({
  isOpen,
  onClose,
  onConfirm,
  transacao,
  searchDuplicatas,
  contaApi = '',
  onManualEntry,
  onOpenOfxConciliacao
}) {
  const [searchResults, setSearchResults] = useState([]);
  const [selectedItemsData, setSelectedItemsData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busca, setBusca] = useState('');
  const [activePanel, setActivePanel] = useState('buscar');
  const [showHeaderActions, setShowHeaderActions] = useState(false);
  const [mobilePreviewDuplicata, setMobilePreviewDuplicata] = useState(null);
  const [contaDestinoId, setContaDestinoId] = useState('');
  const [listaContas, setListaContas] = useState([]);
  const [isClienteModalOpen, setIsClienteModalOpen] = useState(false);
  const [clienteBusca, setClienteBusca] = useState('');
  const [clienteResultados, setClienteResultados] = useState([]);
  const [loadingClientes, setLoadingClientes] = useState(false);
  const [clienteSelecionado, setClienteSelecionado] = useState(null);

  const selectedIds = useMemo(() => new Set(selectedItemsData.map((item) => item.id)), [selectedItemsData]);

  const valorFinalCalculado = useMemo(() => {
    return selectedItemsData.reduce((sum, item) => {
      const valorBase = getDuplicateDisplayValue(item);
      const juros = Number(item.juros || 0);
      const desconto = Number(item.desconto || 0);
      return sum + valorBase + juros - desconto;
    }, 0);
  }, [selectedItemsData]);

  const valorExtrato = Number(transacao?.valor || 0);
  const saldoRestante = valorExtrato - valorFinalCalculado;
  const saldoRestanteCentavos = Math.round(valorExtrato * 100) - Math.round(valorFinalCalculado * 100);
  const saldoOk = Math.abs(saldoRestanteCentavos) <= 5;

  useEffect(() => {
    if (!isOpen) return;

    setSearchResults([]);
    setSelectedItemsData([]);
    setBusca('');
    setError('');
    setClienteBusca('');
    setClienteResultados([]);
    setClienteSelecionado(null);
    setIsClienteModalOpen(false);
    setShowHeaderActions(false);
    setMobilePreviewDuplicata(null);

    fetchContas();
  }, [isOpen]);

  const fetchContas = async () => {
    try {
      const token = sessionStorage.getItem('authToken');
      const response = await fetch('/api/cadastros/contas/master', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      setListaContas(data || []);

      if (contaApi && data) {
        const contaCorrespondente = data.find((c) => c.conta_corrente.includes(contaApi));
        if (contaCorrespondente) {
          setContaDestinoId(contaCorrespondente.id);
          return;
        }
      }

      if (data && data.length > 0) {
        setContaDestinoId(data[0].id);
      }
    } catch (err) {
      console.error('Erro ao buscar contas:', err);
    }
  };

  const fetchClientes = async (query) => {
    const token = sessionStorage.getItem('authToken');
    if (!token || !query || query.trim().length < 2) {
      setClienteResultados([]);
      return;
    }

    setLoadingClientes(true);
    try {
      const response = await fetch(`/api/cadastros/clientes/search?nome=${encodeURIComponent(query.trim())}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = response.ok ? await response.json() : [];
      setClienteResultados(Array.isArray(data) ? data : []);
    } catch {
      setClienteResultados([]);
    } finally {
      setLoadingClientes(false);
    }
  };

  if (!isOpen || !transacao) return null;

  const handleSearch = async () => {
    const normalizedBusca = busca.trim();

    if (!normalizedBusca) {
      setIsClienteModalOpen(true);
      setClienteBusca('');
      setClienteResultados([]);
      setError('');
      return;
    }

    if (normalizedBusca.length < 2) {
      setSearchResults([]);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const resultados = await searchDuplicatas(normalizedBusca);
      setSearchResults(resultados);
      setClienteSelecionado(null);
      if (resultados.length === 0) setError('Nenhuma duplicata pendente encontrada para a busca.');
    } catch {
      setError('Erro ao buscar duplicatas.');
    } finally {
      setLoading(false);
    }
  };

  const handleBuscarPorCliente = async (cliente) => {
    if (!cliente?.id) return;

    setLoading(true);
    setError('');
    try {
      const resultados = await searchDuplicatas({ clienteId: cliente.id });
      setSearchResults(resultados);
      setClienteSelecionado(cliente);
      setBusca('');
      setIsClienteModalOpen(false);

      if (resultados.length === 0) {
        setError(`Nenhuma duplicata pendente encontrada para ${cliente.nome}.`);
      }
    } catch {
      setError('Erro ao buscar duplicatas do cliente.');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleDuplicata = (duplicata) => {
    if (selectedIds.has(duplicata.id)) {
      setSelectedItemsData((prev) => prev.filter((item) => item.id !== duplicata.id));
    } else {
      setSelectedItemsData((prev) => [...prev, {
        ...duplicata,
        juros: 0,
        desconto: 0,
        jurosBase: getEmbeddedInterestValue(duplicata)
      }]);
    }
  };

  const handleItemValueChange = (id, field, value) => {
    setSelectedItemsData((prev) => prev.map((item) =>
      item.id === id ? { ...item, [field]: parseBRL(value) } : item
    ));
  };

  const handleConfirmar = () => {
    if (!saldoOk) {
      setError(`O valor final (${formatBRLNumber(valorFinalCalculado)}) nao corresponde ao valor recebido. Diferenca: ${formatBRLNumber(saldoRestante)}`);
      return;
    }

    if (!contaDestinoId) {
      setError('Por favor, selecione a conta de destino para este lancamento.');
      return;
    }

    const contaObj = listaContas.find((c) => String(c.id) === String(contaDestinoId));
    if (!contaObj) {
      setError('Erro ao identificar a conta selecionada.');
      return;
    }

    const nomeContaFormatado = `${contaObj.banco} - ${contaObj.agencia}/${contaObj.conta_corrente}`;
    const itemsPayload = selectedItemsData.map(({ id, juros, desconto, jurosBase }) => ({
      id,
      juros,
      desconto,
      jurosBase: Number(jurosBase || 0)
    }));

    onConfirm({
      items: itemsPayload,
      detalhesTransacao: transacao,
      contaBancaria: nomeContaFormatado
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="flex h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-t-3xl bg-gray-800 text-white shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-gray-700 bg-gray-800 px-4 py-4 md:px-5 md:py-4">
          <div className="flex items-start justify-between gap-3 md:hidden">
            <div className="min-w-0 flex-1">
              <h2 className="text-2xl font-bold">Conciliar Recebimento</h2>
              <p className="mt-1 text-sm text-gray-400">Compare o recebimento com títulos pendentes e concilie em poucos toques.</p>
            </div>
            <button
              type="button"
              onClick={() => setShowHeaderActions((value) => !value)}
              className="rounded-md border border-gray-600 bg-gray-900/95 px-4 py-2 text-sm font-semibold text-gray-100 shadow-2xl transition hover:bg-gray-800"
              aria-expanded={showHeaderActions}
              aria-controls="conciliacao-header-actions"
            >
              Ações
            </button>
          </div>

          <div className="md:hidden">
            <div
              id="conciliacao-header-actions"
              className={`fixed right-0 top-[calc(33vh+4.5rem)] z-[69] w-72 overflow-hidden rounded-l-2xl border border-gray-700 border-r-0 bg-gray-900 shadow-2xl transition-transform duration-300 ease-out ${showHeaderActions ? 'translate-x-0' : 'translate-x-full'}`}
            >
              {onOpenOfxConciliacao && (
                <button
                  type="button"
                  onClick={() => { setShowHeaderActions(false); onClose(); onOpenOfxConciliacao(); }}
                  className="block w-full border-b border-gray-700 px-4 py-3 text-left text-sm font-semibold text-white transition hover:bg-gray-800"
                >
                  Abrir Conciliação OFX
                </button>
              )}
              {onManualEntry && (
                <button
                  type="button"
                  onClick={() => { setShowHeaderActions(false); onClose(); onManualEntry(); }}
                  className={`block w-full px-4 py-3 text-left text-sm font-semibold text-white transition hover:bg-gray-800 ${onOpenOfxConciliacao ? '' : 'border-t border-gray-700'}`}
                >
                  Fazer Lançamento Manual
                </button>
              )}
              <button
                type="button"
                onClick={() => { setShowHeaderActions(false); onClose(); }}
                className="block w-full border-t border-gray-700 px-4 py-3 text-left text-sm font-semibold text-red-300 transition hover:bg-gray-800"
              >
                Fechar modal
              </button>
            </div>
          </div>

          <div className="hidden items-center justify-between gap-4 md:flex">
            <div className="min-w-0">
              <h2 className="text-2xl font-bold">Conciliar Recebimento</h2>
              <p className="mt-1 text-sm text-gray-400">Compare o recebimento com títulos pendentes e concilie em poucos toques.</p>
            </div>
            <div className="flex items-center gap-3">
              {onOpenOfxConciliacao && (
                <button
                  onClick={() => { onClose(); onOpenOfxConciliacao(); }}
                  className="rounded-md bg-indigo-600 px-4 py-3 text-sm font-semibold transition hover:bg-indigo-700 md:px-3 md:py-2"
                >
                  Abrir Conciliação OFX
                </button>
              )}
              {onManualEntry && (
                <button
                  onClick={() => { onClose(); onManualEntry(); }}
                  className="rounded-md bg-blue-600 px-4 py-3 text-sm font-semibold transition hover:bg-blue-700 md:px-3 md:py-2"
                >
                  Fazer Lançamento Manual
                </button>
              )}
              <button onClick={onClose} className="rounded-md px-4 py-3 text-2xl font-bold text-gray-400 transition hover:text-white md:px-2 md:py-1">
                &times;
              </button>
            </div>
          </div>
        </div>

        <div className="border-b border-gray-700 bg-gray-900/60 px-5 py-3 text-sm">
          <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
            <span className="text-gray-300"><strong>Data:</strong> {formatDate(transacao.data)}</span>
            <span className="truncate text-gray-300" title={transacao.descricao}><strong>Descricao:</strong> {transacao.descricao}</span>
            <span className="font-semibold text-green-400 md:ml-auto">Valor Recebido: {formatBRLNumber(transacao.valor)}</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 lg:hidden">
            <div className="rounded-xl border border-gray-700 bg-gray-900/70 p-3">
              <span className="block text-[10px] uppercase tracking-wide text-gray-500">Valor selecionado</span>
              <span className="mt-1 block text-base font-bold text-green-300">{formatBRLNumber(valorFinalCalculado)}</span>
            </div>
            <div className="rounded-xl border border-gray-700 bg-gray-900/70 p-3">
              <span className="block text-[10px] uppercase tracking-wide text-gray-500">Diferença</span>
              <span className={`mt-1 block text-base font-bold ${saldoOk ? 'text-emerald-400' : 'text-red-400'}`}>{formatBRLNumber(saldoRestante)}</span>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="grid min-h-full grid-cols-1 gap-4 p-4 xl:grid-cols-12">
            <div className="flex gap-2 lg:hidden xl:col-span-12">
              <button
                onClick={() => setActivePanel('buscar')}
                className={`flex-1 rounded-md py-3 text-sm font-semibold ${activePanel === 'buscar' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'}`}
              >
                Buscar Títulos
              </button>
              <button
                onClick={() => setActivePanel('selecionados')}
                className={`flex-1 rounded-md py-3 text-sm font-semibold ${activePanel === 'selecionados' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'}`}
              >
                Selecionados
              </button>
            </div>

            <div className={`flex min-h-0 flex-col rounded-md border border-gray-700 bg-gray-900/40 p-3 ${activePanel === 'buscar' ? 'flex' : 'hidden'} lg:flex xl:col-span-4`}>
              <h3 className="mb-2 text-sm font-semibold text-gray-300">Buscar Título no Sistema</h3>
              {clienteSelecionado && (
                <div className="mb-2 flex items-center justify-between gap-2 rounded-md border border-blue-700 bg-blue-950/30 px-3 py-2 text-xs text-blue-200">
                  <span className="truncate">Títulos em aberto de: <strong>{clienteSelecionado.nome}</strong></span>
                  <button
                    onClick={() => {
                      setClienteSelecionado(null);
                      setSearchResults([]);
                    }}
                    className="text-blue-300 hover:text-white"
                  >
                    limpar
                  </button>
                </div>
              )}
              <div className="mb-2 flex gap-2">
                <input
                  type="text"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="Digite Sacado ou NF/CTe..."
                  className="min-w-0 flex-grow rounded-md border border-gray-600 bg-gray-700 p-3 text-sm outline-none focus:border-blue-500"
                />
                <button onClick={handleSearch} disabled={loading} className="rounded-md bg-blue-600 px-4 py-3 font-semibold transition hover:bg-blue-700 disabled:opacity-50">
                  {loading ? '...' : 'Buscar'}
                </button>
              </div>
              <div className="flex-grow space-y-3 overflow-y-auto rounded-2xl border border-gray-700 bg-gray-900/30 p-3 pb-6">
                {loading && <p className="p-4 text-center text-sm text-gray-400">Buscando...</p>}
                {!loading && searchResults.length === 0 && (busca.trim().length > 2 || clienteSelecionado) && (
                  <p className="mt-4 text-center text-xs text-gray-500">Nada encontrado.</p>
                )}
                {!loading && searchResults.map((d) => (
                  <label
                    key={d.id}
                    onClick={() => setMobilePreviewDuplicata(d)}
                    className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 shadow-sm transition-colors ${mobilePreviewDuplicata?.id === d.id ? 'border-cyan-400 bg-cyan-950/30' : selectedIds.has(d.id) ? 'border-blue-500 bg-gray-700' : 'border-gray-700 bg-gray-800/80 hover:border-gray-500 hover:bg-gray-700'}`}
                  >
                    <input type="checkbox" checked={selectedIds.has(d.id)} onChange={() => handleToggleDuplicata(d)} className="mt-1 h-4 w-4 shrink-0 rounded text-blue-500 focus:ring-0" />
                    <div className="min-w-0 flex-grow text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <span className="block text-xs uppercase tracking-wide text-gray-400">Título</span>
                          <span className="block font-bold text-white">{d.nfCte || d.nf_cte}</span>
                        </div>
                        <span className="shrink-0 text-right font-bold text-green-300">{formatBRLNumber(getDuplicateDisplayValue(d))}</span>
                      </div>
                      <span className="mt-2 block truncate text-xs text-gray-300" title={d.clienteSacado || d.cliente_sacado}>{d.clienteSacado || d.cliente_sacado}</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className={`flex min-h-0 flex-col rounded-md border border-gray-700 bg-gray-900 p-3 ${activePanel === 'selecionados' ? 'flex' : 'hidden'} lg:flex xl:col-span-6`}>
              <h3 className="mb-2 text-sm font-semibold text-gray-300">Títulos Selecionados</h3>
              <div className="flex-grow space-y-3 overflow-y-auto pr-1 pb-6">
                {selectedItemsData.length > 0 ? selectedItemsData.map((d) => (
                  <div key={d.id} className="rounded-2xl border border-gray-700 bg-gray-800/90 p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-2">
                        <button onClick={() => handleToggleDuplicata(d)} className="mt-[2px] text-base font-bold leading-none text-red-400 hover:text-red-300" title="Remover">&times;</button>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold">{d.nfCte || d.nf_cte}</div>
                          <div className="truncate text-[11px] text-gray-400" title={d.clienteSacado || d.cliente_sacado}>{d.clienteSacado || d.cliente_sacado}</div>
                        </div>
                      </div>
                      <div className="flex-shrink-0 whitespace-nowrap text-right text-sm text-green-300">{formatBRLNumber(getDuplicateDisplayValue(d))}</div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <div className="sm:col-span-2">
                        <label className="block text-[10px] text-gray-500">Juros/Multa</label>
                        <input
                          type="text"
                          value={formatBRLInput(d.juros)}
                          onChange={(e) => handleItemValueChange(d.id, 'juros', e.target.value)}
                          className="w-full rounded border border-gray-600 bg-gray-700 p-2 text-right text-xs text-yellow-300"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-[10px] text-gray-500">Desconto</label>
                        <input
                          type="text"
                          value={formatBRLInput(d.desconto)}
                          onChange={(e) => handleItemValueChange(d.id, 'desconto', e.target.value)}
                          className="w-full rounded border border-gray-600 bg-gray-700 p-2 text-right text-xs text-blue-300"
                        />
                      </div>
                    </div>
                  </div>
                )) : (
                  <p className="mt-6 p-4 text-center text-sm text-gray-500">Selecione os títulos na esquerda para vincular a este recebimento.</p>
                )}
              </div>
            </div>

            <div className="flex min-h-0 flex-col rounded-md border border-gray-700 bg-gray-900/60 p-3 xl:col-span-2">
              <label htmlFor="contaDestino" className="mb-1 block text-xs font-bold uppercase text-orange-400">
                Conta de Entrada (Destino)
              </label>
              <select
                id="contaDestino"
                value={contaDestinoId}
                onChange={(e) => setContaDestinoId(e.target.value)}
                className="w-full rounded-md border border-gray-500 bg-gray-900 p-3 text-sm text-white outline-none focus:border-orange-500 focus:ring-orange-500"
              >
                <option value="">-- Escolha a conta --</option>
                {listaContas.map((conta) => (
                  <option key={conta.id} value={conta.id}>
                    {conta.banco} - Ag: {conta.agencia} CC: {conta.conta_corrente} {conta.descricao ? `(${conta.descricao})` : ''}
                  </option>
                ))}
              </select>

              <div className="mt-3 rounded-md border border-gray-700 bg-gray-900 p-3 text-center">
                <p className="text-xs uppercase text-gray-400">Total Selecionado</p>
                <p className={`text-lg font-bold ${!saldoOk ? 'text-red-400' : 'text-green-400'}`}>{formatBRLNumber(valorFinalCalculado)}</p>
                <div className="my-2 h-px bg-gray-700" />
                <p className="text-xs uppercase text-gray-400">Valor do Extrato</p>
                <p className="text-lg font-bold text-white">{formatBRLNumber(valorExtrato)}</p>
                <div className="my-2 h-px bg-gray-700" />
                <p className="text-xs uppercase text-gray-400">Diferenca</p>
                <p className={`text-lg font-bold ${!saldoOk ? 'text-red-500' : 'text-green-500'}`}>{formatBRLNumber(saldoRestante)}</p>
              </div>

              {error && <p className="mt-3 rounded border border-red-800 bg-red-900/20 p-2 text-center text-sm text-red-400">{error}</p>}

              <div className="mt-4 hidden flex-col gap-2 lg:flex">
                {selectedIds.size > 0 && saldoOk && (
                  <button
                    onClick={handleConfirmar}
                    className="rounded-md bg-green-600 px-4 py-3 font-bold text-white shadow-lg transition-all active:scale-95 hover:bg-green-500"
                  >
                    Confirmar Conciliação
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="border-t border-gray-700 px-4 py-4 lg:hidden">
            {selectedIds.size > 0 && saldoOk && (
              <button
                onClick={handleConfirmar}
                className="w-full rounded-md bg-green-600 px-4 py-3 font-bold text-white shadow-lg transition-all active:scale-95 hover:bg-green-500"
              >
                Confirmar Conciliação
              </button>
            )}
          </div>
        </div>

        {isClienteModalOpen && (
          <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" onClick={() => setIsClienteModalOpen(false)}>
            <div className="w-full max-w-lg rounded-t-3xl border border-gray-700 bg-gray-900 p-4 shadow-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-bold text-white">Buscar Títulos Por Cliente</h3>
                <button onClick={() => setIsClienteModalOpen(false)} className="text-xl font-bold text-gray-400 hover:text-white">&times;</button>
              </div>
              <p className="mt-2 text-sm text-gray-400">
                Como a busca veio vazia, informe o cliente para listar as duplicatas em aberto.
              </p>
              <div className="mt-3">
                <input
                  type="text"
                  value={clienteBusca}
                  onChange={(e) => {
                    const value = e.target.value;
                    setClienteBusca(value);
                    fetchClientes(value);
                  }}
                  placeholder="Digite o nome do cliente..."
                  className="w-full rounded-md border border-gray-600 bg-gray-800 p-3 text-sm text-white outline-none focus:border-blue-500"
                />
              </div>
              <div className="mt-3 max-h-72 space-y-2 overflow-y-auto rounded-md border border-gray-700 bg-gray-950/40 p-2">
                {loadingClientes && <p className="p-3 text-center text-sm text-gray-400">Buscando clientes...</p>}
                {!loadingClientes && clienteBusca.trim().length >= 2 && clienteResultados.length === 0 && (
                  <p className="p-3 text-center text-sm text-gray-500">Nenhum cliente encontrado.</p>
                )}
                {!loadingClientes && clienteResultados.map((cliente) => (
                  <button
                    key={cliente.id}
                    onClick={() => handleBuscarPorCliente(cliente)}
                    className="block w-full rounded-md border border-transparent bg-gray-800 p-3 text-left hover:border-blue-500 hover:bg-gray-700"
                  >
                    <div className="text-sm font-semibold text-white">{cliente.nome}</div>
                    <div className="text-xs text-gray-400">{cliente.cnpj || cliente.cpf_cnpj || cliente.cnpj_cpf || 'Documento nao informado'}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

