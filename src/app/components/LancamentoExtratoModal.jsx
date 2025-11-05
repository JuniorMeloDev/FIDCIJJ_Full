// src/app/components/LancamentoExtratoModal.jsx
'use client';

import { useState, useEffect } from 'react';
import { formatBRLNumber, formatDisplayConta } from '@/app/utils/formatters';

export default function LancamentoExtratoModal({ isOpen, onClose, onSave, transacao, contasInternas = [] }) {
    const [descricao, setDescricao] = useState('');
    const [contaBancaria, setContaBancaria] = useState('');
    const [categoria, setCategoria] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const isDespesa = transacao?.valor < 0;

    // Categorias com base no seu LancamentoModal.jsx original
    const categoriasOpcoes = isDespesa 
        ? ["Despesa Avulsa", "Pagamento PIX", "Tarifa Bancária", "Impostos"]
        : ["Receita Avulsa", "Crédito PIX", "Outras Entradas"];

    useEffect(() => {
        if (isOpen && transacao) {
            // Preenche o formulário com os dados da transação
            setDescricao(transacao.descricao);
            setCategoria(isDespesa ? 'Despesa Avulsa' : 'Receita Avulsa');
            setContaBancaria(''); // Força o usuário a escolher
            setError('');
        } else {
            setLoading(false);
        }
    }, [isOpen, transacao, isDespesa]);

    const handleSave = async () => {
        if (!contaBancaria) {
            setError('Por favor, selecione a conta interna.');
            return;
        }
        if (!categoria) {
            setError('Por favor, selecione uma categoria.');
            return;
        }

        setLoading(true);
        setError('');

        const payload = {
            dataMovimento: transacao.data, // Usa a data do extrato
            descricao: descricao,
            valor: transacao.valor, // Já está positivo ou negativo
            contaBancaria: contaBancaria,
            categoria: categoria,
            // Adiciona o transaction_id para marcar como conciliado
            transaction_id: transacao.id, 
        };

        // A função 'onSave' é a 'handleSaveLancamento' da página de fluxo de caixa
        const success = await onSave(payload); 
        
        setLoading(false);
        if (success) {
            onClose();
        } else {
            setError('Falha ao salvar o lançamento. Verifique o console.');
        }
    };

    if (!isOpen || !transacao) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-[70] p-4" onClick={onClose}>
            <div className="bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-lg text-white flex flex-col" onClick={(e) => e.stopPropagation()}>
                <h2 className="text-xl font-bold mb-4">Lançamento Manual do Extrato</h2>
                
                <div className="bg-gray-700 p-3 rounded-md mb-4 grid grid-cols-3 gap-4 text-sm">
                    <div><strong>Data:</strong> {formatDate(transacao.data)}</div>
                    <div className="col-span-2 text-right">
                        <strong>Valor:</strong> 
                        <span className={`font-bold ml-2 ${isDespesa ? 'text-red-400' : 'text-green-400'}`}>
                            {formatBRLNumber(transacao.valor)}
                        </span>
                    </div>
                </div>

                <div className="space-y-4">
                    <div>
                        <label htmlFor="descricao" className="block text-sm font-semibold text-gray-300 mb-1">
                            Descrição
                        </label>
                        <input
                            id="descricao"
                            type="text"
                            value={descricao}
                            onChange={(e) => setDescricao(e.target.value)}
                            className="w-full bg-gray-700 border border-gray-600 rounded-md shadow-sm text-sm p-2 text-white"
                        />
                    </div>
                    
                    <div>
                        <label htmlFor="contaBancaria" className="block text-sm font-semibold text-gray-300 mb-1">
                            Lançar na Conta Interna
                        </label>
                        <select
                            id="contaBancaria"
                            value={contaBancaria}
                            onChange={(e) => setContaBancaria(e.target.value)}
                            className="w-full bg-gray-700 border border-gray-600 rounded-md shadow-sm text-sm p-2 text-white"
                        >
                            <option value="">-- Selecione a conta --</option>
                            {contasInternas.map((conta) => (
                                <option key={conta.contaBancaria} value={conta.contaBancaria}>
                                    {formatDisplayConta(conta.contaBancaria)}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label htmlFor="categoria" className="block text-sm font-semibold text-gray-300 mb-1">
                            Categoria (para Resumo)
                        </label>
                        <select
                            id="categoria"
                            value={categoria}
                            onChange={(e) => setCategoria(e.target.value)}
                            className="w-full bg-gray-700 border border-gray-600 rounded-md shadow-sm text-sm p-2 text-white"
                        >
                            {categoriasOpcoes.map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                            ))}
                        </select>
                    </div>
                </div>
                
                {error && <p className="text-red-400 text-sm mt-3 text-center">{error}</p>}

                <div className="mt-6 flex justify-end gap-4">
                    <button onClick={onClose} className="bg-gray-600 font-semibold py-2 px-4 rounded-md hover:bg-gray-500">Cancelar</button>
                    <button onClick={handleSave} disabled={loading} className="bg-green-600 font-semibold py-2 px-4 rounded-md hover:bg-green-700 disabled:opacity-50">
                        {loading ? 'Salvando...' : 'Confirmar Lançamento'}
                    </button>
                </div>
            </div>
        </div>
    );
}// src/app/components/LancamentoExtratoModal.jsx
'use client';

