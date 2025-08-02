'use client';

import { useState, useEffect } from 'react';
import { formatBRLInput, parseBRL } from '@/app/utils/formatters';

export default function EditTipoOperacaoModal({ isOpen, onClose, onSave, onDelete, tipoOperacao }) {
    const initialState = { nome: '', taxaJuros: '', valorFixo: '', despesasBancarias: '', descricao: '' };
    const [formData, setFormData] = useState(initialState);
    const isEditMode = !!tipoOperacao?.id;

    useEffect(() => {
        if (isOpen) {
            if (tipoOperacao) {
                setFormData({
                    nome: tipoOperacao.nome || '',
                    taxaJuros: tipoOperacao.taxaJuros ? String(tipoOperacao.taxaJuros).replace('.', ',') : '',
                    valorFixo: formatBRLInput(String(tipoOperacao.valorFixo * 100)),
                    despesasBancarias: formatBRLInput(String(tipoOperacao.despesasBancarias * 100)),
                    descricao: tipoOperacao.descricao || '',
                });
            } else {
                setFormData(initialState);
            }
        }
    }, [tipoOperacao, isOpen]);

    if (!isOpen) return null;

    const handleChange = (e) => {
        const { name, value } = e.target;
        if (['valorFixo', 'despesasBancarias'].includes(name)) {
            setFormData(prev => ({ ...prev, [name]: formatBRLInput(value) }));
        } else if (name === 'taxaJuros') {
            setFormData(prev => ({ ...prev, [name]: value.replace(/[^\d,]/g, '') }));
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleSave = () => {
        const dataToSave = {
            ...formData,
            taxaJuros: parseFloat(String(formData.taxaJuros).replace(',', '.')) || 0,
            valorFixo: parseBRL(formData.valorFixo),
            despesasBancarias: parseBRL(formData.despesasBancarias),
        };
        onSave(tipoOperacao?.id, dataToSave);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4">
            <div className="bg-gray-800 text-white p-6 rounded-lg shadow-xl w-full max-w-lg">
                <h2 className="text-xl font-bold mb-4">{isEditMode ? 'Editar Tipo de Operação' : 'Novo Tipo de Operação'}</h2>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-300">Nome da Operação</label>
                        <input type="text" name="nome" value={formData.nome} onChange={handleChange} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md p-2 text-sm"/>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-300">Taxa de Juros (%)</label>
                        <input type="text" name="taxaJuros" placeholder="Ex: 2,5" value={formData.taxaJuros} onChange={handleChange} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md p-2 text-sm"/>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-300">Valor Fixo (R$)</label>
                        <input type="text" name="valorFixo" placeholder="R$ 0,00" value={formData.valorFixo} onChange={handleChange} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md p-2 text-sm"/>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-300">Despesas Bancárias (R$)</label>
                        <input type="text" name="despesasBancarias" placeholder="R$ 0,00" value={formData.despesasBancarias} onChange={handleChange} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md p-2 text-sm"/>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-300">Descrição (Opcional)</label>
                        <textarea
                            name="descricao"
                            value={formData.descricao}
                            onChange={handleChange}
                            rows="3"
                            className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md p-2 text-sm"
                            placeholder="Adicione uma observação sobre este tipo de operação..."
                        ></textarea>
                    </div>
                </div>
                <div className="mt-6 flex justify-between border-t border-gray-700 pt-4">
                    <div>
                        {isEditMode && (
                             <button onClick={() => onDelete(tipoOperacao.id)} className="bg-red-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-red-700 transition text-sm">
                                Excluir
                            </button>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <button type="button" onClick={onClose} className="bg-gray-600 text-gray-100 font-semibold py-2 px-4 rounded-md hover:bg-gray-500 transition text-sm">Cancelar</button>
                        <button onClick={handleSave} className="bg-orange-500 text-white font-semibold py-2 px-4 rounded-md hover:bg-orange-600 transition text-sm">Salvar</button>
                    </div>
                </div>
            </div>
        </div>
    );
}   