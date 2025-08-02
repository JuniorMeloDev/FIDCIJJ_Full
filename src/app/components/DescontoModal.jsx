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
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50">
            <div className="bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-md">
                <h2 className="text-2xl font-bold mb-4 text-white">Adicionar Desconto / Taxa</h2>
                
                <div className="mb-4">
                    <label htmlFor="descricao" className="block text-sm font-medium text-gray-300">Descrição</label>
                    <input
                        type="text"
                        id="descricao"
                        value={descricao}
                        onChange={(e) => setDescricao(e.target.value)}
                        className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm p-2 text-white"
                    />
                </div>

                <div className="mb-6">
                    <label htmlFor="valor" className="block text-sm font-medium text-gray-300">Valor</label>
                    <input
                        type="text"
                        id="valor"
                        value={valor}
                        onChange={(e) => setValor(formatBRLInput(e.target.value))}
                        placeholder="R$ 0,00"
                        className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm p-2 text-white"
                    />
                </div>

                <div className="flex justify-end gap-4">
                    <button onClick={onClose} className="bg-gray-600 text-gray-100 font-semibold py-2 px-4 rounded-md hover:bg-gray-500 transition">
                        Voltar
                    </button>
                    <button onClick={handleSaveClick} className="bg-orange-500 text-white font-semibold py-2 px-4 rounded-md hover:bg-orange-600 transition">
                        Guardar
                    </button>
                </div>
            </div>
        </div>
    );
}