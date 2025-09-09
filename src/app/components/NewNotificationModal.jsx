'use client';

import { useState, useRef } from 'react';
import AutocompleteSearch from './AutoCompleteSearch';
import { FaPaperclip, FaTimes } from 'react-icons/fa';

export default function NewNotificationModal({ isOpen, onClose, onSuccess, fetchClientes }) {
    const [recipients, setRecipients] = useState([]);
    const [title, setTitle] = useState('');
    const [message, setMessage] = useState('');
    const [attachments, setAttachments] = useState([]);
    const [isSending, setIsSending] = useState(false);
    const [error, setError] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [isLoadingAll, setIsLoadingAll] = useState(false);
    const [ramoFilter, setRamoFilter] = useState('Todos');
    
    // Novo state para o checkbox de e-mail
    const [sendEmail, setSendEmail] = useState(true);
    
    const fileInputRef = useRef(null);

    // Função para resetar o estado do modal ao fechar
    const handleClose = () => {
        setRecipients([]);
        setTitle('');
        setMessage('');
        setAttachments([]);
        setSendEmail(true);
        setError('');
        onClose();
    };

    if (!isOpen) return null;
    
    const getAuthHeader = () => {
        const token = sessionStorage.getItem('authToken');
        return token ? { 'Authorization': `Bearer ${token}` } : {};
    };

    const handleSelectClient = (client) => {
        if (client && !recipients.some(r => r.id === client.id)) {
            setRecipients([...recipients, client]);
        }
        setSearchQuery('');
    };
    
    const handleRemoveRecipient = (clientId) => {
        setRecipients(recipients.filter(r => r.id !== clientId));
    };

    const handleSelectAllOrClear = async () => {
        if (recipients.length > 0) {
            setRecipients([]);
            return;
        }
        setIsLoadingAll(true);
        setError('');
        try {
            const response = await fetch(`/api/cadastros/clientes?ramo=${ramoFilter}`, { headers: getAuthHeader() });
            if (!response.ok) throw new Error('Falha ao buscar a lista de clientes.');
            const allClients = await response.json();
            setRecipients(allClients);
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoadingAll(false);
        }
    };

    const handleFileChange = (event) => {
        setAttachments(prev => [...prev, ...event.target.files]);
    };

    const handleRemoveAttachment = (fileName) => {
        setAttachments(prev => prev.filter(file => file.name !== fileName));
    };

    const handleSend = async () => {
        setError('');
        if (recipients.length === 0 || !title || !message) {
            setError('Destinatários, título e mensagem são obrigatórios.');
            return;
        }

        setIsSending(true);
        
        const formData = new FormData();
        const clientIds = recipients.map(r => r.id);
        formData.append('clientIds', JSON.stringify(clientIds));
        formData.append('title', title);
        formData.append('message', message);
        formData.append('sendEmail', sendEmail); // Adiciona o valor do checkbox
        attachments.forEach(file => {
            formData.append('attachments', file);
        });

        try {
            const headers = new Headers();
            const token = sessionStorage.getItem('authToken');
            if (token) {
                headers.append('Authorization', `Bearer ${token}`);
            }

            const response = await fetch('/api/notifications/custom', {
                method: 'POST',
                headers: headers,
                body: formData,
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Falha ao enviar notificação.');
            }
            
            onSuccess();

        } catch (err) {
            setError(err.message);
        } finally {
            setIsSending(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4" onClick={handleClose}>
            <div className="bg-gray-800 text-white p-6 rounded-lg shadow-xl w-full max-w-2xl" onClick={e => e.stopPropagation()}>
                <h2 className="text-xl font-bold mb-6">Enviar Nova Notificação</h2>
                
                <div className="space-y-4">
                    {/* ... (campos de Destinatários, Título, Mensagem e Anexos permanecem iguais) ... */}
                    <div>
                        <div className="grid grid-cols-3 gap-4 mb-1">
                            <div className="col-span-2">
                                <label className="block text-sm font-medium text-gray-300">Destinatários</label>
                            </div>
                            <div className="col-span-1">
                                <label className="block text-sm font-medium text-gray-300">Filtrar por Ramo</label>
                            </div>
                        </div>
                        <div className="flex items-start gap-4">
                            <div className="flex-grow">
                                <AutocompleteSearch
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    fetchSuggestions={fetchClientes}
                                    onSelect={handleSelectClient}
                                    placeholder="Pesquisar cliente para adicionar..."
                                />
                            </div>
                            <select
                                value={ramoFilter}
                                onChange={(e) => setRamoFilter(e.target.value)}
                                className="bg-gray-700 border-gray-600 rounded-md p-2 text-sm"
                            >
                                <option value="Todos">Todos</option>
                                <option value="Transportes">Transportes</option>
                                <option value="Industria">Indústria</option>
                                <option value="Comercio">Comércio</option>
                                <option value="Servicos">Serviços</option>
                                <option value="Outro">Outro</option>
                            </select>
                             <button
                                type="button"
                                onClick={handleSelectAllOrClear}
                                disabled={isLoadingAll}
                                className="bg-gray-600 hover:bg-gray-500 px-3 py-2 rounded-md text-sm font-semibold disabled:opacity-50"
                            >
                                {isLoadingAll ? '...' : (recipients.length > 0 ? 'Limpar' : 'Todos')}
                            </button>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2 min-h-[2rem] max-h-24 overflow-y-auto bg-gray-900/50 p-2 rounded-md">
                            {recipients.map(client => (
                                <span key={client.id} className="flex items-center gap-2 bg-orange-500 text-white text-sm font-medium px-2.5 py-0.5 rounded-full">
                                    {client.nome}
                                    <button onClick={() => handleRemoveRecipient(client.id)} className="text-white hover:text-gray-200 font-bold leading-none">&times;</button>
                                </span>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label htmlFor="title" className="block text-sm font-medium text-gray-300">Título</label>
                        <input type="text" id="title" value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md p-2" />
                    </div>
                     <div>
                        <label htmlFor="message" className="block text-sm font-medium text-gray-300">Mensagem (Suporta HTML básico)</label>
                        <div
                            id="message"
                            contentEditable="true"
                            onInput={e => setMessage(e.currentTarget.innerHTML)}
                            className="mt-1 block w-full h-32 overflow-y-auto bg-gray-700 border-gray-600 rounded-md p-2"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-300">Anexos</label>
                        <input type="file" ref={fileInputRef} onChange={handleFileChange} multiple accept="image/*" className="hidden"/>
                        <button onClick={() => fileInputRef.current.click()} className="mt-1 w-full flex items-center justify-center gap-2 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-md p-2 transition">
                            <FaPaperclip /> Adicionar Anexo(s)
                        </button>
                        <div className="mt-2 flex flex-wrap gap-2">
                             {attachments.map((file, index) => (
                                <div key={index} className="flex items-center gap-2 bg-gray-600 text-white text-xs px-2 py-1 rounded-full">
                                    {file.name}
                                    <button onClick={() => handleRemoveAttachment(file.name)} className="text-gray-300 hover:text-white font-bold leading-none">&times;</button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {error && <p className="text-sm text-red-400 mt-4 text-center">{error}</p>}
                
                <div className="flex justify-between items-center pt-6 mt-4 border-t border-gray-700">
                    <label className="flex items-center cursor-pointer">
                        <input 
                            type="checkbox" 
                            id="sendEmail"
                            checked={sendEmail}
                            onChange={(e) => setSendEmail(e.target.checked)}
                            className="h-4 w-4 rounded text-orange-500 bg-gray-600 border-gray-500 focus:ring-orange-500"
                        />
                        <span className="ml-2 text-sm text-gray-300">Enviar também por e-mail</span>
                    </label>
                    <div className="flex gap-3">
                        <button type="button" onClick={handleClose} className="bg-gray-600 text-gray-100 font-semibold py-2 px-4 rounded-md hover:bg-gray-500 transition">Cancelar</button>
                        <button type="button" onClick={handleSend} disabled={isSending} className="bg-blue-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-blue-700 transition disabled:opacity-50">
                            {isSending ? 'Enviando...' : 'Enviar Notificação'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}