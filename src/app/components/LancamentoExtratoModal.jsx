// src/app/components/LancamentoExtratoModal.jsx
'use client';

import { useState, useEffect } from 'react';
import { formatBRLNumber, formatDisplayConta } from '@/app/utils/formatters';

const formatarDataParaDisplay = (dataISO) => {
    if (!dataISO || typeof dataISO !== 'string') return '';
    const partes = dataISO.split('-'); 
    if (partes.length === 3) {
        return `${partes[2]}/${partes[1]}/${partes[0]}`; 
    }
    return dataISO; 
};

export default function LancamentoExtratoModal({ 
    isOpen, 
    onClose, 
    onSave, 
    transacao, 
    contasInternas = [],
    showNotification 
}) {
    const [descricao, setDescricao] = useState('');
    const [contaBancaria, setContaBancaria] = useState('');
    // Categoria ainda existe no state para envio à API, mas não será mostrada
    const [categoria, setCategoria] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    
    // State para Natureza
    const [natureza, setNatureza] = useState('Despesas Financeiras'); 

    const isDebito = transacao?.valor < 0;

    useEffect(() => {
        if (isOpen && transacao) {
            setDescricao(transacao.descricao || '');
            const contaInicial = transacao.conta_bancaria || '';
            setContaBancaria(contaInicial);
            
            // Define categoria automaticamente nos bastidores
            setCategoria(isDebito ? 'Despesa Avulsa' : 'Receita Avulsa');
            
            // Define padrão para natureza
            setNatureza(isDebito ? 'Despesas Financeiras' : 'Receitas Financeiras');
            setError('');
        }
    }, [isOpen, transacao, isDebito]);

    const handleSave = async () => {
        setError('');

        if (!contaBancaria) {
            setError('Por favor, selecione a conta interna para vincular este lançamento.');
            return;
        }
        if (!descricao || descricao.trim() === '') {
            setError('A descrição é obrigatória.');
            return;
        }
        
        // A validação de categoria continua, mas como é automática, sempre passará
        if (!categoria) {
            setError('Erro interno: Categoria não definida.');
            return;
        }

        setLoading(true);

        const dataISO = transacao.data;
        if (!dataISO || typeof dataISO !== 'string') {
            setError('Data da transação inválida ou não encontrada.');
            setLoading(false);
            return;
        }

        const payload = {
            data_movimento: dataISO,
            descricao: descricao,
            valor: parseFloat(transacao.valor), 
            conta_bancaria: contaBancaria,
            categoria: categoria, // Envia o valor automático
            transaction_id: transacao.idTransacao || transacao.transaction_id,
            // Envia a natureza selecionada se for débito, senão nulo ou padrão de receita
            natureza: isDebito ? natureza : 'Receitas Financeiras'
        };

        const success = await onSave(payload);
        
        if (success) {
            if (showNotification) {
                showNotification('Movimento Criado com Sucesso', 'success');
            }
            onClose(); 
        }
        
        setLoading(false);
    };

    if (!isOpen || !transacao) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-[80]" onClick={onClose}>
            <div className="bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-lg border border-gray-600" onClick={e => e.stopPropagation()}>
                <h2 className="text-xl font-bold mb-4 text-white">Conciliação Manual</h2>

                <div className="space-y-4">
                    <div className="bg-gray-700 p-4 rounded-md">
                        <p className="text-sm text-gray-300">Data: {formatarDataParaDisplay(transacao.data)}</p> 
                        <p className="text-sm text-gray-300">Valor: 
                            <span className={`font-bold ml-2 ${isDebito ? 'text-red-400' : 'text-green-400'}`}>
                                {formatBRLNumber(transacao.valor)}
                            </span>
                        </p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Descrição <span className="text-red-400">*</span></label>
                        <input
                            type="text"
                            value={descricao}
                            onChange={(e) => {
                                setDescricao(e.target.value);
                                if (error) setError('');
                            }}
                            className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white focus:border-orange-500 focus:outline-none"
                            placeholder="Descrição do lançamento..."
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Conta Interna <span className="text-red-400">*</span></label>
                        <select
                            value={contaBancaria}
                            onChange={(e) => setContaBancaria(e.target.value)}
                            className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white focus:border-orange-500 focus:outline-none"
                        >
                            <option value="">Selecione uma conta...</option>
                            {contasInternas.map(conta => (
                                <option key={conta.id} value={conta.contaBancaria}>
                                    {formatDisplayConta(conta.contaBancaria)}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* O SELECT DE CATEGORIA FOI REMOVIDO DAQUI */}

                    {/* --- CAMPO NATUREZA (Só aparece se for débito) --- */}
                    {isDebito && (
                        <div>
                            <label className="block text-sm font-medium text-orange-400 mb-1">Natureza (Classificação DRE) <span className="text-red-400">*</span></label>
                            <select 
                                value={natureza} 
                                onChange={(e) => setNatureza(e.target.value)}
                                className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-white focus:border-orange-500 focus:outline-none"
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
                </div>

                {error && (
                    <div className="mt-4 p-2 bg-red-900/50 border border-red-500 rounded text-sm text-red-200 text-center">
                        {error}
                    </div>
                )}

                <div className="mt-6 flex justify-end gap-4">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-500 transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={loading}
                        className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 transition-colors"
                    >
                        {loading ? 'Salvando...' : 'Confirmar'}
                    </button>
                </div>
            </div>
        </div>
    );
}