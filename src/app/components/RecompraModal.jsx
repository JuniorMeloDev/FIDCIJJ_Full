'use client';

import { useState } from 'react';
import { formatBRLNumber, formatDate } from '@/app/utils/formatters';
import { differenceInDays } from 'date-fns';

export default function RecompraModal({ isOpen, onClose, onConfirm, dataNovaOperacao }) {
    const [nfCte, setNfCte] = useState('');
    const [duplicatasEncontradas, setDuplicatasEncontradas] = useState([]);
    const [selectedParcelas, setSelectedParcelas] = useState(new Set());
    const [creditoCalculado, setCreditoCalculado] = useState(null);
    const [principalCalculado, setPrincipalCalculado] = useState(null); // <-- NOVO STATE
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    if (!isOpen) return null;

    const getAuthHeader = () => ({ 'Authorization': `Bearer ${sessionStorage.getItem('authToken')}` });

    const handleSearch = async () => {
        if (!nfCte) return;
        setLoading(true);
        setError('');
        setDuplicatasEncontradas([]);
        setSelectedParcelas(new Set());
        setCreditoCalculado(null);
        setPrincipalCalculado(null); // <-- NOVO: Limpar principal
        try {
            const response = await fetch(`/api/duplicatas/search-by-nf/${nfCte}`, { headers: getAuthHeader() });
            if (!response.ok) throw new Error('Nenhuma duplicata em aberto encontrada com este número.');
            const data = await response.json();
            setDuplicatasEncontradas(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleToggleParcela = (id) => {
        const newSelection = new Set(selectedParcelas);
        if (newSelection.has(id)) newSelection.delete(id);
        else newSelection.add(id);
        setSelectedParcelas(newSelection);
        setCreditoCalculado(null);
        setPrincipalCalculado(null); // <-- NOVO: Limpar principal
    };

    const handleCalculate = () => {
        setError('');
        const parcelasSelecionadas = duplicatasEncontradas.filter(d => selectedParcelas.has(d.id));
        if (parcelasSelecionadas.length === 0) {
            setError('Selecione ao menos uma parcela para calcular.');
            return;
        }

        // --- LÓGICA DE CÁLCULO ATUALIZADA ---
        const totalJurosOriginais = parcelasSelecionadas.reduce((sum, p) => sum + p.valor_juros, 0);
        const totalPrincipal = parcelasSelecionadas.reduce((sum, p) => sum + p.valor_bruto, 0); // <-- NOVO
        const dataOperacaoOriginal = new Date(parcelasSelecionadas[0].data_operacao + 'T12:00:00Z');
        const diasCorridos = differenceInDays(new Date(dataNovaOperacao + 'T12:00:00Z'), dataOperacaoOriginal);
        
        let jurosProporcionais = 0;
        parcelasSelecionadas.forEach(p => {
            const prazoTotalParcela = differenceInDays(new Date(p.data_vencimento + 'T12:00:00Z'), dataOperacaoOriginal);
            if (prazoTotalParcela > 0) {
                const jurosDiario = p.valor_juros / prazoTotalParcela;
                jurosProporcionais += jurosDiario * diasCorridos;
            }
        });
        
        const creditoFinal = totalJurosOriginais - jurosProporcionais;
        setCreditoCalculado(creditoFinal > 0 ? creditoFinal : 0);
        setPrincipalCalculado(totalPrincipal); // <-- NOVO
    };
    
    const handleConfirm = () => {
        // --- ALTERADO: Envia objeto completo ---
        onConfirm({
            credito: creditoCalculado,
            principal: principalCalculado, 
            duplicataIds: Array.from(selectedParcelas),
            descricao: `Recompra NF/CTe ${nfCte}`
        });
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-[60] p-4" onClick={onClose}>
            <div className="bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-2xl text-white" onClick={(e) => e.stopPropagation()}>
                <h2 className="text-xl font-bold mb-4">Recompra de NF/CTe</h2>
                <div className="flex gap-2 mb-4">
                    <input
                        type="text"
                        value={nfCte}
                        onChange={(e) => setNfCte(e.target.value)}
                        placeholder="Digite o número da NF/CT-e original"
                        className="flex-grow bg-gray-700 border-gray-600 rounded-md p-2"
                    />
                    <button onClick={handleSearch} disabled={loading} className="bg-blue-600 font-semibold py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50">
                        {loading ? 'Buscando...' : 'Buscar'}
                    </button>
                </div>

                {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

                {duplicatasEncontradas.length > 0 && (
                    <div className="space-y-2 max-h-48 overflow-y-auto border border-gray-700 p-2 rounded-md">
                        {duplicatasEncontradas.map(d => (
                            <label key={d.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-gray-700 cursor-pointer">
                                <input type="checkbox" checked={selectedParcelas.has(d.id)} onChange={() => handleToggleParcela(d.id)} className="h-4 w-4 rounded text-orange-500" />
                                <div className="flex-grow flex justify-between text-sm">
                                    <span>Parcela: <strong>{d.nf_cte}</strong></span>
                                    <span>Venc: {formatDate(d.data_vencimento)}</span>
                                    <span className="text-right">Valor: {formatBRLNumber(d.valor_bruto)}</span>
                                    <span className="text-right text-red-400">Juros: {formatBRLNumber(d.valor_juros)}</span>
                                </div>
                            </label>
                        ))}
                    </div>
                )}
                
                {selectedParcelas.size > 0 && (
                    <div className="mt-4">
                        <button onClick={handleCalculate} className="bg-orange-500 font-semibold py-2 px-4 rounded-md hover:bg-orange-600">
                            Calcular Crédito de Recompra
                        </button>
                    </div>
                )}

                {/* --- ALTERADO: Exibe ambos os valores --- */}
                {creditoCalculado !== null && (
                    <div className="mt-4 p-4 bg-gray-700 rounded-md grid grid-cols-2 gap-4">
                        <div>
                            <h3 className="font-semibold text-sm text-gray-300">Débito (Valor Principal):</h3>
                            <p className="text-2xl font-bold text-red-400">{formatBRLNumber(principalCalculado)}</p>
                        </div>
                        <div>
                             <h3 className="font-semibold text-sm text-gray-300">Crédito (Juros a Estornar):</h3>
                             <p className="text-2xl font-bold text-green-400">{formatBRLNumber(creditoCalculado)}</p>
                        </div>
                    </div>
                )}

                <div className="mt-6 flex justify-end gap-4">
                    <button onClick={onClose} className="bg-gray-600 font-semibold py-2 px-4 rounded-md hover:bg-gray-500">Cancelar</button>
                    <button onClick={handleConfirm} disabled={creditoCalculado === null} className="bg-green-600 font-semibold py-2 px-4 rounded-md hover:bg-green-700 disabled:opacity-50">
                        Confirmar Recompra
                    </button>
                </div>
            </div>
        </div>
    );
}