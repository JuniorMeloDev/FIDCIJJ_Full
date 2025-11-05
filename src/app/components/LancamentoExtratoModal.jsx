// src/app/components/LancamentoExtratoModal.jsx
'use client';

import { useState, useEffect } from 'react';
import { formatBRLNumber, formatDisplayConta } from '@/app/utils/formatters';

export default function LancamentoExtratoModal({ 
    isOpen, 
    onClose, 
    onSave, 
    transacao, 
    contasInternas = [],
    showNotification // Agora vamos usar esta prop
}) {
    const [descricao, setDescricao] = useState('');
    const [contaBancaria, setContaBancaria] = useState('');
    const [categoria, setCategoria] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [isDespesa, setIsDespesa] = useState(false); // Novo state

    const isDebito = transacao?.valor < 0;

    useEffect(() => {
        if (isOpen && transacao) {
            setDescricao(transacao.descricao || '');
            setContaBancaria('');
            setCategoria(isDebito ? 'Despesa Avulsa' : 'Receita Avulsa');
            setIsDespesa(isDebito); // Define automaticamente baseado no valor
            setError('');
        }
    }, [isOpen, transacao]);

    const handleSave = async () => {
        if (!contaBancaria) {
            setError('Por favor, selecione a conta interna.');
            return;
        }

        setLoading(true);
        setError('');

        // Modifica o payload para incluir a data correta
        const payload = {
            data_movimento: transacao.dataEntrada || transacao.dataMovimento,
            descricao: descricao,
            valor: parseFloat(transacao.valor), // Garante que seja número
            conta_bancaria: contaBancaria,
            categoria: categoria,
            transaction_id: transacao.idTransacao || transacao.id, // Garante compatibilidade
            isDespesa: isDebito ? isDespesa : false
        };

        try {
            const response = await fetch('/api/lancamentos/conciliar-manual', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...getAuthHeader()
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Erro ao salvar lançamento');
            }

            const data = await response.json();
            showNotification('Lançamento salvo com sucesso!', 'success');
            onClose();
            return true;
        } catch (err) {
            const errorMessage = err.message || 'Erro ao salvar lançamento';
            setError(errorMessage);
            console.error('Erro ao salvar:', err);
            return false;
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen || !transacao) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-[70]" onClick={onClose}>
            <div className="bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
                <h2 className="text-xl font-bold mb-4 text-white">Conciliação Manual</h2>

                <div className="space-y-4">
                    <div className="bg-gray-700 p-4 rounded-md">
                        <p className="text-sm text-gray-300">Data: {transacao.data}</p>
                        <p className="text-sm text-gray-300">Valor: 
                            <span className={`font-bold ml-2 ${isDebito ? 'text-red-400' : 'text-green-400'}`}>
                                {formatBRLNumber(transacao.valor)}
                            </span>
                        </p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Descrição</label>
                        <input
                            type="text"
                            value={descricao}
                            onChange={(e) => setDescricao(e.target.value)}
                            className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white"
                            placeholder="Descrição do lançamento..."
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Conta Interna</label>
                        <select
                            value={contaBancaria}
                            onChange={(e) => setContaBancaria(e.target.value)}
                            className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white"
                        >
                            <option value="">Selecione uma conta...</option>
                            {contasInternas.map(conta => (
                                <option key={conta.contaBancaria} value={conta.contaBancaria}>
                                    {formatDisplayConta(conta.contaBancaria)}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Categoria</label>
                        <select
                            value={categoria}
                            onChange={(e) => setCategoria(e.target.value)}
                            className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white"
                        >
                            {isDebito ? (
                                <>
                                    <option value="Despesa Avulsa">Despesa Avulsa</option>
                                    <option value="Pagamento PIX">Pagamento PIX</option>
                                    <option value="Movimentação Avulsa">Movimentação Avulsa</option>
                                    <option value="Tarifa Bancária">Tarifa Bancária</option>
                                </>
                            ) : (
                                <>
                                    <option value="Receita Avulsa">Receita Avulsa</option>
                                    <option value="Crédito PIX">Crédito PIX</option>
                                    <option value="Outras Entradas">Outras Entradas</option>
                                </>
                            )}
                        </select>
                    </div>

                    {/* Adicione o checkbox de despesa antes do botão de confirmar */}
                    {isDebito && (
                        <div className="pt-2">
                            <label className="flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={isDespesa}
                                    onChange={(e) => setIsDespesa(e.target.checked)}
                                    className="h-4 w-4 rounded text-orange-500 bg-gray-600 border-gray-500 focus:ring-orange-500"
                                />
                                <span className="ml-2 text-sm text-gray-200">
                                    É uma despesa? (Contabilizar no resumo)
                                </span>
                            </label>
                        </div>
                    )}
                </div>

                {error && (
                    <p className="mt-4 text-sm text-red-400 text-center">{error}</p>
                )}

                <div className="mt-6 flex justify-end gap-4">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-500"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={loading}
                        className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                    >
                        {loading ? 'Salvando...' : 'Confirmar'}
                    </button>
                </div>
            </div>
        </div>
    );
}