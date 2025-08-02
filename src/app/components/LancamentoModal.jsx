'use client';

import { useState, useEffect } from 'react';
import { formatBRLInput, parseBRL } from '@/app/utils/formatters';

export default function LancamentoModal({ isOpen, onClose, onSave, contasMaster, clienteMasterNome }) {
    const [tipo, setTipo] = useState('DEBITO');
    const [data, setData] = useState(new Date().toISOString().split('T')[0]);
    const [descricao, setDescricao] = useState('');
    const [valor, setValor] = useState('');
    const [contaOrigem, setContaOrigem] = useState('');
    const [contaDestino, setContaDestino] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (isOpen) {
            handleLimpar();
        }
    }, [isOpen]);
    
    if (!isOpen) return null;

    const handleLimpar = () => {
        setTipo('DEBITO');
        setData(new Date().toISOString().split('T')[0]);
        setDescricao('');
        setValor('');
        setContaOrigem('');
        setContaDestino('');
        setError('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        
        if (tipo === 'TRANSFERENCIA' && contaOrigem === contaDestino) {
            setError('A conta de origem e destino não podem ser as mesmas.');
            return;
        }

        setIsSaving(true);
        const payload = {
            tipo,
            data,
            descricao,
            valor: parseBRL(valor),
            contaOrigem,
            empresaAssociada: clienteMasterNome, 
            contaDestino: tipo === 'TRANSFERENCIA' ? contaDestino : null,
            empresaDestino: tipo === 'TRANSFERENCIA' ? clienteMasterNome : null,
        };
        
        const success = await onSave(payload);
        if (success) {
            onClose();
        } else {
            setError('Falha ao salvar o lançamento. Verifique os dados e tente novamente.');
        }
        setIsSaving(false);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50" onClick={onClose}>
            <div className="bg-gray-800 text-white p-6 rounded-lg shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
                <h2 className="text-xl font-bold mb-6">Novo Lançamento Manual</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">Tipo de Lançamento</label>
                        <div className="flex space-x-4">
                            <label className="flex items-center"><input type="radio" name="tipo" value="DEBITO" checked={tipo === 'DEBITO'} onChange={(e) => setTipo(e.target.value)} className="h-4 w-4 text-orange-500 border-gray-600"/> <span className="ml-2 text-sm">Saída (Débito)</span></label>
                            <label className="flex items-center"><input type="radio" name="tipo" value="CREDITO" checked={tipo === 'CREDITO'} onChange={(e) => setTipo(e.target.value)} className="h-4 w-4 text-orange-500 border-gray-600"/> <span className="ml-2 text-sm">Entrada (Crédito)</span></label>
                            <label className="flex items-center"><input type="radio" name="tipo" value="TRANSFERENCIA" checked={tipo === 'TRANSFERENCIA'} onChange={(e) => setTipo(e.target.value)} className="h-4 w-4 text-orange-500 border-gray-600"/> <span className="ml-2 text-sm">Transferência</span></label>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="data" className="block text-sm font-medium text-gray-300">Data</label>
                            <input type="date" id="data" value={data} onChange={e => setData(e.target.value)} required className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm p-2"/>
                        </div>
                        <div>
                            <label htmlFor="valor" className="block text-sm font-medium text-gray-300">Valor</label>
                            <input type="text" id="valor" value={valor} onChange={e => setValor(formatBRLInput(e.target.value))} required placeholder="R$ 0,00" className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm p-2"/>
                        </div>
                    </div>
                    
                    <div>
                        <label htmlFor="descricao" className="block text-sm font-medium text-gray-300">Descrição</label>
                        <input type="text" id="descricao" value={descricao} onChange={e => setDescricao(e.target.value)} required className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm p-2"/>
                    </div>
                    
                    { (tipo === 'DEBITO' || tipo === 'CREDITO') && (
                         <div>
                           <label htmlFor="contaOrigem" className="block text-sm font-medium text-gray-300">Conta Master</label>
                           <select id="contaOrigem" name="contaOrigem" value={contaOrigem} onChange={e => setContaOrigem(e.target.value)} required className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm p-2">
                                <option value="">Selecione...</option>
                                {Array.isArray(contasMaster) && contasMaster.map(c => <option key={c.contaBancaria} value={c.contaBancaria}>{c.contaBancaria}</option>)}
                           </select>
                        </div>
                    )}
                    
                    {tipo === 'TRANSFERENCIA' && (
                        <div className="space-y-4 border-t border-gray-700 pt-4">
                             <div>
                                <label htmlFor="contaOrigem" className="block text-sm font-medium text-gray-300">Conta de Origem</label>
                                <select id="contaOrigem" name="contaOrigem" value={contaOrigem} onChange={e => setContaOrigem(e.target.value)} required className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm p-2">
                                    <option value="">Selecione...</option>
                                    {Array.isArray(contasMaster) && contasMaster.map(c => <option key={c.contaBancaria + '-origem'} value={c.contaBancaria}>{c.contaBancaria}</option>)}
                                </select>
                             </div>
                             <div>
                                <label htmlFor="contaDestino" className="block text-sm font-medium text-gray-300">Conta de Destino</label>
                                <select id="contaDestino" name="contaDestino" value={contaDestino} onChange={e => setContaDestino(e.target.value)} required className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm p-2">
                                    <option value="">Selecione...</option>
                                    {Array.isArray(contasMaster) && contasMaster.map(c => <option key={c.contaBancaria + '-destino'} value={c.contaBancaria}>{c.contaBancaria}</option>)}
                                </select>
                            </div>
                        </div>
                    )}

                    {error && <p className="text-sm text-red-400 mt-2">{error}</p>}
                    
                    <div className="flex justify-end gap-3 pt-4 border-t border-gray-700">
                        <button type="button" onClick={onClose} className="bg-gray-600 text-gray-100 font-semibold py-2 px-4 rounded-md hover:bg-gray-500 transition">Cancelar</button>
                        <button type="submit" disabled={isSaving} className="bg-orange-500 text-white font-semibold py-2 px-4 rounded-md hover:bg-orange-600 transition disabled:bg-orange-400">
                            {isSaving ? 'Salvando...' : 'Salvar Lançamento'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}