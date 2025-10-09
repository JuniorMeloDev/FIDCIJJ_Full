'use client';

import { useState, useEffect, useMemo } from 'react';
import { formatBRLInput, parseBRL } from '@/app/utils/formatters';
import PixConfirmationModal from './PixConfirmationModal';

export default function ComplementModal({ isOpen, onClose, onSave, lancamentoOriginal, contasMaster }) {
    const [valorComplemento, setValorComplemento] = useState('');
    const [dataComplemento, setDataComplemento] = useState(new Date().toISOString().split('T')[0]);
    const [contaBancaria, setContaBancaria] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');

    // --- NOVOS STATES PARA O PIX ---
    const [isPagarComPix, setIsPagarComPix] = useState(false);
    const [pixData, setPixData] = useState({ tipo_chave_pix: 'CPF/CNPJ', chave: '' });
    const [isPixConfirmOpen, setIsPixConfirmOpen] = useState(false);
    const [pixPayload, setPixPayload] = useState(null);
    // --- FIM DOS NOVOS STATES ---

    const isContaInter = useMemo(() => 
        contaBancaria && contaBancaria.toLowerCase().includes('inter'),
    [contaBancaria]);

    useEffect(() => {
        if (isOpen) {
            setValorComplemento('');
            setDataComplemento(new Date().toISOString().split('T')[0]);
            setContaBancaria(lancamentoOriginal?.contaBancaria || '');
            setIsPagarComPix(false);
            setPixData({ tipo_chave_pix: 'CPF/CNPJ', chave: '' });
            setError('');
        }
    }, [isOpen, lancamentoOriginal]);

    if (!isOpen) return null;

    const handleConfirmAndSendPix = async () => {
        setIsSaving(true);
        setError('');
        try {
            const response = await fetch('/api/lancamentos/pix', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionStorage.getItem('authToken')}` },
                body: JSON.stringify(pixPayload)
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || 'Falha ao processar pagamento PIX.');
            
            // Passa os dados do PIX de volta para a função onSave
            await onSave(null, { pixResult: result.pixResult, pixPayload: pixPayload }); 
            
            setIsPixConfirmOpen(false);
            onClose();

        } catch (err) {
            setError(err.message);
            setIsPixConfirmOpen(false); 
        } finally {
            setIsSaving(false);
        }
    };

    const handleSaveClick = async () => {
        setError('');
        if (isPagarComPix) {
            const contaOrigemObj = contasMaster.find(c => c.contaBancaria === contaBancaria);
            if (!contaOrigemObj) {
                setError("Conta de origem não encontrada.");
                return;
            }
            const payload = {
                valor: parseBRL(valorComplemento),
                descricao: `Complemento Borderô #${lancamentoOriginal?.operacaoId}`,
                contaOrigem: contaOrigemObj.contaCorrente,
                empresaAssociada: lancamentoOriginal.empresaAssociada,
                pix: {
                    tipo: pixData.tipo_chave_pix,
                    chave: pixData.chave
                }
            };
            setPixPayload(payload);
            setIsPixConfirmOpen(true);
        } else {
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
        }
    };

    let displayTitle = `Lançamento referente ao Borderô #${lancamentoOriginal?.operacaoId || ''}`;
    if (lancamentoOriginal?.descricao) {
        const nfMatch = lancamentoOriginal.descricao.match(/(NF|CTe) [0-9.]+/);
        if (nfMatch && nfMatch[0]) {
            displayTitle = `Lançamento referente ao Borderô ${nfMatch[0]}`;
        }
    }

    return (
        <>
            <PixConfirmationModal 
                isOpen={isPixConfirmOpen}
                onClose={() => setIsPixConfirmOpen(false)}
                onConfirm={handleConfirmAndSendPix}
                data={pixPayload}
                isSending={isSaving}
            />

            <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50">
                <div className="bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-md text-white">
                    <h2 className="text-2xl font-bold mb-4">Adicionar Complemento de Pagamento</h2>
                    <p className="text-sm text-gray-400 mb-4">{displayTitle}</p>

                    <div className="space-y-4">
                        <div className="mb-4">
                            <label htmlFor="dataComplemento" className="block text-sm font-medium text-gray-300">Data do Pagamento</label>
                            <input
                                type="date"
                                id="dataComplemento"
                                value={dataComplemento}
                                onChange={(e) => setDataComplemento(e.target.value)}
                                className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm p-2"
                                disabled={isPagarComPix}
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

                        {isContaInter && (
                            <div className="pt-2 border-t border-gray-700">
                                <label className="flex items-center cursor-pointer">
                                    <input 
                                        type="checkbox" 
                                        checked={isPagarComPix}
                                        onChange={(e) => setIsPagarComPix(e.target.checked)}
                                        className="h-4 w-4 rounded text-orange-500 bg-gray-600 border-gray-500 focus:ring-orange-500"
                                    />
                                    <span className="ml-2 text-sm font-semibold text-orange-300">Pagar com PIX</span>
                                </label>
                            </div>
                        )}

                        {isPagarComPix && (
                            <div className="space-y-4 border-t border-orange-500/50 pt-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-300">Tipo da Chave</label>
                                        <select value={pixData.tipo_chave_pix} onChange={e => setPixData(p => ({...p, tipo_chave_pix: e.target.value}))} className="mt-1 block w-full bg-gray-700 p-2 rounded">
                                            <option value="CPF/CNPJ">CPF/CNPJ</option>
                                            <option value="Email">Email</option>
                                            <option value="Telefone">Telefone</option>
                                            <option value="Aleatória">Aleatória</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-300">Chave PIX</label>
                                        <input type="text" value={pixData.chave} onChange={e => setPixData(p => ({...p, chave: e.target.value}))} required className="mt-1 block w-full bg-gray-700 p-2 rounded"/>
                                    </div>
                                </div>
                            </div>
                        )}

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

                        {error && <p className="text-sm text-red-400 text-center">{error}</p>}
                    </div>

                    <div className="flex justify-end gap-4 mt-6 border-t border-gray-700 pt-4">
                        <button onClick={onClose} className="bg-gray-600 text-gray-100 font-semibold py-2 px-4 rounded-md hover:bg-gray-500 transition">
                            Cancelar
                        </button>
                        <button onClick={handleSaveClick} disabled={isSaving} className="bg-orange-500 text-white font-semibold py-2 px-4 rounded-md hover:bg-orange-600 transition disabled:opacity-50">
                            {isSaving ? 'Processando...' : (isPagarComPix ? 'Avançar' : 'Salvar Complemento')}
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}