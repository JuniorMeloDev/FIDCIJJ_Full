'use client';

import { useState, useEffect, useMemo } from 'react';
import { formatBRLInput, parseBRL, formatBRLNumber } from '@/app/utils/formatters';

export default function LiquidacaoModal({ isOpen, onClose, onConfirm, duplicata, contasMaster }) {
    const [dataLiquidacao, setDataLiquidacao] = useState('');
    const [jurosMora, setJurosMora] = useState('');
    const [contaBancariaId, setContaBancariaId] = useState('');
    const [error, setError] = useState('');

    const isMultiple = Array.isArray(duplicata);

    // Lógica corrigida para calcular o valor total a ser exibido e creditado
    const totalValue = useMemo(() => {
        if (!duplicata) return 0;
        const items = isMultiple ? duplicata : [duplicata];

        return items.reduce((sum, d) => {
            const op = d.operacao;
            // Se não encontrar dados da operação, retorna o valor bruto como fallback
            if (!op) return sum + d.valorBruto;

            // A condição definitiva: se o juro total da operação é praticamente zero, mas o juro individual da duplicata não é,
            // significa que o juro não foi descontado na operação e deve ser somado agora.
            const jurosNaoDescontados = op.valor_total_juros < 0.01 && d.valorJuros > 0;
            return sum + (jurosNaoDescontados ? d.valorBruto + d.valorJuros : d.valorBruto);
        }, 0);
    }, [duplicata, isMultiple]);

    const firstNfCte = isMultiple ? duplicata[0]?.nfCte : duplicata?.nfCte;

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
        if (!contaBancariaId) {
            setError('Por favor, selecione uma conta para creditar o valor.');
            return;
        }
        setError('');
        
        // Prepara o payload para a API, determinando se os juros da operação devem ser somados
        const liquidacoes = duplicata.map(dup => {
            const op = dup.operacao;
            const jurosNaoDescontados = op && op.valor_total_juros < 0.01 && dup.valorJuros > 0;
            return {
                id: dup.id,
                juros_a_somar: jurosNaoDescontados ? dup.valorJuros : 0
            };
        });

        onConfirm(liquidacoes, dataLiquidacao, parseBRL(jurosMora), contaBancariaId);
        onClose();
    };

    const handleApenasBaixa = () => {
        setError('');
        const liquidacoes = duplicata.map(d => ({ id: d.id, juros_a_somar: 0 }));
        onConfirm(liquidacoes, null, null, null);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50">
            <div className="relative bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-lg text-white">
                <h2 className="text-2xl font-bold mb-4">Confirmar Liquidação</h2>
                <p className="mb-4 text-gray-300">
                    {isMultiple
                        ? <>Você está prestes a dar baixa em <span className="font-semibold text-orange-400">{duplicata.length} duplicatas</span>, somando o valor de <span className="font-semibold text-orange-400">{formatBRLNumber(totalValue)}</span>.</>
                        : <>Você está a dar baixa na duplicata <span className="font-semibold text-orange-400">{firstNfCte}</span> no valor de <span className="font-semibold text-orange-400">{formatBRLNumber(totalValue)}</span>.</>
                    }
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
                                setError('');
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
                
                {error && <p className="text-red-400 text-sm text-center mb-4">{error}</p>}
                
                <div className="flex flex-col sm:flex-row justify-end gap-4">
                    <button onClick={handleApenasBaixa} className="bg-gray-600 text-gray-100 font-semibold py-2 px-4 rounded-md hover:bg-gray-500 transition">
                        Apenas Dar Baixa (Sem Crédito)
                    </button>
                    <button
                        onClick={handleConfirmarCredito}
                        className="bg-green-500 text-white font-semibold py-2 px-4 rounded-md hover:bg-green-600 transition"
                    >
                        Confirmar e Creditar em Conta
                    </button>
                </div>
                 <button onClick={onClose} className="absolute top-3 right-3 text-gray-400 hover:text-white text-2xl">&times;</button>
            </div>
        </div>
    );
}