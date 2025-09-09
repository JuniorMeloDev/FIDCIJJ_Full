'use client';

import { useState } from 'react';
import AutocompleteSearch from './AutoCompleteSearch';

export default function NewNotificationModal({ isOpen, onClose, onSuccess, fetchClientes }) {
    const [recipients, setRecipients] = useState([]);
    const [title, setTitle] = useState('');
    const [message, setMessage] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [error, setError] = useState('');

    // Novo state para controlar o texto do campo de busca
    const [searchQuery, setSearchQuery] = useState('');

    if (!isOpen) return null;
    
    const getAuthHeader = () => {
        const token = sessionStorage.getItem('authToken');
        return token ? { 'Authorization': `Bearer ${token}` } : {};
    };

    const handleSelectClient = (client) => {
        if (client && !recipients.some(r => r.id === client.id)) {
            setRecipients([...recipients, client]);
        }
        // Limpa o campo de busca após selecionar um cliente
        setSearchQuery('');
    };
    
    const handleRemoveRecipient = (clientId) => {
        setRecipients(recipients.filter(r => r.id !== clientId));
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

            // Limpa o formulário e fecha
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
                        <label className="block text-sm font-medium text-gray-300 mb-1">Destinatários (Clientes)</label>
                        <AutocompleteSearch
                            // Adicionadas as props 'value' e 'onChange' que estavam faltando
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            fetchSuggestions={fetchClientes}
                            onSelect={handleSelectClient}
                            placeholder="Pesquisar cliente para adicionar..."
                        />
                        <div className="mt-2 flex flex-wrap gap-2 min-h-[2rem]">
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