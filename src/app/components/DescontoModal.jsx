'use client';

import { useState } from 'react';
import { formatBRLInput, parseBRL } from '@/app/utils/formatters';

export default function DescontoModal({ isOpen, onClose, onSave }) {
    const [descricao, setDescricao] = useState('');
    const [valor, setValor] = useState('');

    if (!isOpen) return null;

    const handleSaveClick = () => {
        if (!descricao || !valor) {
            alert('Por favor, preencha a descrição e o valor.');
            return;
        }
        onSave({
            id: Date.now(),
            descricao,
            valor: parseBRL(valor),
        });
        setDescricao('');
        setValor('');
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" onClick={onClose}>
            <div
                className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-gray-800 text-white shadow-xl sm:rounded-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="border-b border-gray-700 px-5 py-4 sm:px-6">
                    <h2 className="text-xl font-bold sm:text-2xl">Adicionar Desconto / Taxa</h2>
                </div>

                <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-6">
                    <div>
                        <label htmlFor="descricao" className="block text-sm font-medium text-gray-300">Descrição</label>
                        <input
                            type="text"
                            id="descricao"
                            value={descricao}
                            onChange={(e) => setDescricao(e.target.value)}
                            className="mt-1 block w-full rounded-md border border-gray-600 bg-gray-700 p-3 text-white shadow-sm"
                        />
                    </div>

                    <div>
                        <label htmlFor="valor" className="block text-sm font-medium text-gray-300">Valor</label>
                        <input
                            type="text"
                            id="valor"
                            value={valor}
                            onChange={(e) => setValor(formatBRLInput(e.target.value))}
                            placeholder="R$ 0,00"
                            className="mt-1 block w-full rounded-md border border-gray-600 bg-gray-700 p-3 text-white shadow-sm"
                        />
                    </div>
                </div>

                <div className="border-t border-gray-700 px-5 py-4 sm:px-6">
                    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                        <button onClick={onClose} className="w-full rounded-md bg-gray-600 px-4 py-3 font-semibold text-gray-100 transition hover:bg-gray-500 sm:w-auto">
                            Voltar
                        </button>
                        <button onClick={handleSaveClick} className="w-full rounded-md bg-orange-500 px-4 py-3 font-semibold text-white transition hover:bg-orange-600 sm:w-auto">
                            Salvar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
