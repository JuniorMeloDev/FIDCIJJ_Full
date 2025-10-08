// src/app/components/ConciliacaoModal.jsx
'use client';

import { useState, useEffect, useMemo } from 'react';
import { formatBRLNumber, formatDate, formatBRLInput, parseBRL } from '@/app/utils/formatters';

export default function ConciliacaoModal({ 
    isOpen, 
    onClose, 
    onConfirm, 
    transacao, 
    searchDuplicatas
}) {
    const [searchResults, setSearchResults] = useState([]);
    const [selectedItemsData, setSelectedItemsData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [busca, setBusca] = useState('');
    const [juros, setJuros] = useState('');
    const [descontos, setDescontos] = useState('');

    const selectedIds = useMemo(() => new Set(selectedItemsData.map(item => item.id)), [selectedItemsData]);

    const totalDuplicatas = useMemo(() => {
        return selectedItemsData.reduce((sum, d) => sum + d.valorBruto, 0);
    }, [selectedItemsData]);

    const valorFinalCalculado = totalDuplicatas + parseBRL(juros) - parseBRL(descontos);
    const saldoRestante = transacao?.valor - valorFinalCalculado;

    useEffect(() => {
        if (!isOpen) {
            setSearchResults([]);
            setSelectedItemsData([]);
            setBusca('');
            setError('');
            setJuros('');
            setDescontos('');
        }
    }, [isOpen]);

    if (!isOpen || !transacao) return null;

    const handleSearch = async () => {
        if (busca.length < 2) {
            setSearchResults([]);
            return;
        }
        setLoading(true);
        setError('');
        try {
            const resultados = await searchDuplicatas(busca);
            setSearchResults(resultados);
            if(resultados.length === 0) {
                 setError('Nenhuma duplicata pendente encontrada para a busca.');
            }
        } catch (err) {
            setError('Erro ao buscar duplicatas.');
        } finally {
            setLoading(false);
        }
    };

    const handleToggleDuplicata = (duplicata) => {
        if (selectedIds.has(duplicata.id)) {
            setSelectedItemsData(prev => prev.filter(item => item.id !== duplicata.id));
        } else {
            setSelectedItemsData(prev => [...prev, duplicata]);
        }
    };

    const handleConfirmar = () => {
        if (Math.abs(saldoRestante) > 0.01) { // Tolerância de 1 centavo
            setError(`O valor final (${formatBRLNumber(valorFinalCalculado)}) não corresponde ao valor recebido. Diferença: ${formatBRLNumber(saldoRestante)}`);
            return;
        }
        onConfirm({
            duplicataIds: Array.from(selectedIds),
            detalhesTransacao: transacao,
            juros: parseBRL(juros),
            descontos: parseBRL(descontos),
        });
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-[60] p-4" onClick={onClose}>
            <div className="bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-4xl text-white flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
                <h2 className="text-xl font-bold mb-4 flex-shrink-0">Conciliar Recebimento</h2>
                
                <div className="bg-gray-700 p-3 rounded-md mb-4 grid grid-cols-3 gap-4 text-sm flex-shrink-0">
                    <div><strong>Data:</strong> {formatDate(transacao.data)}</div>
                    <div><strong>Descrição:</strong> {transacao.descricao}</div>
                    <div className="text-right"><strong>Valor Recebido:</strong> <span className="font-bold text-green-400">{formatBRLNumber(transacao.valor)}</span></div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-grow overflow-y-auto">
                    {/* Coluna da Esquerda: Busca */}
                    <div className="flex flex-col">
                        <div className="flex gap-2 mb-2">
                            <input
                                type="text" value={busca} onChange={(e) => setBusca(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                placeholder="Buscar Sacado ou NF/CTe..."
                                className="flex-grow bg-gray-700 border-gray-600 rounded-md p-2 text-sm"
                            />
                            <button onClick={handleSearch} disabled={loading} className="bg-blue-600 font-semibold py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50">
                                {loading ? '...' : 'Buscar'}
                            </button>
                        </div>
                        <div className="flex-grow space-y-2 overflow-y-auto border border-gray-700 p-2 rounded-md">
                            {loading && <p className="text-center text-sm p-4">Buscando...</p>}
                            {!loading && searchResults.map(d => (
                                <label key={d.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-gray-700 cursor-pointer">
                                    <input type="checkbox" checked={selectedIds.has(d.id)} onChange={() => handleToggleDuplicata(d)} className="h-4 w-4 rounded text-orange-500" />
                                    <div className="flex-grow grid grid-cols-3 text-sm">
                                        <span><strong>{d.nfCte}</strong></span>
                                        <span className="truncate" title={d.clienteSacado}>{d.clienteSacado}</span>
                                        <span className="text-right">{formatBRLNumber(d.valorBruto)}</span>
                                    </div>
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* Coluna da Direita: Selecionados e Ajustes */}
                    <div className="flex flex-col">
                        <h3 className="text-md font-semibold mb-2">Duplicatas Selecionadas para Baixa</h3>
                        <div className="flex-grow space-y-2 overflow-y-auto border border-gray-700 p-2 rounded-md">
                           {selectedItemsData.length > 0 ? selectedItemsData.map(d => (
                                <div key={d.id} className="flex items-center gap-3 p-2 rounded-md bg-gray-900/50">
                                    <button onClick={() => handleToggleDuplicata(d)} className="text-red-500 text-lg">&times;</button>
                                    <div className="flex-grow grid grid-cols-2 text-sm">
                                        <span><strong>{d.nfCte}</strong></span>
                                        <span className="text-right">{formatBRLNumber(d.valorBruto)}</span>
                                    </div>
                                </div>
                            )) : <p className="text-center text-sm text-gray-400 p-4">Nenhum item selecionado.</p>}
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-300">Juros / Multa</label>
                                <input type="text" value={juros} onChange={e => setJuros(formatBRLInput(e.target.value))} placeholder="R$ 0,00" className="mt-1 w-full bg-gray-700 p-1.5 text-sm"/>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-300">Desconto / Abatimento</label>
                                <input type="text" value={descontos} onChange={e => setDescontos(formatBRLInput(e.target.value))} placeholder="R$ 0,00" className="mt-1 w-full bg-gray-700 p-1.5 text-sm"/>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div className="mt-4 p-3 bg-gray-900/50 rounded-md grid grid-cols-3 gap-4 text-center flex-shrink-0">
                    <div>
                        <p className="text-sm text-gray-400">Total Calculado</p>
                        <p className={`text-xl font-bold ${Math.abs(saldoRestante) > 0.01 ? 'text-red-500' : 'text-green-400'}`}>{formatBRLNumber(valorFinalCalculado)}</p>
                    </div>
                     <div>
                        <p className="text-sm text-gray-400">Valor Recebido</p>
                        <p className="text-xl font-bold text-gray-200">{formatBRLNumber(transacao.valor)}</p>
                    </div>
                     <div>
                        <p className="text-sm text-gray-400">Diferença</p>
                        <p className={`text-xl font-bold ${Math.abs(saldoRestante) > 0.01 ? 'text-red-500' : 'text-green-400'}`}>{formatBRLNumber(saldoRestante)}</p>
                    </div>
                </div>
                 {error && <p className="text-red-400 text-sm mt-2 text-center">{error}</p>}

                <div className="mt-6 flex justify-end gap-4 flex-shrink-0">
                    <button onClick={onClose} className="bg-gray-600 font-semibold py-2 px-4 rounded-md hover:bg-gray-500">Cancelar</button>
                    <button onClick={handleConfirmar} disabled={selectedIds.size === 0} className="bg-green-600 font-semibold py-2 px-4 rounded-md hover:bg-green-700 disabled:opacity-50">
                        Confirmar Conciliação
                    </button>
                </div>
            </div>
        </div>
    );
}