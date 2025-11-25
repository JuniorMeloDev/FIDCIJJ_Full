'use client';

import { useState, useEffect } from 'react';
import { formatBRLInput, parseBRL, formatDisplayConta } from '@/app/utils/formatters';

export default function EditLancamentoModal({ isOpen, onClose, onSave, lancamento, contasMaster }) {
    const [formData, setFormData] = useState({});
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (isOpen && lancamento) {
            setFormData({
                ...lancamento,
                data_movimento: lancamento.dataMovimento ? new Date(lancamento.dataMovimento).toISOString().split('T')[0] : '',
                valor: formatBRLInput(String(Math.abs(lancamento.valor) * 100)),
                conta_bancaria: lancamento.contaBancaria || '',
                natureza: lancamento.natureza || 'Despesas Administrativas'
            });
        }
    }, [isOpen, lancamento]);

    if (!isOpen || !lancamento) return null;

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleValorChange = (e) => {
        setFormData(prev => ({ ...prev, valor: formatBRLInput(e.target.value) }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setIsSaving(true);

        const valorNumerico = parseBRL(formData.valor);
        const valorFinal = lancamento.valor < 0 ? -Math.abs(valorNumerico) : Math.abs(valorNumerico);
        
        const payload = {
            id: formData.id,
            data_movimento: formData.data_movimento,
            descricao: formData.descricao,
            valor: valorFinal,
            conta_bancaria: formData.conta_bancaria,
            // Categoria agora é automática para despesas manuais
            categoria: lancamento.valor < 0 ? 'Movimentação Avulsa' : lancamento.categoria,
            natureza: (lancamento.valor < 0) ? formData.natureza : null
        };

        const success = await onSave(payload);
        if (success) {
            onClose();
        } else {
            setError('Falha ao atualizar o lançamento.');
        }
        setIsSaving(false);
    };

    const isReadOnly = ['Pagamento de Borderô', 'Recebimento', 'Transferencia Enviada', 'Transferencia Recebida'].includes(lancamento.categoria);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50" onClick={onClose}>
            <div className="bg-gray-800 text-white p-6 rounded-lg shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
                <h2 className="text-xl font-bold mb-6">Editar Lançamento</h2>

                {isReadOnly ? (
                    <div>
                        <p className="text-yellow-400">Este lançamento foi gerado automaticamente por uma operação e não pode ser editado.</p>
                        <div className="flex justify-end gap-3 pt-4 mt-4 border-t border-gray-700">
                           <button type="button" onClick={onClose} className="bg-gray-600 text-gray-100 font-semibold py-2 px-4 rounded-md hover:bg-gray-500 transition">Fechar</button>
                        </div>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {/* ... Campos de Data e Valor (iguais ao anterior) ... */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label htmlFor="data_movimento" className="block text-sm font-medium text-gray-300">Data</label>
                                <input type="date" id="data_movimento" name="data_movimento" value={formData.data_movimento || ''} onChange={handleChange} required className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm p-2"/>
                            </div>
                            <div>
                                <label htmlFor="valor" className="block text-sm font-medium text-gray-300">Valor</label>
                                <input type="text" id="valor" value={formData.valor || ''} onChange={handleValorChange} required className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm p-2"/>
                            </div>
                        </div>
                        
                        <div>
                            <label htmlFor="descricao" className="block text-sm font-medium text-gray-300">Descrição</label>
                            <input type="text" id="descricao" name="descricao" value={formData.descricao || ''} onChange={handleChange} required className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm p-2"/>
                        </div>

                        <div>
                           <label htmlFor="conta_bancaria" className="block text-sm font-medium text-gray-300">Conta</label>
                           <select id="conta_bancaria" name="conta_bancaria" value={formData.conta_bancaria || ''} onChange={handleChange} required className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm p-2">
                                <option value="">Selecione...</option>
                                {Array.isArray(contasMaster) && contasMaster.map(c => 
                                    <option key={c.contaBancaria} value={c.contaBancaria}>{formatDisplayConta(c.contaBancaria)}</option>
                                )}
                           </select>
                        </div>
                        
                        {/* CHECKBOX REMOVIDO. CAMPO NATUREZA MANTIDO */}
                        {lancamento.valor < 0 && (
                            <div className="mt-2">
                                <label className="block text-sm font-medium text-orange-400 mb-1">Natureza (Classificação DRE)</label>
                                <select 
                                    name="natureza"
                                    value={formData.natureza} 
                                    onChange={handleChange}
                                    className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-white"
                                >
                                    <option value="Despesas Administrativas">Despesas Administrativas</option>
                                    <option value="Despesas Financeiras">Despesas Financeiras</option>
                                    <option value="Despesas Tributárias">Despesas Tributárias</option>
                                    <option value="Serviços de Terceiros (FIDC)">Serviços de Terceiros</option>
                                    <option value="Aquisição de Direitos Creditórios">Aquisição de Direitos Creditórios</option>
                                    <option value="Distribuição de Lucros / Amortização">Distribuição de Lucros / Amortização</option>
                                    <option value="Transferência Entre Contas">Transferência Entre Contas</option>
                                    <option value="Empréstimos / Mútuos">Empréstimos / Mútuos</option>
                                    <option value="Outras Despesas">Outras Despesas</option>
                                </select>
                            </div>
                        )}

                        {error && <p className="text-sm text-red-400 mt-2">{error}</p>}
                        
                        <div className="flex justify-end gap-3 pt-4 border-t border-gray-700">
                            <button type="button" onClick={onClose} className="bg-gray-600 text-gray-100 font-semibold py-2 px-4 rounded-md hover:bg-gray-500 transition">Cancelar</button>
                            <button type="submit" disabled={isSaving} className="bg-orange-500 text-white font-semibold py-2 px-4 rounded-md hover:bg-orange-600 transition disabled:bg-orange-400">
                                {isSaving ? 'Salvando...' : 'Salvar Alterações'}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}