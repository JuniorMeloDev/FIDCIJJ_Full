'use client';

import { useState } from 'react';
import AutocompleteSearch from './AutoCompleteSearch';

export default function NewNotificationModal({ isOpen, onClose, onSuccess, fetchClientes }) {
    const [recipients, setRecipients] = useState([]);
    const [title, setTitle] = useState('');
    const [message, setMessage] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [error, setError] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    
    // Novo state para controlar o carregamento de todos os clientes
    const [isLoadingAll, setIsLoadingAll] = useState(false);

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

    // Nova função para selecionar todos os clientes ou limpar a seleção
    const handleSelectAllOrClear = async () => {
        if (recipients.length > 0) {
            setRecipients([]);
            return;
        }

        setIsLoadingAll(true);
        setError('');
        try {
            const response = await fetch('/api/cadastros/clientes', { headers: getAuthHeader() });
            if (!response.ok) throw new Error('Falha ao buscar a lista completa de clientes.');
            const allClients = await response.json();
            setRecipients(allClients);
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoadingAll(false);
        }
    };

    const handleSend = async () => {
        setError('');
        if (recipients.length === 0 || !title || !message) {
            setError('Todos os campos são obrigatórios.');
            return;
        }

        setIsSending(true);
        try {
            const clientIds = recipients.map(r => r.id);
            const response = await fetch('/api/notifications/custom', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
                body: JSON.stringify({ clientIds, title, message }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Falha ao enviar notificação.');
            }
            
            setRecipients([]);
            setTitle('');
            setMessage('');
            onSuccess();

        } catch (err) {
            setError(err.message);
        } finally {
            setIsSending(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4" onClick={onClose}>
            <div className="bg-gray-800 text-white p-6 rounded-lg shadow-xl w-full max-w-2xl" onClick={e => e.stopPropagation()}>
                <h2 className="text-xl font-bold mb-6">Enviar Nova Notificação</h2>
                
                <div className="space-y-4">
                    <div>
                        <div className="flex justify-between items-center mb-1">
                            <label className="block text-sm font-medium text-gray-300">Destinatários (Clientes)</label>
                            {/* Botão para selecionar/limpar todos */}
                            <button
                                type="button"
                                onClick={handleSelectAllOrClear}
                                disabled={isLoadingAll}
                                className="text-sm text-orange-400 hover:text-orange-300 disabled:opacity-50"
                            >
                                {isLoadingAll ? 'Carregando...' : (recipients.length > 0 ? 'Limpar Seleção' : 'Selecionar Todos')}
                            </button>
                        </div>
                        <AutocompleteSearch
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            fetchSuggestions={fetchClientes}
                            onSelect={handleSelectClient}
                            placeholder="Pesquisar cliente para adicionar..."
                        />
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
                        <input
                            type="text"
                            id="title"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md p-2"
                        />
                    </div>
                     <div>
                        <label htmlFor="message" className="block text-sm font-medium text-gray-300">Mensagem</label>
                        <textarea
                            id="message"
                            rows="5"
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md p-2"
                        />
                    </div>
                </div>

                {error && <p className="text-sm text-red-400 mt-4 text-center">{error}</p>}
                
                <div className="flex justify-end gap-3 pt-6 mt-4 border-t border-gray-700">
                    <button type="button" onClick={onClose} className="bg-gray-600 text-gray-100 font-semibold py-2 px-4 rounded-md hover:bg-gray-500 transition">Cancelar</button>
                    <button type="button" onClick={handleSend} disabled={isSending} className="bg-blue-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-blue-700 transition disabled:opacity-50">
                        {isSending ? 'Enviando...' : 'Enviar Notificação'}
                    </button>
                </div>
            </div>
        </div>
    );
}