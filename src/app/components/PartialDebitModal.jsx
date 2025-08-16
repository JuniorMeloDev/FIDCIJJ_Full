'use client';

import { useState } from 'react';
import { formatBRLInput, parseBRL } from '@/app/utils/formatters';

export default function PartialDebitModal({ isOpen, onClose, onConfirm, totalValue }) {
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
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50">
            <div className="bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-md text-white">
                <h2 className="text-2xl font-bold mb-4">Debitar Valor Parcial</h2>
                <p className="text-sm text-gray-400 mb-4">Insira o valor que será debitado da conta selecionada para esta operação.</p>

                <div className="mb-4">
                    <label htmlFor="dataDebito" className="block text-sm font-medium text-gray-300">Data do Débito</label>
                    <input
                        type="date"
                        id="dataDebito"
                        value={dataDebito}
                        onChange={(e) => setDataDebito(e.target.value)}
                        className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm p-2"
                    />
                </div>

                <div className="mb-6">
                    <label htmlFor="valorParcial" className="block text-sm font-medium text-gray-300">Valor a ser Debitado</label>
                    <input
                        type="text"
                        id="valorParcial"
                        value={valorParcial}
                        onChange={(e) => setValorParcial(formatBRLInput(e.target.value))}
                        placeholder="R$ 0,00"
                        className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm p-2"
                    />
                </div>

                {error && <p className="text-sm text-red-400 text-center mb-4">{error}</p>}

                <div className="flex justify-end gap-4">
                    <button onClick={onClose} className="bg-gray-600 text-gray-100 font-semibold py-2 px-4 rounded-md hover:bg-gray-500 transition">
                        Cancelar
                    </button>
                    <button onClick={handleConfirmClick} className="bg-orange-500 text-white font-semibold py-2 px-4 rounded-md hover:bg-orange-600 transition">
                        Confirmar e Salvar Operação
                    </button>
                </div>
            </div>
        </div>
    );
}