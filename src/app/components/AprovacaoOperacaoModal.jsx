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
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" onClick={onClose}>
            <div
                className="flex h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-3xl bg-gray-800 text-white shadow-2xl sm:max-h-[90vh] sm:rounded-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start justify-between gap-3 border-b border-gray-700 px-5 py-4 sm:px-6">
                    <div className="min-w-0">
                        <h2 className="text-xl font-bold sm:text-2xl">Análise de Operação #{operacao.id}</h2>
                        <p className="mt-1 text-sm text-gray-400">Revise a operação, ajuste os descontos e conclua a aprovação.</p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-md px-3 py-1 text-2xl font-bold leading-none text-gray-400 transition hover:text-white"
                        aria-label="Fechar modal"
                    >
                        &times;
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-6">
                    <div className="grid grid-cols-1 gap-3 rounded-2xl border border-gray-700 bg-gray-900/60 p-4 sm:grid-cols-2">
                        <div><p className="text-sm"><strong>Cliente:</strong> {operacao.cliente.nome}</p></div>
                        <div><p className="text-sm"><strong>Data:</strong> {formatDate(operacao.data_operacao)}</p></div>
                        <div><p className="text-sm"><strong>Valor Bruto:</strong> {formatBRLNumber(operacao.valor_total_bruto)}</p></div>
                        <div><p className="text-sm font-bold text-orange-400"><strong>Valor Líquido Final:</strong> {formatBRLNumber(valorLiquidoFinal)}</p></div>
                    </div>

                    <div className="mt-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-gray-300">Duplicatas da Operação</h3>
                            <span className="text-xs text-gray-500 sm:hidden">toque para revisar</span>
                        </div>

                        <div className="space-y-3 sm:hidden">
                            {operacao.duplicatas.map((dup) => (
                                <article key={dup.id} className="rounded-2xl border border-gray-700 bg-gray-900/70 p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="text-xs uppercase tracking-wide text-gray-500">NF/CT-e</p>
                                            <p className="truncate text-sm font-semibold text-white">{dup.nf_cte}</p>
                                            <p className="mt-1 truncate text-xs text-gray-400">{dup.cliente_sacado}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-xs uppercase tracking-wide text-gray-500">Bruto</p>
                                            <p className="text-sm font-semibold text-green-300">{formatBRLNumber(dup.valor_bruto)}</p>
                                        </div>
                                    </div>
                                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                                        <div className="rounded-xl bg-gray-800/80 p-3">
                                            <span className="block uppercase tracking-wide text-gray-500">Vencimento</span>
                                            <span className="mt-1 block font-semibold text-gray-100">{formatDate(dup.data_vencimento)}</span>
                                        </div>
                                        <div className="rounded-xl bg-gray-800/80 p-3">
                                            <span className="block uppercase tracking-wide text-gray-500">Juros</span>
                                            <span className="mt-1 block font-semibold text-red-400">{formatBRLNumber(dup.valor_juros)}</span>
                                        </div>
                                    </div>
                                </article>
                            ))}
                        </div>

                        <div className="hidden overflow-x-auto rounded-2xl border border-gray-700 bg-gray-900/40 sm:block">
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
                                    {operacao.duplicatas.map((dup) => (
                                        <tr key={dup.id}>
                                            <td className="whitespace-nowrap px-4 py-2">{dup.nf_cte}</td>
                                            <td className="whitespace-nowrap px-4 py-2">{dup.cliente_sacado}</td>
                                            <td className="whitespace-nowrap px-4 py-2 text-center">{formatDate(dup.data_vencimento)}</td>
                                            <td className="whitespace-nowrap px-4 py-2 text-right">{formatBRLNumber(dup.valor_bruto)}</td>
                                            <td className="whitespace-nowrap px-4 py-2 text-right text-red-400">{formatBRLNumber(dup.valor_juros)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="mt-4 rounded-2xl border border-gray-700 bg-gray-900/60 p-4">
                        <h3 className="mb-2 text-sm font-semibold text-gray-300">Descontos / Taxas Adicionais</h3>
                        {descontosAdicionais.length > 0 ? (
                            <ul className="space-y-2">
                                {descontosAdicionais.map((d) => (
                                    <li key={d.id} className={`flex items-center justify-between gap-3 rounded-xl p-3 text-sm ${d.valor < 0 ? 'bg-green-900/50' : 'bg-gray-800'}`}>
                                        <span className="min-w-0 flex-1 truncate">{d.descricao}</span>
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
                            <p className="text-sm italic text-gray-400">Nenhum desconto adicional inserido.</p>
                        )}
                        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:gap-4">
                            <button onClick={onAddDesconto} className="text-sm text-orange-400 hover:underline">
                                + Adicionar Desconto/Taxa
                            </button>
                            <button onClick={onRecompraClick} className="text-sm text-green-400 hover:underline">
                                + Recompra NF/CTe
                            </button>
                        </div>
                    </div>
                </div>

                <div className="border-t border-gray-700 px-5 py-4 sm:px-6">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div>
                            <label className="block text-sm font-medium text-gray-300">Ação</label>
                            <select value={status} onChange={(e) => setStatus(e.target.value)} className="mt-1 w-full rounded-md bg-gray-700 p-3">
                                <option value="Aprovada">Aprovar</option>
                                <option value="Rejeitada">Rejeitar</option>
                            </select>
                        </div>
                        {status === 'Aprovada' && (
                            <div>
                                <label className="block text-sm font-medium text-gray-300">Conta para Débito</label>
                                <select value={contaBancariaId} onChange={(e) => setContaBancariaId(e.target.value)} className="mt-1 w-full rounded-md bg-gray-700 p-3">
                                    <option value="">Selecione uma conta...</option>
                                    {contasBancarias.map((conta) => (
                                        <option key={conta.id} value={conta.id}>
                                            {conta.banco} - {conta.agencia}/{conta.conta_corrente}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </div>

                    {status === 'Aprovada' && (
                        <div className="pt-4 space-y-3">
                            <label className="flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={isPartialDebit}
                                    onChange={(e) => setIsPartialDebit(e.target.checked)}
                                    className="h-4 w-4 rounded border-gray-500 bg-gray-600 text-orange-500 focus:ring-orange-500"
                                />
                                <span className="ml-2 text-sm text-gray-200">Debitar Valor Parcial</span>
                            </label>

                            {(contaSelecionada?.banco?.toLowerCase().includes('inter') || contaSelecionada?.banco?.toLowerCase().includes('itaú')) && (
                                <div className="space-y-3 rounded-2xl border-l-2 border-gray-600 bg-gray-900/40 p-4">
                                    <label className="flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={efetuarPix}
                                            onChange={(e) => setEfetuarPix(e.target.checked)}
                                            className="h-4 w-4 rounded border-gray-500 bg-gray-600 text-green-500 focus:ring-green-500"
                                        />
                                        <span className="ml-2 text-sm font-semibold text-green-300">Pagar com PIX</span>
                                    </label>

                                    {efetuarPix && (
                                        <div>
                                            <label className="mb-1 block text-xs font-medium text-gray-400">Selecione a Chave PIX do Cliente</label>
                                            <select
                                                value={selectedPixAccountId}
                                                onChange={(e) => setSelectedPixAccountId(e.target.value)}
                                                className="w-full rounded-md border border-gray-600 bg-gray-700 p-3 text-sm focus:border-green-500"
                                            >
                                                <option value="">Selecione uma chave...</option>
                                                {clienteContas.map((conta) => {
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
                                                <p className="mt-1 text-xs text-yellow-500">Cliente não possui contas com PIX cadastradas.</p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {error && <p className="mt-4 text-center text-sm text-red-400">{error}</p>}

                    <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                        <button onClick={onClose} disabled={isSaving} className="w-full rounded-md bg-gray-600 px-4 py-3 font-semibold disabled:opacity-50 sm:w-auto">
                            Cancelar
                        </button>
                        <button onClick={handleConfirmClick} disabled={isSaving} className="w-full rounded-md bg-green-600 px-4 py-3 font-semibold disabled:opacity-50 sm:w-auto">
                            {isSaving ? 'Salvando...' : 'Confirmar'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
//
