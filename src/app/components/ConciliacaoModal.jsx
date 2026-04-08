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

export default function ConciliacaoModal({ isOpen, onClose, onConfirm, transacao, searchDuplicatas, contaApi = '', onManualEntry, onOpenOfxConciliacao }) {
    const [searchResults, setSearchResults] = useState([]);
    const [selectedItemsData, setSelectedItemsData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [busca, setBusca] = useState('');
    const [activePanel, setActivePanel] = useState('buscar');
    const [contaDestinoId, setContaDestinoId] = useState('');
    const [listaContas, setListaContas] = useState([]);
    const [isClienteModalOpen, setIsClienteModalOpen] = useState(false);
    const [clienteBusca, setClienteBusca] = useState('');
    const [clienteResultados, setClienteResultados] = useState([]);
    const [loadingClientes, setLoadingClientes] = useState(false);
    const [clienteSelecionado, setClienteSelecionado] = useState(null);

    const selectedIds = useMemo(() => new Set(selectedItemsData.map(item => item.id)), [selectedItemsData]);

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
                const contaCorrespondente = data.find(c => c.conta_corrente.includes(contaApi));
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
            setSelectedItemsData(prev => prev.filter(item => item.id !== duplicata.id));
        } else {
            setSelectedItemsData(prev => [...prev, {
                ...duplicata,
                juros: 0,
                desconto: 0,
                jurosBase: getEmbeddedInterestValue(duplicata)
            }]);
        }
    };

    const handleItemValueChange = (id, field, value) => {
        setSelectedItemsData(prev => prev.map(item =>
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

        const contaObj = listaContas.find(c => String(c.id) === String(contaDestinoId));
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
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-[60] p-4" onClick={onClose}>
            <div className="bg-gray-800 p-5 rounded-lg shadow-xl w-full max-w-7xl text-white flex flex-col max-h-[92vh]" onClick={(e) => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-3">
                    <h2 className="text-xl font-bold">Conciliar Recebimento</h2>
                    <div className="flex gap-2">
                        {onOpenOfxConciliacao && (
                            <button
                                onClick={() => { onClose(); onOpenOfxConciliacao(); }}
                                className="bg-indigo-600 text-sm px-3 py-1 rounded hover:bg-indigo-700"
                            >
                                Abrir Conciliacao OFX
                            </button>
                        )}
                        {onManualEntry && (
                            <button
                                onClick={() => { onClose(); onManualEntry(); }}
                                className="bg-blue-600 text-sm px-3 py-1 rounded hover:bg-blue-700"
                            >
                                Fazer Lancamento Manual
                            </button>
                        )}
                        <button onClick={onClose} className="text-gray-400 hover:text-white font-bold text-xl">&times;</button>
                    </div>
                </div>

                <div className="bg-gray-900/60 rounded-md px-3 py-2 mb-3 text-sm flex flex-wrap gap-3 items-center">
                    <span className="text-gray-300"><strong>Data:</strong> {formatDate(transacao.data)}</span>
                    <span className="text-gray-300 truncate" title={transacao.descricao}><strong>Descricao:</strong> {transacao.descricao}</span>
                    <span className="ml-auto font-semibold text-green-400">Valor Recebido: {formatBRLNumber(transacao.valor)}</span>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 flex-grow min-h-0">
                    <div className="lg:hidden flex gap-2">
                        <button
                            onClick={() => setActivePanel('buscar')}
                            className={`flex-1 py-2 rounded-md text-sm font-semibold ${activePanel === 'buscar' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'}`}
                        >
                            Buscar Titulos
                        </button>
                        <button
                            onClick={() => setActivePanel('selecionados')}
                            className={`flex-1 py-2 rounded-md text-sm font-semibold ${activePanel === 'selecionados' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'}`}
                        >
                            Selecionados
                        </button>
                    </div>

                    <div className={`xl:col-span-4 flex flex-col min-h-0 border border-gray-700 rounded-md p-3 bg-gray-900/40 ${activePanel === 'buscar' ? 'flex' : 'hidden'} lg:flex`}>
                        <h3 className="text-sm font-semibold text-gray-300 mb-2">Buscar Titulo no Sistema</h3>
                        {clienteSelecionado && (
                            <div className="mb-2 flex items-center justify-between gap-2 rounded-md border border-blue-700 bg-blue-950/30 px-3 py-2 text-xs text-blue-200">
                                <span className="truncate">Titulos em aberto de: <strong>{clienteSelecionado.nome}</strong></span>
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
                        <div className="flex gap-2 mb-2">
                            <input
                                type="text"
                                value={busca}
                                onChange={(e) => setBusca(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                placeholder="Digite Sacado ou NF/CTe..."
                                className="flex-grow bg-gray-700 border-gray-600 rounded-md p-2 text-sm focus:border-blue-500 outline-none"
                            />
                            <button onClick={handleSearch} disabled={loading} className="bg-blue-600 font-semibold py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50">
                                {loading ? '...' : 'Buscar'}
                            </button>
                        </div>
                        <div className="flex-grow space-y-2 overflow-y-auto border border-gray-700 p-2 rounded-md bg-gray-900/30">
                            {loading && <p className="text-center text-sm p-4 text-gray-400">Buscando...</p>}
                            {!loading && searchResults.length === 0 && (busca.trim().length > 2 || clienteSelecionado) && (
                                <p className="text-center text-xs text-gray-500 mt-4">Nada encontrado.</p>
                            )}
                            {!loading && searchResults.map(d => (
                                <label key={d.id} className={`flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors ${selectedIds.has(d.id) ? 'bg-gray-700 border border-blue-500' : 'hover:bg-gray-700 border border-transparent'}`}>
                                    <input type="checkbox" checked={selectedIds.has(d.id)} onChange={() => handleToggleDuplicata(d)} className="h-4 w-4 rounded text-blue-500 focus:ring-0" />
                                    <div className="flex-grow grid grid-cols-1 text-sm">
                                        <div className="flex justify-between">
                                            <span className="font-bold text-white">{d.nfCte || d.nf_cte}</span>
                                            <span className="text-green-300">{formatBRLNumber(getDuplicateDisplayValue(d))}</span>
                                        </div>
                                        <span className="truncate text-xs text-gray-400" title={d.clienteSacado || d.cliente_sacado}>{d.clienteSacado || d.cliente_sacado}</span>
                                    </div>
                                </label>
                            ))}
                        </div>
                    </div>

                    <div className={`xl:col-span-6 flex flex-col min-h-0 border border-gray-700 rounded-md p-3 bg-gray-900 ${activePanel === 'selecionados' ? 'flex' : 'hidden'} lg:flex`}>
                        <h3 className="text-sm font-semibold text-gray-300 mb-2">Titulos Selecionados</h3>
                        <div className="flex-grow overflow-y-auto space-y-2 pr-1">
                            {selectedItemsData.length > 0 ? selectedItemsData.map(d => (
                                <div key={d.id} className="bg-gray-800/80 border border-gray-700 rounded-md p-2">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex items-start gap-2 min-w-0">
                                            <button onClick={() => handleToggleDuplicata(d)} className="text-red-400 hover:text-red-300 text-base font-bold leading-none mt-[2px]" title="Remover">&times;</button>
                                            <div className="min-w-0">
                                                <div className="text-sm font-semibold">{d.nfCte || d.nf_cte}</div>
                                                <div className="text-[11px] text-gray-400 truncate" title={d.clienteSacado || d.cliente_sacado}>{d.clienteSacado || d.cliente_sacado}</div>
                                            </div>
                                        </div>
                                        <div className="text-right text-green-300 text-sm whitespace-nowrap">{formatBRLNumber(getDuplicateDisplayValue(d))}</div>
                                    </div>
                                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                                        <div className="sm:col-span-2">
                                            <label className="text-[10px] text-gray-500 block">Juros/Multa</label>
                                            <input
                                                type="text"
                                                value={formatBRLInput(d.juros)}
                                                onChange={(e) => handleItemValueChange(d.id, 'juros', e.target.value)}
                                                className="bg-gray-700 border border-gray-600 p-1 text-xs rounded w-full text-right text-yellow-300"
                                            />
                                        </div>
                                        <div className="sm:col-span-2">
                                            <label className="text-[10px] text-gray-500 block">Desconto</label>
                                            <input
                                                type="text"
                                                value={formatBRLInput(d.desconto)}
                                                onChange={(e) => handleItemValueChange(d.id, 'desconto', e.target.value)}
                                                className="bg-gray-700 border border-gray-600 p-1 text-xs rounded w-full text-right text-blue-300"
                                            />
                                        </div>
                                    </div>
                                </div>
                            )) : (
                                <p className="text-center text-sm text-gray-500 p-4 mt-6">Selecione os titulos na esquerda para vincular a este recebimento.</p>
                            )}
                        </div>
                    </div>

                    <div className="xl:col-span-2 flex flex-col min-h-0 border border-gray-700 rounded-md p-3 bg-gray-900/60">
                        <label htmlFor="contaDestino" className="block text-xs font-bold text-orange-400 mb-1 uppercase">
                            Conta de Entrada (Destino)
                        </label>
                        <select
                            id="contaDestino"
                            value={contaDestinoId}
                            onChange={(e) => setContaDestinoId(e.target.value)}
                            className="w-full bg-gray-900 border border-gray-500 rounded-md shadow-sm text-sm p-2 text-white focus:ring-orange-500 focus:border-orange-500"
                        >
                            <option value="">-- Escolha a conta --</option>
                            {listaContas.map((conta) => (
                                <option key={conta.id} value={conta.id}>
                                    {conta.banco} - Ag: {conta.agencia} CC: {conta.conta_corrente} {conta.descricao ? `(${conta.descricao})` : ''}
                                </option>
                            ))}
                        </select>

                        <div className="mt-3 p-3 bg-gray-900 rounded-md border border-gray-700 text-center">
                            <p className="text-xs text-gray-400 uppercase">Total Selecionado</p>
                            <p className={`text-lg font-bold ${!saldoOk ? 'text-red-400' : 'text-green-400'}`}>{formatBRLNumber(valorFinalCalculado)}</p>
                            <div className="h-px bg-gray-700 my-2"></div>
                            <p className="text-xs text-gray-400 uppercase">Valor do Extrato</p>
                            <p className="text-lg font-bold text-white">{formatBRLNumber(valorExtrato)}</p>
                            <div className="h-px bg-gray-700 my-2"></div>
                            <p className="text-xs text-gray-400 uppercase">Diferenca</p>
                            <p className={`text-lg font-bold ${!saldoOk ? 'text-red-500' : 'text-green-500'}`}>{formatBRLNumber(saldoRestante)}</p>
                        </div>

                        {error && <p className="text-red-400 text-sm mt-3 text-center bg-red-900/20 p-2 rounded border border-red-800">{error}</p>}

                        <div className="mt-4 flex flex-col gap-2 hidden lg:flex">
                            {selectedIds.size > 0 && saldoOk && (
                                <button
                                    onClick={handleConfirmar}
                                    className="font-bold py-2 px-4 rounded-md transition-all transform active:scale-95 bg-green-600 hover:bg-green-500 text-white shadow-lg"
                                >
                                    Confirmar Conciliacao
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                <div className="mt-4 flex flex-col gap-2 lg:hidden">
                    {selectedIds.size > 0 && saldoOk && (
                        <button
                            onClick={handleConfirmar}
                            className="font-bold py-2 px-4 rounded-md transition-all transform active:scale-95 bg-green-600 hover:bg-green-500 text-white shadow-lg"
                        >
                            Confirmar Conciliacao
                        </button>
                    )}
                </div>
            </div>

            {isClienteModalOpen && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4" onClick={() => setIsClienteModalOpen(false)}>
                    <div className="w-full max-w-lg rounded-lg border border-gray-700 bg-gray-900 p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between gap-3">
                            <h3 className="text-lg font-bold text-white">Buscar Titulos Por Cliente</h3>
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
                                className="w-full rounded-md border border-gray-600 bg-gray-800 p-2 text-sm text-white outline-none focus:border-blue-500"
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
    );
}
