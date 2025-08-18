'use client';

import { useState, useEffect } from 'react';

export default function AnotacaoModal({ isOpen, onClose, onSave, anotacao }) {
    const [formData, setFormData] = useState({ data: '', assunto: '', conteudo: '' });
    const isEditMode = !!anotacao;

    useEffect(() => {
        if (isOpen) {
            if (anotacao) {
                setFormData({ ...anotacao, data: new Date(anotacao.data).toISOString().split('T')[0] });
            } else {
                setFormData({ data: new Date().toISOString().split('T')[0], assunto: '', conteudo: '' });
            }
        }
    }, [isOpen, anotacao]);

    if (!isOpen) return null;

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSave = () => {
        onSave(formData);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4">
            <div className="bg-gray-800 text-white p-6 rounded-lg shadow-xl w-full max-w-lg">
                <h2 className="text-xl font-bold mb-4">{isEditMode ? 'Editar Anotação' : 'Nova Anotação'}</h2>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-300">Data</label>
                        <input type="date" name="data" value={formData.data} onChange={handleChange} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md p-2"/>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-300">Assunto</label>
                        <input type="text" name="assunto" value={formData.assunto} onChange={handleChange} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md p-2"/>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-300">Anotação</label>
                        <textarea name="conteudo" value={formData.conteudo} onChange={handleChange} rows="5" className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md p-2"></textarea>
                    </div>
                </div>
                <div className="mt-6 flex justify-end gap-2">
                    <button onClick={onClose} className="bg-gray-600 text-gray-100 font-semibold py-2 px-4 rounded-md hover:bg-gray-500 transition">Cancelar</button>
                    <button onClick={handleSave} className="bg-orange-500 text-white font-semibold py-2 px-4 rounded-md hover:bg-orange-600 transition">Salvar</button>
                </div>
            </div>
        </div>
    );
}