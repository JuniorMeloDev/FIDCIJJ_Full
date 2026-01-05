'use client';

import { useState, useEffect, useMemo } from 'react';
import { formatBRLNumber, formatDate } from '@/app/utils/formatters';

export default function AprovacaoOperacaoModal({
    isOpen,
    onClose,
    onConfirm,
    isSaving,
    operacao,
    contasBancarias,
    onAddDesconto,
    onRecompraClick,
    descontosAdicionais,
    setDescontosAdicionais
}) {
    const [status, setStatus] = useState('Aprovada');
    const [contaBancariaId, setContaBancariaId] = useState('');
    const [error, setError] = useState('');
    const [isPartialDebit, setIsPartialDebit] = useState(false);
    const [efetuarPix, setEfetuarPix] = useState(false);

    const [clienteContas, setClienteContas] = useState([]);
    const [selectedPixAccountId, setSelectedPixAccountId] = useState('');
    const [isLoadingContas, setIsLoadingContas] = useState(false);

    // --- CORREÇÃO ADICIONADA AQUI ---
    // Encontra o objeto completo da conta bancária selecionada com base no ID.
    const contaSelecionada = useMemo(() => {
        if (!contaBancariaId || !Array.isArray(contasBancarias)) {
            return null;
        }
        return contasBancarias.find(conta => String(conta.id) === String(contaBancariaId));
    }, [contaBancariaId, contasBancarias]);
    // --- FIM DA CORREÇÃO ---

    const valorLiquidoFinal = useMemo(() => {
        if (!operacao) return 0;
        // O cálculo agora considera que descontos são valores positivos e créditos (recompra) são negativos.
        const totalAjustes = descontosAdicionais.reduce((acc, d) => acc + d.valor, 0);
        return operacao.valor_liquido - totalAjustes;
    }, [operacao, descontosAdicionais]);

    useEffect(() => {
        if (isOpen && operacao) {
            setStatus('Aprovada');
            setContaBancariaId('');
            setIsPartialDebit(false);
            setError('');
            setEfetuarPix(false);
            setClienteContas([]);
            setSelectedPixAccountId('');

            // Busca as contas do cliente para o PIX
            if (operacao.cliente && operacao.cliente.id) {
                setIsLoadingContas(true);
                const token = sessionStorage.getItem('authToken');
                fetch(`/api/cadastros/clientes/${operacao.cliente.id}`, {
                    headers: token ? { 'Authorization': `Bearer ${token}` } : {}
                })
                    .then(res => res.json())
                    .then(data => {
                        if (data && data.contasBancarias) {
                            setClienteContas(data.contasBancarias);
                            // Tenta pré-selecionar a primeira conta com PIX
                            const contaComPix = data.contasBancarias.find(c => c.chave_pix);
                            if (contaComPix) setSelectedPixAccountId(contaComPix.id);
                        }
                    })
                    .catch(err => console.error("Erro ao buscar contas do cliente:", err))
                    .finally(() => setIsLoadingContas(false));
            }
        }
    }, [isOpen, operacao]);

    if (!isOpen || !operacao) return null;

    const handleConfirmClick = () => {
        if (status === 'Aprovada' && !contaBancariaId) {
            setError('É necessário selecionar uma conta bancária para aprovar a operação.');
            return;
        }

        if (status === 'Aprovada' && efetuarPix && !selectedPixAccountId) {
            setError('Selecione uma Chave PIX do cliente para continuar.');
            return;
        }

        setError('');

        onConfirm({
            status,
            conta_bancaria_id: status === 'Aprovada' ? parseInt(contaBancariaId, 10) : null,
            isPartialDebit: status === 'Aprovada' ? isPartialDebit : false,
            efetuar_pix: efetuarPix,
            pix_account_id: efetuarPix ? selectedPixAccountId : null // PASSA O ID DA CONTA SELECIONADA
        });
    };

    const handleRemoveDesconto = (id) => {
        setDescontosAdicionais(descontosAdicionais.filter(d => d.id !== id));
    }

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4" onClick={onClose}>
            <div className="bg-gray-800 text-white p-6 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                <h2 className="text-xl font-bold mb-4 flex-shrink-0">Análise de Operação #{operacao.id}</h2>

                <div className="flex-grow overflow-y-auto pr-2">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-700 p-4 rounded-md mb-4">
                        <div><p><strong>Cliente:</strong> {operacao.cliente.nome}</p></div>
                        <div><p><strong>Data:</strong> {formatDate(operacao.data_operacao)}</p></div>
                        <div><p><strong>Valor Bruto:</strong> {formatBRLNumber(operacao.valor_total_bruto)}</p></div>
                        <div><p className="font-bold text-orange-400"><strong>Valor Líquido Final:</strong> {formatBRLNumber(valorLiquidoFinal)}</p></div>
                    </div>

                    <div className="border-t border-gray-700 pt-4">
                        <h3 className="font-semibold mb-2">Duplicatas da Operação:</h3>
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-600 text-sm">
                                <thead className="bg-gray-700">
                                    <tr>
                                        <th className="px-4 py-2 text-left">NF/CT-e</th>
                                        <th className="px-4 py-2 text-left">Sacado</th>
                                        <th className="px-4 py-2 text-center">Vencimento</th>
                                        <th className="px-4 py-2 text-right">Valor Bruto</th>
                                        <th className="px-4 py-2 text-right">Juros (Deságio)</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-700">
                                    {operacao.duplicatas.map(dup => (
                                        <tr key={dup.id}>
                                            <td className="px-4 py-2 whitespace-nowrap">{dup.nf_cte}</td>
                                            <td className="px-4 py-2 whitespace-nowrap">{dup.cliente_sacado}</td>
                                            <td className="px-4 py-2 text-center whitespace-nowrap">{formatDate(dup.data_vencimento)}</td>
                                            <td className="px-4 py-2 text-right whitespace-nowrap">{formatBRLNumber(dup.valor_bruto)}</td>
                                            <td className="px-4 py-2 text-right text-red-400 whitespace-nowrap">{formatBRLNumber(dup.valor_juros)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="border-t border-gray-700 pt-4 mt-4">
                        <h3 className="font-semibold mb-2">Descontos / Taxas Adicionais:</h3>
                        {descontosAdicionais.length > 0 ? (
                            <ul className="space-y-2">
                                {descontosAdicionais.map(d => (
                                    <li key={d.id} className={`flex justify-between items-center p-2 rounded-md text-sm ${d.valor < 0 ? 'bg-green-900/50' : 'bg-gray-700'}`}>
                                        <span>{d.descricao}</span>
                                        <div className="flex items-center gap-3">
                                            <span className={`font-medium ${d.valor < 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                {d.valor < 0 ? `+${formatBRLNumber(Math.abs(d.valor))}` : `-${formatBRLNumber(d.valor)}`}
                                            </span>
                                            <button onClick={() => handleRemoveDesconto(d.id)} className="text-gray-500 hover:text-red-400">&times;</button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-sm text-gray-400 italic">Nenhum desconto adicional inserido.</p>
                        )}
                        <button onClick={onAddDesconto} className="text-sm text-orange-400 hover:underline mt-2">
                            + Adicionar Desconto/Taxa
                        </button>
                        <button onClick={onRecompraClick} className="text-sm text-green-400 hover:underline mt-2 ml-4">
                            + Recompra NF/CTe
                        </button>
                    </div>
                </div>

                <div className="flex-shrink-0 border-t border-gray-700 pt-4 mt-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
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
                                        <option key={conta.id} value={conta.id}>{conta.banco} - {conta.agencia}/{conta.conta_corrente}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </div>

                    {status === 'Aprovada' && (
                        <div className="pt-4 space-y-2">
                            <label className="flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={isPartialDebit}
                                    onChange={(e) => setIsPartialDebit(e.target.checked)}
                                    className="h-4 w-4 rounded text-orange-500 bg-gray-600 border-gray-500 focus:ring-orange-500"
                                />
                                <span className="ml-2 text-sm text-gray-200">Debitar Valor Parcial</span>
                            </label>

                            {(contaSelecionada?.banco.toLowerCase().includes('inter') || contaSelecionada?.banco.toLowerCase().includes('itaú')) && (
                                <div className="mt-2 space-y-2 pl-6 border-l-2 border-gray-600">
                                    <label className="flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={efetuarPix}
                                            onChange={(e) => setEfetuarPix(e.target.checked)}
                                            className="h-4 w-4 rounded text-green-500 bg-gray-600 border-gray-500 focus:ring-green-500"
                                        />
                                        <span className="ml-2 text-sm text-green-300 font-semibold">Pagar com PIX</span>
                                    </label>

                                    {efetuarPix && (
                                        <div>
                                            <label className="block text-xs font-medium text-gray-400 mb-1">Selecione a Chave PIX do Cliente</label>
                                            <select
                                                value={selectedPixAccountId}
                                                onChange={(e) => setSelectedPixAccountId(e.target.value)}
                                                className="w-full bg-gray-700 p-2 rounded text-sm border border-gray-600 focus:border-green-500"
                                            >
                                                <option value="">Selecione uma chave...</option>
                                                {clienteContas.map(conta => {
                                                    const chave = conta.chave_pix || conta.chavePix;
                                                    const tipo = conta.tipo_chave_pix || conta.tipoChavePix || 'Chave';
                                                    if (!chave) return null;
                                                    return (
                                                        <option key={conta.id} value={conta.id}>
                                                            {conta.banco} - {tipo}: {chave}
                                                        </option>
                                                    );
                                                })}
                                            </select>
                                            {clienteContas.length === 0 && !isLoadingContas && (
                                                <p className="text-xs text-yellow-500 mt-1">Cliente não possui contas com PIX cadastradas.</p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {error && <p className="text-red-400 text-sm mt-4 text-center">{error}</p>}

                    <div className="mt-6 flex justify-end gap-4">
                        <button onClick={onClose} disabled={isSaving} className="bg-gray-600 font-semibold py-2 px-4 rounded-md disabled:opacity-50">Cancelar</button>
                        <button onClick={handleConfirmClick} disabled={isSaving} className="bg-green-600 font-semibold py-2 px-4 rounded-md disabled:opacity-50">
                            {isSaving ? 'Salvando...' : 'Confirmar'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
//