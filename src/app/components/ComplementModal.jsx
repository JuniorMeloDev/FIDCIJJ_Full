'use client';

import { useState, useEffect } from 'react';
import { formatBRLInput, parseBRL } from '@/app/utils/formatters';

export default function ComplementModal({ isOpen, onClose, onSave, lancamentoOriginal, contasMaster }) {
    const [valorComplemento, setValorComplemento] = useState('');
    const [dataComplemento, setDataComplemento] = useState(new Date().toISOString().split('T')[0]);
    const [contaBancaria, setContaBancaria] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (isOpen && lancamentoOriginal) {
            setContaBancaria(lancamentoOriginal.contaBancaria || '');
            setValorComplemento('');
            setDataComplemento(new Date().toISOString().split('T')[0]);
        }
    }, [isOpen, lancamentoOriginal]);

    if (!isOpen) return null;

    const handleSaveClick = async () => {
        setIsSaving(true);
        const payload = {
            valor: parseBRL(valorComplemento),
            data: dataComplemento,
            operacao_id: lancamentoOriginal.operacaoId,
            conta_bancaria: contaBancaria,
            empresa_associada: lancamentoOriginal.empresaAssociada
        };
        const success = await onSave(payload);
        if (success) {
            onClose();
        }
        setIsSaving(false);
    };

    // --- LÓGICA MODIFICADA PARA O TÍTULO ---
    let displayTitle = `Lançamento referente ao Borderô #${lancamentoOriginal?.operacaoId || ''}`;
    if (lancamentoOriginal?.descricao) {
        // Tenta encontrar "NF XXX" ou "CTe YYY" na descrição original
        const nfMatch = lancamentoOriginal.descricao.match(/(NF|CTe) [0-9.]+/);
        if (nfMatch && nfMatch[0]) {
            displayTitle = `Lançamento referente ao Borderô ${nfMatch[0]}`;
        }
    }
    // --- FIM DA MODIFICAÇÃO ---

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50">
            <div className="bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-md text-white">
                <h2 className="text-2xl font-bold mb-4">Adicionar Complemento de Pagamento</h2>
                {/* MODIFICADO: Usa a nova variável para o título */}
                <p className="text-sm text-gray-400 mb-4">{displayTitle}</p>

                <div className="mb-4">
                    <label htmlFor="dataComplemento" className="block text-sm font-medium text-gray-300">Data do Pagamento</label>
                    <input
                        type="date"
                        id="dataComplemento"
                        value={dataComplemento}
                        onChange={(e) => setDataComplemento(e.target.value)}
                        className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm p-2"
                    />
                </div>
                
                <div className="mb-4">
                    <label htmlFor="contaBancaria" className="block text-sm font-medium text-gray-300">Debitar da Conta</label>
                    <select
                        id="contaBancaria"
                        value={contaBancaria}
                        onChange={(e) => setContaBancaria(e.target.value)}
                        required
                        className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm p-2"
                    >
                        <option value="">Selecione uma conta...</option>
                        {Array.isArray(contasMaster) && contasMaster.map(c => (
                            <option key={c.contaBancaria} value={c.contaBancaria}>{c.contaBancaria}</option>
                        ))}
                    </select>
                </div>

                <div className="mb-6">
                    <label htmlFor="valorComplemento" className="block text-sm font-medium text-gray-300">Valor</label>
                    <input
                        type="text"
                        id="valorComplemento"
                        value={valorComplemento}
                        onChange={(e) => setValorComplemento(formatBRLInput(e.target.value))}
                        placeholder="R$ 0,00"
                        className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm p-2"
                    />
                </div>

                <div className="flex justify-end gap-4">
                    <button onClick={onClose} className="bg-gray-600 text-gray-100 font-semibold py-2 px-4 rounded-md hover:bg-gray-500 transition">
                        Cancelar
                    </button>
                    <button onClick={handleSaveClick} disabled={isSaving} className="bg-orange-500 text-white font-semibold py-2 px-4 rounded-md hover:bg-orange-600 transition disabled:opacity-50">
                        {isSaving ? 'Salvando...' : 'Salvar Complemento'}
                    </button>
                </div>
            </div>
        </div>
    );
}