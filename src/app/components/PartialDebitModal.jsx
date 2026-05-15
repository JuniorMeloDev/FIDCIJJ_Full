'use client';

import { useState } from 'react';
import { formatBRLInput, parseBRL } from '@/app/utils/formatters';

export default function PartialDebitModal({ isOpen, onClose, onConfirm, totalValue, isLoading }) {
    const [valorParcial, setValorParcial] = useState('');
    const [dataDebito, setDataDebito] = useState(new Date().toISOString().split('T')[0]);
    const [error, setError] = useState('');

    if (!isOpen) return null;

    const handleConfirmClick = () => {
        const valorNum = parseBRL(valorParcial);
        if (valorNum <= 0) {
            setError('O valor deve ser maior que zero.');
            return;
        }
        if (valorNum > totalValue) {
            setError('O valor parcial não pode ser maior que o líquido da operação.');
            return;
        }
        setError('');
        onConfirm(valorNum, dataDebito);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" onClick={onClose}>
            <div
                className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-gray-800 text-white shadow-xl sm:rounded-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="border-b border-gray-700 px-5 py-4 sm:px-6">
                    <h2 className="text-xl font-bold sm:text-2xl">Debitar Valor Parcial</h2>
                    <p className="mt-2 text-sm text-gray-400">Insira o valor que será debitado da conta selecionada para esta operação.</p>
                </div>

                <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-6">
                    <div>
                        <label htmlFor="dataDebito" className="block text-sm font-medium text-gray-300">Data do Débito</label>
                        <input
                            type="date"
                            id="dataDebito"
                            value={dataDebito}
                            onChange={(e) => setDataDebito(e.target.value)}
                            className="mt-1 block w-full rounded-md border border-gray-600 bg-gray-700 p-3 shadow-sm"
                        />
                    </div>

                    <div>
                        <label htmlFor="valorParcial" className="block text-sm font-medium text-gray-300">Valor a ser Debitado</label>
                        <input
                            type="text"
                            id="valorParcial"
                            value={valorParcial}
                            onChange={(e) => setValorParcial(formatBRLInput(e.target.value))}
                            placeholder="R$ 0,00"
                            className="mt-1 block w-full rounded-md border border-gray-600 bg-gray-700 p-3 shadow-sm"
                        />
                    </div>

                    {error && <p className="text-center text-sm text-red-400">{error}</p>}
                </div>

                <div className="border-t border-gray-700 px-5 py-4 sm:px-6">
                    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                        <button onClick={onClose} disabled={isLoading} className="w-full rounded-md bg-gray-600 px-4 py-3 font-semibold text-gray-100 transition hover:bg-gray-500 disabled:opacity-50 sm:w-auto">
                            Cancelar
                        </button>
                        <button onClick={handleConfirmClick} disabled={isLoading} className="w-full rounded-md bg-orange-500 px-4 py-3 font-semibold text-white transition hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed sm:w-auto">
                            {isLoading ? 'Processando...' : 'Confirmar e Salvar Operação'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
