'use client';

import { useState, useEffect, useRef } from 'react';
import { FaPaperclip, FaTimes } from 'react-icons/fa';

export default function AnotacaoModal({ isOpen, onClose, onSave, anotacao, onDelete }) {
    const [formData, setFormData] = useState({ data: '', assunto: '', conteudo: '' });
    const [anexoFile, setAnexoFile] = useState(null);
    const fileInputRef = useRef(null);
    const isEditMode = !!anotacao?.id;

    useEffect(() => {
        if (isOpen) {
            if (anotacao) {
                const dataFormatada = anotacao.data ? new Date(anotacao.data).toISOString().split('T')[0] : '';
                setFormData({ ...anotacao, data: dataFormatada });
            } else {
                setFormData({ data: new Date().toISOString().split('T')[0], assunto: '', conteudo: '' });
            }
            setAnexoFile(null); // Limpa o anexo ao abrir o modal
        }
    }, [isOpen, anotacao]);

    if (!isOpen) return null;

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleFileChange = (e) => {
        setAnexoFile(e.target.files[0]);
    };

    const handleSave = () => {
        // Usa FormData para enviar texto e arquivo
        const payload = new FormData();
        payload.append('data', formData.data);
        payload.append('assunto', formData.assunto);
        payload.append('conteudo', formData.conteudo || '');
        if (anexoFile) {
            payload.append('anexo', anexoFile);
        }
        // onSave agora recebe um FormData
        onSave(payload);
    };

    const handleDeleteClick = () => {
        if (onDelete && isEditMode) {
            onDelete(anotacao.id);
        }
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
                        <textarea name="conteudo" value={formData.conteudo || ''} onChange={handleChange} rows="5" className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md p-2" placeholder="Digite sua anotação ou cole uma imagem aqui..."></textarea>
                    </div>
                    
                    {/* Novo campo de anexo */}
                    <div>
                        <label className="block text-sm font-medium text-gray-300">Anexo (PDF ou Imagem)</label>
                        <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*,application/pdf" className="hidden"/>
                        <button onClick={() => fileInputRef.current.click()} className="mt-1 w-full flex items-center justify-center gap-2 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-md p-2 transition">
                            <FaPaperclip />
                            {anexoFile ? 'Trocar Arquivo' : 'Selecionar Arquivo'}
                        </button>
                        {anexoFile && (
                            <div className="mt-2 text-sm text-gray-300 flex items-center justify-between bg-gray-700 p-2 rounded-md">
                                <span>{anexoFile.name}</span>
                                <button onClick={() => setAnexoFile(null)} className="text-red-400 hover:text-red-500"><FaTimes /></button>
                            </div>
                        )}
                         {isEditMode && formData.anexo_url && !anexoFile && (
                            <div className="mt-2 text-sm text-gray-300">
                                <a href={formData.anexo_url} target="_blank" rel="noopener noreferrer" className="text-orange-400 hover:underline flex items-center gap-2">
                                    <FaPaperclip /> Ver anexo atual
                                </a>
                            </div>
                        )}
                    </div>
                </div>
                
                <div className="mt-6 flex justify-between border-t border-gray-700 pt-4">
                    <div>
                        {isEditMode && (
                            <button onClick={handleDeleteClick} className="bg-red-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-red-700 transition text-sm">
                                Excluir
                            </button>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <button onClick={onClose} className="bg-gray-600 text-gray-100 font-semibold py-2 px-4 rounded-md hover:bg-gray-500 transition text-sm">Cancelar</button>
                        <button onClick={handleSave} className="bg-orange-500 text-white font-semibold py-2 px-4 rounded-md hover:bg-orange-600 transition text-sm">Salvar</button>
                    </div>
                </div>
            </div>
        </div>
    );
}