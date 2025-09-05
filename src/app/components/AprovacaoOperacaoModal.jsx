'use client';

import { useState, useEffect } from 'react';
import { formatBRLNumber, formatDate } from '@/app/utils/formatters';

export default function AprovacaoOperacaoModal({ isOpen, onClose, onSave, operacao, contasBancarias }) {
    const [status, setStatus] = useState('Aprovada');
    const [contaBancariaId, setContaBancariaId] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (isOpen && operacao) {
            setStatus('Aprovada');
            setContaBancariaId('');
            setError('');
        }
    }, [isOpen, operacao]);

    if (!isOpen || !operacao) return null;

    const handleSave = async () => {
        if (status === 'Aprovada' && !contaBancariaId) {
            setError('É necessário selecionar uma conta bancária para aprovar a operação.');
            return;
        }
        setIsSaving(true);
        setError('');
        
        const payload = {
            status,
            conta_bancaria_id: status === 'Aprovada' ? parseInt(contaBancariaId, 10) : null,
        };

        const success = await onSave(operacao.id, payload);
        if (success) {
            onClose();
        } else {
            setError('Ocorreu um erro ao salvar a operação.');
        }
        setIsSaving(false);
    };
    
    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4">
            <div className="bg-gray-800 text-white p-6 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
                <h2 className="text-xl font-bold mb-4 flex-shrink-0">Análise de Operação #{operacao.id}</h2>
                <div className="flex-grow overflow-y-auto pr-2">
                    {/* ... (código da tabela de detalhes, sem alterações) ... */}
                </div>
                <div className="flex-shrink-0 border-t border-gray-700 pt-4 mt-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-300">Ação</label>
                            <select value={status} onChange={e => setStatus(e.target.value)} className="mt-1 w-full bg-gray-700 p-2 rounded">
                                <option value="Aprovada">Aprovar</option>
                                <option value="Rejeitada">Rejeitar</option>
                            </select>
                        </div>
                        {status === 'Aprovada' && (
                            <div>
                                <label className="block text-sm font-medium text-gray-300">Conta para Débito</label>
                                 <select value={contaBancariaId} onChange={e => setContaBancariaId(e.target.value)} className="mt-1 w-full bg-gray-700 p-2 rounded">
                                    <option value="">Selecione uma conta...</option>
                                    {contasBancarias.map(conta => (
                                        // CORREÇÃO: Padronizado o formato de exibição da conta.
                                        <option key={conta.id} value={conta.id}>{conta.banco} - {conta.agencia}/{conta.conta_corrente}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </div>
                    {error && <p className="text-red-400 text-sm mt-4 text-center">{error}</p>}
                    <div className="mt-6 flex justify-end gap-4">
                        <button onClick={onClose} className="bg-gray-600 font-semibold py-2 px-4 rounded-md">Cancelar</button>
                        <button onClick={handleSave} disabled={isSaving} className="bg-green-600 font-semibold py-2 px-4 rounded-md">
                            {isSaving ? 'Salvando...' : 'Confirmar Ação'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}