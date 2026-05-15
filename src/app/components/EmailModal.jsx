'use client';

import { useState, useEffect } from 'react';

export default function EmailModal({ isOpen, onClose, onSend, isSending, clienteId }) {
  const [recipients, setRecipients] = useState([]);
  const [newEmail, setNewEmail] = useState('');

  const getAuthHeader = () => {
    const token = sessionStorage.getItem('authToken');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  useEffect(() => {
    const fetchClientRecipients = async () => {
      setRecipients([]);

      if (isOpen && clienteId) {
        try {
          const response = await fetch(`/api/cadastros/clientes/${clienteId}/emails`, { headers: getAuthHeader() });
          if (response.ok) {
            const clientEmails = await response.json();
            setRecipients(clientEmails || []);
          } else {
            console.error('API falhou ao buscar e-mails do cliente.');
            setRecipients([]);
          }
        } catch (error) {
          console.error('Erro de rede ao buscar e-mails do cliente:', error);
          setRecipients([]);
        }
      }
    };

    fetchClientRecipients();
  }, [isOpen, clienteId]);

  if (!isOpen) return null;

  const handleAddEmail = () => {
    if (newEmail && newEmail.includes('@') && !recipients.includes(newEmail)) {
      setRecipients([...recipients, newEmail]);
      setNewEmail('');
    }
  };

  const handleRemoveEmail = (emailToRemove) => {
    setRecipients(recipients.filter((email) => email !== emailToRemove));
  };

  const handleSend = () => {
    if (recipients.length === 0) {
      alert('Por favor, adicione pelo menos um destinatário.');
      return;
    }
    onSend(recipients);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl bg-gray-800 text-white shadow-2xl sm:max-w-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-gray-700 px-5 py-4 sm:px-6">
          <h2 className="text-xl font-bold">Enviar E-mail de Notificação?</h2>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-6">
          <p className="mb-4 text-gray-300">
            O borderô foi guardado. Deseja enviar o PDF por e-mail para os destinatários abaixo?
          </p>

          <div className="rounded-md bg-gray-700 p-4">
            <label className="block text-sm font-medium text-gray-200">Destinatários</label>

            <div className="mt-2 flex min-h-[40px] flex-wrap gap-2">
              {recipients.map((email) => (
                <span key={email} className="flex items-center gap-2 rounded-full bg-orange-500 px-3 py-1 text-sm font-medium text-white">
                  {email}
                  <button onClick={() => handleRemoveEmail(email)} className="text-lg font-bold leading-none text-white hover:text-gray-200" type="button">
                    &times;
                  </button>
                </span>
              ))}
            </div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="Adicionar outro e-mail"
                className="w-full flex-grow rounded-md border border-gray-500 bg-gray-600 p-3 text-white"
              />
              <button type="button" onClick={handleAddEmail} className="rounded-md bg-gray-600 px-4 py-3 font-semibold text-gray-100 transition hover:bg-gray-500">
                Adicionar
              </button>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-700 px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <button onClick={onClose} disabled={isSending} className="w-full rounded-md bg-gray-600 px-4 py-3 font-semibold text-gray-100 transition hover:bg-gray-500 disabled:opacity-50 sm:w-auto">
              Não, Obrigado
            </button>
            <button onClick={handleSend} disabled={isSending || recipients.length === 0} className="w-full rounded-md bg-green-500 px-4 py-3 font-semibold text-white transition hover:bg-green-600 disabled:opacity-50 sm:w-auto">
              {isSending ? 'Enviando...' : 'Sim, Enviar E-mail'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
