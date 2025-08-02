'use client';

import { useState, useEffect } from 'react';
import { API_URL } from '../apiConfig';

export default function EmailModal({ isOpen, onClose, onSend, isSending, clienteId }) {
    const [recipients, setRecipients] = useState([]);
    const [newEmail, setNewEmail] = useState('');
    
    const getAuthHeader = () => {
        const token = sessionStorage.getItem('authToken'); 
        return token ? { 'Authorization': `Bearer ${token}` } : {};
    };

    useEffect(() => {
        const fetchClientRecipients = async () => {
            // Limpa a lista anterior sempre que o modal abre
            setRecipients([]); 

            if (isOpen && clienteId) {
                try {
                    // Busca os e-mails do cliente usando o ID dele
                    const response = await fetch(`${API_URL}/cadastros/clientes/${clienteId}/emails`, { headers: getAuthHeader() });
                    if (response.ok) {
                        const clientEmails = await response.json();
                        setRecipients(clientEmails || []);
                    }
                } catch (error) {
                    console.error("Falha ao buscar e-mails do cliente:", error);
                    setRecipients([]);
                }
            }
        };

        fetchClientRecipients();
    }, [isOpen, clienteId]); // Reage à abertura do modal e à mudança do clienteId

    if (!isOpen) return null;

    const handleAddEmail = () => {
        if (newEmail && newEmail.includes('@') && !recipients.includes(newEmail)) {
            setRecipients([...recipients, newEmail]);
            setNewEmail('');
        }
    };

    const handleRemoveEmail = (emailToRemove) => {
        setRecipients(recipients.filter(email => email !== emailToRemove));
    };

    const handleSend = () => {
        if (recipients.length === 0) {
            alert("Por favor, adicione pelo menos um destinatário.");
            return;
        }
        onSend(recipients);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50">
            <div className="bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-xl text-white">
                <h2 className="text-2xl font-bold mb-4">Enviar E-mail de Notificação?</h2>
                <p className="mb-4 text-gray-300">O borderô foi guardado. Deseja enviar o PDF por e-mail para os destinatários abaixo?</p>
                
                <div className="bg-gray-700 p-4 rounded-md">
                    <label className="block text-sm font-medium text-gray-200">Destinatários</label>
                    
                    <div className="mt-2 flex flex-wrap gap-2 mb-4 min-h-[40px]">
                        {recipients.map(email => (
                            <span key={email} className="flex items-center gap-2 bg-orange-500 text-white text-sm font-medium px-2.5 py-0.5 rounded-full">
                                {email}
                                <button onClick={() => handleRemoveEmail(email)} className="text-white hover:text-gray-200 font-bold text-lg leading-none">&times;</button>
                            </span>
                        ))}
                    </div>

                    <div className="flex gap-2">
                        <input
                            type="email"
                            value={newEmail}
                            onChange={(e) => setNewEmail(e.target.value)}
                            placeholder="Adicionar outro e-mail"
                            className="flex-grow bg-gray-600 border-gray-500 rounded-md shadow-sm p-2 text-white"
                        />
                        <button type="button" onClick={handleAddEmail} className="bg-gray-600 text-gray-100 font-semibold py-2 px-4 rounded-md hover:bg-gray-500 transition">
                            Adicionar
                        </button>
                    </div>
                </div>

                <div className="mt-6 flex justify-end gap-4">
                    <button onClick={onClose} disabled={isSending} className="bg-gray-600 text-gray-100 font-semibold py-2 px-4 rounded-md hover:bg-gray-500 transition disabled:opacity-50">
                        Não, Obrigado
                    </button>
                    <button onClick={handleSend} disabled={isSending || recipients.length === 0} className="bg-green-500 text-white font-semibold py-2 px-4 rounded-md hover:bg-green-600 transition disabled:opacity-50">
                        {isSending ? 'Enviando...' : 'Sim, Enviar E-mail'}
                    </button>
                </div>
            </div>
        </div>
    );
}