'use client';

import { useState } from 'react';
import { formatBRLNumber, formatDate, formatBRLInput, parseBRL } from '../utils/formatters.jsx';
import { differenceInDays } from 'date-fns';

export default function RecompraModal({ isOpen, onClose, onConfirm, dataNovaOperacao, clienteId }) {
    const [searchTerm, setSearchTerm] = useState({ nfCte: '', sacadoNome: '' });
    // Alterado: duplicatasEncontradas agora acumula resultados
    const [duplicatasEncontradas, setDuplicatasEncontradas] = useState([]);
    const [selectedDuplicatas, setSelectedDuplicatas] = useState(new Set());

    const [jurosAdicionais, setJurosAdicionais] = useState('');
    const [outrosAbatimentos, setOutrosAbatimentos] = useState('');

    const [calculo, setCalculo] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const isPostFixedInterest = (operation, duplicate) => {
        if (!operation) return false;
        const totalDescontadoNaOrigem = (operation.valor_total_bruto || 0) - (operation.valor_liquido || 0);
        const descontosEsperadosPreFixado = (operation.valor_total_juros || 0) + (operation.valor_total_descontos || 0);
        if (totalDescontadoNaOrigem < (descontosEsperadosPreFixado - 0.01)) {
            return (duplicate.valorJuros || duplicate.valor_juros || 0) > 0;
        }
        return false;
    };

    const getValorRecompraDuplicata = (duplicate) => {
        const valorBruto = Number(duplicate.valorBruto || duplicate.valor_bruto) || 0;
        const valorJuros = Number(duplicate.valorJuros || duplicate.valor_juros) || 0;
        const ehPosFixado = isPostFixedInterest(duplicate.operacao, duplicate);
        return ehPosFixado ? valorBruto + valorJuros : valorBruto;
    };

    const handleClose = () => {
        setSearchTerm({ nfCte: '', sacadoNome: '' });
        setDuplicatasEncontradas([]);
        setSelectedDuplicatas(new Set());
        setCalculo(null);
        setJurosAdicionais('');
        setOutrosAbatimentos('');
        setError('');
        onClose();
    };

    // Função auxiliar para limpar a busca atual sem perder os itens já selecionados (opcional, mas útil)
    const handleClearSearch = () => {
        setSearchTerm({ nfCte: '', sacadoNome: '' });
        // Se quiser manter na tela apenas os selecionados ao limpar, pode filtrar aqui.
        // Por enquanto, vamos manter a lista acumulada.
        setError('');
    };

    if (!isOpen) return null;

    const getAuthHeader = () => ({ 'Authorization': `Bearer ${sessionStorage.getItem('authToken')}` });

    const handleSearch = async () => {
        if (!searchTerm.nfCte && !searchTerm.sacadoNome) {
            setError('Digite um N° de NF/CTe ou um nome de Sacado para buscar.');
            return;
        }
        if (!clienteId) {
            setError('Cliente (Cedente) não identificado. Não é possível buscar duplicatas.');
            return;
        }

        setLoading(true);
        setError('');
        // NÃO limpamos mais duplicatasEncontradas aqui para permitir acumulação
        // setDuplicatasEncontradas([]); 
        setCalculo(null);

        try {
            const params = new URLSearchParams({
                nfCte: searchTerm.nfCte,
                sacadoNome: searchTerm.sacadoNome,
                clienteId: clienteId
            });
            const response = await fetch(`/api/duplicatas/search-pendentes?${params.toString()}`, { headers: getAuthHeader() });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.message || 'Nenhuma duplicata em aberto encontrada.');
            }

            const data = await response.json();

            // Ordena os novos resultados
            const sortedData = data.sort((a, b) => {
                const dateA = new Date(a.data_vencimento.split('/').reverse().join('-'));
                const dateB = new Date(b.data_vencimento.split('/').reverse().join('-'));
                return dateA - dateB;
            });

            // LÓGICA DE ACUMULAÇÃO (CORREÇÃO PRINCIPAL)
            setDuplicatasEncontradas(prev => {
                // Cria um Map com os itens anteriores para busca rápida por ID
                const existingIds = new Set(prev.map(item => item.id));

                // Filtra os novos itens que ainda não estão na lista
                const newItems = sortedData.filter(item => !existingIds.has(item.id));

                // Retorna a lista antiga + novos itens únicos
                return [...prev, ...newItems];
            });

        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleKeyDown = (event) => {
        if (event.key === 'Enter') {
            handleSearch();
        }
    };

    const handleToggleDuplicata = (id) => {
        const newSelection = new Set(selectedDuplicatas);
        if (newSelection.has(id)) {
            newSelection.delete(id);
        } else {
            newSelection.add(id);
        }
        setSelectedDuplicatas(newSelection);
        setCalculo(null);
    };

    const handleCalculate = () => {
        setError('');
        // Calcula apenas sobre os itens que estão no array duplicatasEncontradas E no Set selectedDuplicatas
        const parcelasSelecionadas = duplicatasEncontradas.filter(d => selectedDuplicatas.has(d.id));

        if (parcelasSelecionadas.length === 0) {
            setError('Selecione ao menos uma parcela para calcular.');
            return;
        }

        const dataOperacaoNova = new Date(dataNovaOperacao + 'T12:00:00Z');
        let totalJurosOriginais = 0;
        let totalPrincipal = 0;
        let jurosProporcionais = 0;
        let nfCtes = new Set();

        parcelasSelecionadas.forEach(p => {
            const valorJuros = Number(p.valor_juros) || 0;
            totalJurosOriginais += valorJuros;
            totalPrincipal += getValorRecompraDuplicata(p);
            nfCtes.add(p.nf_cte.split('.')[0]);

            const dataOperacaoOriginal = new Date(p.data_operacao + 'T12:00:00Z');
            const diasCorridos = differenceInDays(dataOperacaoNova, dataOperacaoOriginal);

            const dataVencimentoOriginal = new Date(p.data_vencimento + 'T12:00:00Z');
            const prazoTotalParcela = differenceInDays(dataVencimentoOriginal, dataOperacaoOriginal);

            if (prazoTotalParcela > 0 && diasCorridos > 0) {
                const jurosDiario = valorJuros / prazoTotalParcela;
                jurosProporcionais += jurosDiario * diasCorridos;
            }
        });

        const creditoFinal = totalJurosOriginais - jurosProporcionais;

        setCalculo({
            credito: creditoFinal > 0 ? creditoFinal : 0,
            principal: totalPrincipal,
            descricao: `NF/CTe ${Array.from(nfCtes).join(', ')}`
        });
    };

    const handleConfirm = () => {
        if (!calculo) {
            setError('Por favor, calcule o crédito antes de confirmar.');
            return;
        }

        const duplicatasDetalhes = duplicatasEncontradas
            .filter(d => selectedDuplicatas.has(d.id))
            .map(d => ({
                ...d,
                valor_recompra: getValorRecompraDuplicata(d)
            }));

        onConfirm({
            credito: calculo.credito,
            principal: calculo.principal,
            jurosAdicionais: parseBRL(jurosAdicionais),
            abatimentos: parseBRL(outrosAbatimentos),
            duplicataIds: Array.from(selectedDuplicatas),
            duplicatasDetalhes,
            descricao: calculo.descricao
        });
        handleClose();
    };

    // Calcula quantas estão selecionadas para mostrar no botão (UX Extra)
    const countSelected = selectedDuplicatas.size;

    return (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" onClick={handleClose}>
            <div
                className="flex h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl bg-gray-800 text-white shadow-2xl sm:max-h-[90vh] sm:rounded-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start justify-between gap-3 border-b border-gray-700 px-5 py-4 sm:px-6">
                    <div className="min-w-0">
                        <h2 className="text-xl font-bold sm:text-2xl">Recompra de Duplicatas</h2>
                        <p className="mt-1 text-sm text-gray-400">{countSelected} itens selecionados</p>
                    </div>
                    <button onClick={handleClose} className="rounded-md px-3 py-1 text-2xl font-bold leading-none text-gray-400 transition hover:text-white" aria-label="Fechar modal">
                        &times;
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-6">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                        <input
                            type="text"
                            value={searchTerm.nfCte}
                            onChange={(e) => setSearchTerm((prev) => ({ ...prev, nfCte: e.target.value, sacadoNome: '' }))}
                            onKeyDown={handleKeyDown}
                            placeholder="N° NF/CTe"
                            className="rounded-md border border-gray-600 bg-gray-700 p-3 text-sm"
                        />
                        <input
                            type="text"
                            value={searchTerm.sacadoNome}
                            onChange={(e) => setSearchTerm((prev) => ({ ...prev, sacadoNome: e.target.value, nfCte: '' }))}
                            onKeyDown={handleKeyDown}
                            placeholder="Nome do Sacado"
                            className="rounded-md border border-gray-600 bg-gray-700 p-3 text-sm"
                        />
                        <div className="flex gap-2">
                            <button onClick={handleSearch} disabled={loading} className="flex-1 rounded-md bg-blue-600 px-4 py-3 font-semibold transition hover:bg-blue-700 disabled:opacity-50">
                                {loading ? '...' : 'Adicionar à Lista'}
                            </button>
                            {duplicatasEncontradas.length > 0 && (
                                <button onClick={() => setDuplicatasEncontradas([])} title="Limpar Lista" className="rounded-md bg-gray-600 px-3 hover:bg-gray-500">
                                    🗑️
                                </button>
                            )}
                        </div>
                    </div>

                    {error && <p className="mt-4 text-center text-sm text-red-400">{error}</p>}

                    <div className="mt-4 space-y-3 rounded-2xl border border-gray-700 bg-gray-900/70 p-3">
                        {duplicatasEncontradas.length > 0 ? (
                            duplicatasEncontradas.map((d) => (
                                <label
                                    key={d.id}
                                    className={`flex cursor-pointer flex-col gap-3 rounded-2xl border p-4 transition md:flex-row md:items-center ${selectedDuplicatas.has(d.id) ? 'border-orange-500 bg-gray-700' : 'border-gray-700 bg-gray-800/80 hover:bg-gray-700'}`}
                                >
                                    <div className="flex items-start gap-3">
                                        <input
                                            type="checkbox"
                                            checked={selectedDuplicatas.has(d.id)}
                                            onChange={() => handleToggleDuplicata(d.id)}
                                            className="mt-1 h-4 w-4 rounded text-orange-500"
                                        />
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-semibold text-white" title={d.cliente_sacado}>{d.cliente_sacado}</p>
                                            <p className="mt-1 text-xs text-gray-400">NF/CTe: <strong>{d.nf_cte}</strong></p>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 text-xs md:ml-auto md:grid-cols-3 md:gap-4 md:text-sm">
                                        <div className="rounded-xl bg-gray-900/60 p-3">
                                            <span className="block uppercase tracking-wide text-gray-500">Venc.</span>
                                            <span className="mt-1 block font-semibold text-gray-100">{formatDate(d.data_vencimento)}</span>
                                        </div>
                                        <div className="rounded-xl bg-gray-900/60 p-3">
                                            <span className="block uppercase tracking-wide text-gray-500">Valor</span>
                                            <span className="mt-1 block font-semibold text-green-300">{formatBRLNumber(getValorRecompraDuplicata(d))}</span>
                                        </div>
                                        <div className="rounded-xl bg-gray-900/60 p-3">
                                            <span className="block uppercase tracking-wide text-gray-500">Juros</span>
                                            <span className="mt-1 block font-semibold text-red-400">{formatBRLNumber(d.valor_juros)}</span>
                                        </div>
                                    </div>
                                </label>
                            ))
                        ) : (
                            <p className="p-4 text-center text-sm text-gray-500">Utilize a busca acima para adicionar itens à lista de recompra.</p>
                        )}
                    </div>

                    <div className="mt-4 space-y-4">
                        {selectedDuplicatas.size > 0 && (
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                                <input
                                    type="text"
                                    value={jurosAdicionais}
                                    onChange={(e) => setJurosAdicionais(formatBRLInput(e.target.value))}
                                    placeholder="Juros/Taxas Adicionais"
                                    className="rounded-md border border-gray-600 bg-gray-700 p-3 text-sm"
                                />
                                <input
                                    type="text"
                                    value={outrosAbatimentos}
                                    onChange={(e) => setOutrosAbatimentos(formatBRLInput(e.target.value))}
                                    placeholder="Outros Abatimentos"
                                    className="rounded-md border border-gray-600 bg-gray-700 p-3 text-sm"
                                />
                                <button onClick={handleCalculate} className="rounded-md bg-orange-500 px-4 py-3 font-semibold hover:bg-orange-600">
                                    Calcular Valores
                                </button>
                            </div>
                        )}

                        {calculo !== null && (
                            <div className="grid grid-cols-1 gap-3 rounded-2xl border border-gray-700 bg-gray-700 p-4 md:grid-cols-2">
                                <div>
                                    <h3 className="text-sm font-semibold text-gray-300">Débito (Valor Principal Recomprado)</h3>
                                    <p className="text-xl font-bold text-red-400">{formatBRLNumber(calculo.principal)}</p>
                                </div>
                                <div>
                                    <h3 className="text-sm font-semibold text-gray-300">Crédito (Juros a Estornar)</h3>
                                    <p className="text-xl font-bold text-green-400">{formatBRLNumber(calculo.credito)}</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="border-t border-gray-700 px-5 py-4 sm:px-6">
                    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                        <button onClick={handleClose} className="w-full rounded-md bg-gray-600 px-4 py-3 font-semibold hover:bg-gray-500 sm:w-auto">Cancelar</button>
                        <button onClick={handleConfirm} disabled={calculo === null} className="w-full rounded-md bg-green-600 px-4 py-3 font-semibold hover:bg-green-700 disabled:opacity-50 sm:w-auto">
                            Confirmar Recompra
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