import { useState, useEffect } from 'react';
import { formatBRLNumber, formatDisplayConta } from '@/app/utils/formatters';

export default function LancamentoExtratoModal({ isOpen, onClose, onSave, transacao, contasInternas = [] }) {
    const [descricao, setDescricao] = useState('');
    const [contaBancaria, setContaBancaria] = useState('');
    const [categoria, setCategoria] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const isDespesa = transacao?.valor < 0;

    // Categorias com base no seu LancamentoModal.jsx original
    const categoriasOpcoes = isDespesa 
        ? ["Despesa Avulsa", "Pagamento PIX", "Tarifa Bancária", "Impostos"]
        : ["Receita Avulsa", "Crédito PIX", "Outras Entradas"];

    useEffect(() => {
        if (isOpen && transacao) {
            // Preenche o formulário com os dados da transação
            setDescricao(transacao.descricao);
            setCategoria(isDespesa ? 'Despesa Avulsa' : 'Receita Avulsa');
            setContaBancaria(''); // Força o usuário a escolher
            setError('');
        } else {
            setLoading(false);
        }
    }, [isOpen, transacao, isDespesa]);

    const handleSave = async () => {
        if (!contaBancaria) {
            setError('Por favor, selecione a conta interna.');
            return;
        }
        if (!categoria) {
            setError('Por favor, selecione uma categoria.');
            return;
        }

        setLoading(true);
        setError('');

        const payload = {
            dataMovimento: transacao.data, // Usa a data do extrato
            descricao: descricao,
            valor: transacao.valor, // Já está positivo ou negativo
            contaBancaria: contaBancaria,
            categoria: categoria,
            // Adiciona o transaction_id para marcar como conciliado
            transaction_id: transacao.id, 
        };

        // A função 'onSave' é a 'handleSaveLancamento' da página de fluxo de caixa
        const success = await onSave(payload); 
        
        setLoading(false);
        if (success) {
            onClose();
        } else {
            setError('Falha ao salvar o lançamento. Verifique o console.');
        }
    };

    if (!isOpen || !transacao) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-[70] p-4" onClick={onClose}>
            <div className="bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-lg text-white flex flex-col" onClick={(e) => e.stopPropagation()}>
                <h2 className="text-xl font-bold mb-4">Lançamento Manual do Extrato</h2>
                
                <div className="bg-gray-700 p-3 rounded-md mb-4 grid grid-cols-3 gap-4 text-sm">
                    <div><strong>Data:</strong> {formatDate(transacao.data)}</div>
                    <div className="col-span-2 text-right">
                        <strong>Valor:</strong> 
                        <span className={`font-bold ml-2 ${isDespesa ? 'text-red-400' : 'text-green-400'}`}>
                            {formatBRLNumber(transacao.valor)}
                        </span>
                    </div>
                </div>

                <div className="space-y-4">
                    <div>
                        <label htmlFor="descricao" className="block text-sm font-semibold text-gray-300 mb-1">
                            Descrição
                        </label>
                        <input
                            id="descricao"
                            type="text"
                            value={descricao}
                            onChange={(e) => setDescricao(e.target.value)}
                            className="w-full bg-gray-700 border border-gray-600 rounded-md shadow-sm text-sm p-2 text-white"
                        />
                    </div>
                    
                    <div>
                        <label htmlFor="contaBancaria" className="block text-sm font-semibold text-gray-300 mb-1">
                            Lançar na Conta Interna
                        </label>
                        <select
                            id="contaBancaria"
                            value={contaBancaria}
                            onChange={(e) => setContaBancaria(e.target.value)}
                            className="w-full bg-gray-700 border border-gray-600 rounded-md shadow-sm text-sm p-2 text-white"
                        >
                            <option value="">-- Selecione a conta --</option>
                            {contasInternas.map((conta) => (
                                <option key={conta.contaBancaria} value={conta.contaBancaria}>
                                    {formatDisplayConta(conta.contaBancaria)}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label htmlFor="categoria" className="block text-sm font-semibold text-gray-300 mb-1">
                            Categoria (para Resumo)
                        </label>
                        <select
                            id="categoria"
                            value={categoria}
                            onChange={(e) => setCategoria(e.target.value)}
                            className="w-full bg-gray-700 border border-gray-600 rounded-md shadow-sm text-sm p-2 text-white"
                        >
                            {categoriasOpcoes.map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                            ))}
                        </select>
                    </div>
                </div>
                
                {error && <p className="text-red-400 text-sm mt-3 text-center">{error}</p>}

                <div className="mt-6 flex justify-end gap-4">
                    <button onClick={onClose} className="bg-gray-600 font-semibold py-2 px-4 rounded-md hover:bg-gray-500">Cancelar</button>
                    <button onClick={handleSave} disabled={loading} className="bg-green-600 font-semibold py-2 px-4 rounded-md hover:bg-green-700 disabled:opacity-50">
                        {loading ? 'Salvando...' : 'Confirmar Lançamento'}
                    </button>
                </div>
            </div>
        </div>
    );
}