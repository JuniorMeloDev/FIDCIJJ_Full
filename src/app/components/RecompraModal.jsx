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
            totalJurosOriginais += p.valor_juros;
            totalPrincipal += p.valor_bruto;
            nfCtes.add(p.nf_cte.split('.')[0]);

            const dataOperacaoOriginal = new Date(p.data_operacao + 'T12:00:00Z');
            const diasCorridos = differenceInDays(dataOperacaoNova, dataOperacaoOriginal);

            const dataVencimentoOriginal = new Date(p.data_vencimento + 'T12:00:00Z');
            const prazoTotalParcela = differenceInDays(dataVencimentoOriginal, dataOperacaoOriginal);

            if (prazoTotalParcela > 0 && diasCorridos > 0) {
                const jurosDiario = p.valor_juros / prazoTotalParcela;
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

        onConfirm({
            credito: calculo.credito,
            principal: calculo.principal,
            jurosAdicionais: parseBRL(jurosAdicionais),
            abatimentos: parseBRL(outrosAbatimentos),
            duplicataIds: Array.from(selectedDuplicatas),
            duplicatasDetalhes: duplicatasEncontradas.filter(d => selectedDuplicatas.has(d.id)),
            descricao: calculo.descricao
        });
        handleClose();
    };

    // Calcula quantas estão selecionadas para mostrar no botão (UX Extra)
    const countSelected = selectedDuplicatas.size;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-[60] p-4" onClick={handleClose}>
            <div className="bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-3xl text-white max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>

                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold">Recompra de Duplicatas</h2>
                    <span className="text-sm text-gray-400">{countSelected} itens selecionados</span>
                </div>

                {/* --- SEÇÃO DE BUSCA --- */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4 flex-shrink-0">
                    <input
                        type="text"
                        value={searchTerm.nfCte}
                        onChange={(e) => setSearchTerm(prev => ({ ...prev, nfCte: e.target.value, sacadoNome: '' }))}
                        onKeyDown={handleKeyDown}
                        placeholder="N° NF/CTe"
                        className="md:col-span-1 bg-gray-700 border-gray-600 rounded-md p-2 text-sm"
                    />
                    <input
                        type="text"
                        value={searchTerm.sacadoNome}
                        onChange={(e) => setSearchTerm(prev => ({ ...prev, sacadoNome: e.target.value, nfCte: '' }))}
                        onKeyDown={handleKeyDown}
                        placeholder="Nome do Sacado"
                        className="md:col-span-1 bg-gray-700 border-gray-600 rounded-md p-2 text-sm"
                    />
                    <div className="md:col-span-1 flex gap-2">
                        <button onClick={handleSearch} disabled={loading} className="flex-grow bg-blue-600 font-semibold py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50">
                            {loading ? '...' : 'Adicionar à Lista'}
                        </button>
                        {duplicatasEncontradas.length > 0 && (
                            <button onClick={() => setDuplicatasEncontradas([])} title="Limpar Lista" className="bg-gray-600 px-3 rounded-md hover:bg-gray-500">
                                🗑️
                            </button>
                        )}
                    </div>
                </div>

                {error && <p className="text-red-400 text-sm mb-4 flex-shrink-0">{error}</p>}

                {/* --- SEÇÃO DE RESULTADOS (SCROLLABLE) --- */}
                <div className="flex-grow space-y-2 max-h-64 overflow-y-auto border border-gray-700 p-2 rounded-md bg-gray-900">
                    {duplicatasEncontradas.length > 0 ? (
                        duplicatasEncontradas.map(d => (
                            <label key={d.id} className={`flex items-center gap-3 p-2 rounded-md cursor-pointer border ${selectedDuplicatas.has(d.id) ? 'bg-gray-700 border-orange-500' : 'hover:bg-gray-800 border-transparent'}`}>
                                <input type="checkbox" checked={selectedDuplicatas.has(d.id)} onChange={() => handleToggleDuplicata(d.id)} className="h-4 w-4 rounded text-orange-500" />
                                <div className="flex-grow grid grid-cols-4 text-sm">
                                    <span className="font-semibold truncate" title={d.cliente_sacado}>{d.cliente_sacado}</span>
                                    <span>NF/CTe: <strong>{d.nf_cte}</strong></span>
                                    <span>Venc: {formatDate(d.data_vencimento)}</span>
                                    <span className="text-right">{formatBRLNumber(d.valor_bruto)}</span>
                                </div>
                            </label>
                        ))
                    ) : (
                        <p className="text-gray-500 text-sm text-center p-4">Utilize a busca acima para adicionar itens à lista de recompra.</p>
                    )}
                </div>

                {/* --- SEÇÃO DE CÁLCULO --- */}
                <div className="mt-4 flex-shrink-0">
                    {selectedDuplicatas.size > 0 && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                            <input
                                type="text"
                                value={jurosAdicionais}
                                onChange={(e) => setJurosAdicionais(formatBRLInput(e.target.value))}
                                placeholder="Juros/Taxas Adicionais"
                                className="bg-gray-700 border-gray-600 rounded-md p-2 text-sm"
                            />
                            <input
                                type="text"
                                value={outrosAbatimentos}
                                onChange={(e) => setOutrosAbatimentos(formatBRLInput(e.target.value))}
                                placeholder="Outros Abatimentos"
                                className="bg-gray-700 border-gray-600 rounded-md p-2 text-sm"
                            />
                            <button onClick={handleCalculate} className="bg-orange-500 font-semibold py-2 px-4 rounded-md hover:bg-orange-600">
                                Calcular Valores
                            </button>
                        </div>
                    )}

                    {calculo !== null && (
                        <div className="mt-4 p-4 bg-gray-700 rounded-md grid grid-cols-2 gap-4">
                            <div>
                                <h3 className="font-semibold text-sm text-gray-300">Débito (Valor Principal Recomprado):</h3>
                                <p className="text-xl font-bold text-red-400">{formatBRLNumber(calculo.principal)}</p>
                            </div>
                            <div>
                                <h3 className="font-semibold text-sm text-gray-300">Crédito (Juros a Estornar):</h3>
                                <p className="text-xl font-bold text-green-400">{formatBRLNumber(calculo.credito)}</p>
                            </div>
                        </div>
                    )}
                </div>

                <div className="mt-6 flex justify-end gap-4 flex-shrink-0 border-t border-gray-700 pt-4">
                    <button onClick={handleClose} className="bg-gray-600 font-semibold py-2 px-4 rounded-md hover:bg-gray-500">Cancelar</button>
                    <button onClick={handleConfirm} disabled={calculo === null} className="bg-green-600 font-semibold py-2 px-4 rounded-md hover:bg-green-700 disabled:opacity-50">
                        Confirmar Recompra
                    </button>
                </div>
            </div>
        </div>
    );
}