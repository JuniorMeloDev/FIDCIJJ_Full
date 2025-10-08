// src/app/components/ConciliacaoModal.jsx
'use client';

import { useState, useEffect, useMemo } from 'react';
import { formatBRLNumber, formatDate } from '@/app/utils/formatters';
import AutocompleteSearch from './AutoCompleteSearch';

export default function ConciliacaoModal({ 
    isOpen, 
    onClose, 
    onConfirm, 
    transacao, 
    fetchSacados,
    fetchDuplicatasBySacado
}) {
    const [duplicatas, setDuplicatas] = useState([]);
    const [selectedDuplicatas, setSelectedDuplicatas] = useState(new Set());
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [sacadoBusca, setSacadoBusca] = useState('');

    // HOOKS MOVEM-SE PARA CIMA
    const totalSelecionado = useMemo(() => {
        if (!duplicatas) return 0;
        return duplicatas
            .filter(d => selectedDuplicatas.has(d.id))
            .reduce((sum, d) => sum + d.valorBruto, 0);
    }, [selectedDuplicatas, duplicatas]);

    useEffect(() => {
        if (!isOpen) {
            setDuplicatas([]);
            setSelectedDuplicatas(new Set());
            setSacadoBusca('');
            setError('');
        }
    }, [isOpen]);

    // O RETORNO ANTECIPADO AGORA ESTÁ DEPOIS DE TODOS OS HOOKS
    if (!isOpen || !transacao) return null;

    const saldoRestante = transacao.valor - totalSelecionado;

    const handleSelectSacado = async (sacado) => {
        setSacadoBusca(sacado ? sacado.nome : '');
        if (sacado) {
            setLoading(true);
            const duplicatasDoSacado = await fetchDuplicatasBySacado(sacado.id);
            setDuplicatas(duplicatasDoSacado);
            setLoading(false);
        } else {
            setDuplicatas([]);
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
    };

    const handleConfirmar = () => {
        if (totalSelecionado > transacao.valor) {
            setError('O valor das duplicatas selecionadas não pode ser maior que o valor do recebimento.');
            return;
        }
        onConfirm({
            duplicataIds: Array.from(selectedDuplicatas),
            detalhesTransacao: transacao
        });
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-[60] p-4" onClick={onClose}>
            <div className="bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-3xl text-white" onClick={(e) => e.stopPropagation()}>
                <h2 className="text-xl font-bold mb-4">Conciliar Recebimento</h2>
                
                <div className="bg-gray-700 p-3 rounded-md mb-4 grid grid-cols-3 gap-4 text-sm">
                    <div><strong>Data:</strong> {formatDate(transacao.data)}</div>
                    <div><strong>Descrição:</strong> {transacao.descricao}</div>
                    <div className="text-right"><strong>Valor:</strong> <span className="font-bold text-green-400">{formatBRLNumber(transacao.valor)}</span></div>
                </div>

                <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-300">Buscar Duplicatas do Sacado</label>
                    <AutocompleteSearch
                        value={sacadoBusca}
                        onChange={(e) => setSacadoBusca(e.target.value)}
                        onSelect={handleSelectSacado}
                        fetchSuggestions={fetchSacados}
                        placeholder="Digite o nome do sacado para buscar duplicatas..."
                    />
                </div>

                <div className="space-y-2 max-h-60 overflow-y-auto border border-gray-700 p-2 rounded-md">
                    {loading && <p className="text-center">Buscando...</p>}
                    {!loading && duplicatas.map(d => (
                        <label key={d.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-gray-700 cursor-pointer">
                            <input type="checkbox" checked={selectedDuplicatas.has(d.id)} onChange={() => handleToggleDuplicata(d.id)} className="h-4 w-4 rounded text-orange-500" />
                            <div className="flex-grow grid grid-cols-3 text-sm">
                                <span>NF/CTe: <strong>{d.nfCte}</strong></span>
                                <span>Venc: {formatDate(d.dataVencimento)}</span>
                                <span className="text-right">Valor: {formatBRLNumber(d.valorBruto)}</span>
                            </div>
                        </label>
                    ))}
                </div>

                <div className="mt-4 p-3 bg-gray-900/50 rounded-md grid grid-cols-2 gap-4 text-center">
                    <div>
                        <p className="text-sm text-gray-400">Total Selecionado</p>
                        <p className={`text-xl font-bold ${totalSelecionado > transacao.valor ? 'text-red-500' : 'text-orange-400'}`}>{formatBRLNumber(totalSelecionado)}</p>
                    </div>
                     <div>
                        <p className="text-sm text-gray-400">Saldo Restante</p>
                        <p className={`text-xl font-bold ${saldoRestante < 0 ? 'text-red-500' : 'text-green-400'}`}>{formatBRLNumber(saldoRestante)}</p>
                    </div>
                </div>
                 {error && <p className="text-red-400 text-sm mt-4 text-center">{error}</p>}

                <div className="mt-6 flex justify-end gap-4">
                    <button onClick={onClose} className="bg-gray-600 font-semibold py-2 px-4 rounded-md hover:bg-gray-500">Cancelar</button>
                    <button onClick={handleConfirmar} disabled={selectedDuplicatas.size === 0} className="bg-green-600 font-semibold py-2 px-4 rounded-md hover:bg-green-700 disabled:opacity-50">
                        Confirmar Conciliação
                    </button>
                </div>
            </div>
        </div>
    );
}