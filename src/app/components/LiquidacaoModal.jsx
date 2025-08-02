'use client';

import { useState, useEffect } from 'react';
import { formatBRLInput, parseBRL, formatBRLNumber } from '@/app/utils/formatters';

export default function LiquidacaoModal({ isOpen, onClose, onConfirm, duplicata, contasMaster }) {
    const [dataLiquidacao, setDataLiquidacao] = useState('');
    const [jurosMora, setJurosMora] = useState('');
    const [contaBancariaId, setContaBancariaId] = useState('');
    const [error, setError] = useState(''); // Novo estado para a mensagem de aviso

    // Limpa os estados sempre que o modal abre
    useEffect(() => {
        if (isOpen) {
            setDataLiquidacao(new Date().toISOString().split('T')[0]);
            setJurosMora('');
            setContaBancariaId('');
            setError('');
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleConfirmarCredito = () => {
        // Validação para garantir que uma conta foi selecionada
        if (!contaBancariaId) {
            setError('Por favor, selecione uma conta para creditar o valor.');
            return; // Interrompe a execução se não houver conta
        }
        // Se estiver tudo certo, chama a função de confirmação
        setError('');
        onConfirm(duplicata.id, dataLiquidacao, parseBRL(jurosMora), contaBancariaId);
        onClose();
    };

    const handleApenasBaixa = () => {
        setError('');
        onConfirm(duplicata.id, null, null, null);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50">
            <div className="relative bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-lg text-white">
                <h2 className="text-2xl font-bold mb-4">Confirmar Liquidação</h2>
                <p className="mb-4 text-gray-300">
                    Você está a dar baixa na duplicata <span className="font-semibold text-orange-400">{duplicata?.nfCte}</span> no valor de <span className="font-semibold text-orange-400">{formatBRLNumber(duplicata?.valorBruto)}</span>.
                </p>
                
                <div className="mb-4 bg-gray-700 p-4 rounded-md space-y-4">
                    <div>
                        <label htmlFor="dataLiquidacao" className="block text-sm font-medium text-gray-300">Data do Crédito na Conta</label>
                        <input
                            type="date"
                            id="dataLiquidacao"
                            value={dataLiquidacao}
                            onChange={(e) => setDataLiquidacao(e.target.value)}
                            className="mt-1 block w-full bg-gray-600 border-gray-500 rounded-md shadow-sm p-2"
                        />
                         <p className="text-xs text-gray-400 mt-1">Esta será a data de entrada do valor no fluxo de caixa.</p>
                    </div>
                    <div>
                        <label htmlFor="jurosMora" className="block text-sm font-medium text-gray-300">Juros / Mora (Opcional)</label>
                        <input
                            type="text"
                            id="jurosMora"
                            value={jurosMora}
                            onChange={(e) => setJurosMora(formatBRLInput(e.target.value))}
                            placeholder="R$ 0,00"
                            className="mt-1 block w-full bg-gray-600 border-gray-500 rounded-md shadow-sm p-2"
                        />
                    </div>
                    <div>
                        <label htmlFor="contaBancariaId" className="block text-sm font-medium text-gray-300">Conta para crédito</label>
                        <select
                            id="contaBancariaId"
                            value={contaBancariaId}
                            onChange={(e) => {
                                setContaBancariaId(e.target.value);
                                setError(''); // Limpa o aviso ao selecionar uma conta
                            }}
                            className="mt-1 block w-full bg-gray-600 border-gray-500 rounded-md shadow-sm p-2"
                        >
                            <option value="">Selecione uma conta...</option>
                            {contasMaster?.map(conta => (
                                <option key={conta.id} value={conta.id}>
                                    {conta.banco} - Ag. {conta.agencia} / CC {conta.contaCorrente}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
                
                {/* Exibe a mensagem de aviso aqui, se houver */}
                {error && <p className="text-red-400 text-sm text-center mb-4">{error}</p>}
                
                <div className="flex flex-col sm:flex-row justify-end gap-4">
                    <button onClick={handleApenasBaixa} className="bg-gray-600 text-gray-100 font-semibold py-2 px-4 rounded-md hover:bg-gray-500 transition">
                        Apenas Dar Baixa (Sem Crédito)
                    </button>
                    <button
                        onClick={handleConfirmarCredito}
                        className="bg-green-500 text-white font-semibold py-2 px-4 rounded-md hover:bg-green-600 transition"
                        // O botão não fica mais desabilitado
                    >
                        Confirmar e Creditar em Conta
                    </button>
                </div>
                 <button onClick={onClose} className="absolute top-3 right-3 text-gray-400 hover:text-white text-2xl">&times;</button>
            </div>
        </div>
    );
}