'use client';

import { useMemo } from 'react';
import { formatBRLNumber } from '@/app/utils/formatters';

export default function OperacaoDetalhes({
    notasFiscais,
    descontos,
    totais,
    handleSalvarOperacao,
    handleLimparTudo,
    isSaving,
    onAddDescontoClick,
    onRemoveDesconto,
    contasBancarias,
    contaBancariaId,
    setContaBancariaId,
    cedenteRamo,
    isPartialDebit,
    setIsPartialDebit,
    jurosPre,
    setjurosPre,
    isPagarComPix,
    setIsPagarComPix,
    pixData,
    setPixData,
    cedenteSelecionado // <-- Nova Prop
}) {
    const docType = cedenteRamo === 'Transportes' ? 'CT-e' : 'NF-e';

    const contaSelecionada = contasBancarias.find(c => String(c.id) === String(contaBancariaId));
    const isContaInter = contaSelecionada?.banco.toLowerCase().includes('inter');
    
    // --- LÓGICA PARA EXTRAIR AS CHAVES PIX DO CLIENTE ---
    const chavesPixDisponiveis = useMemo(() => {
        if (!cedenteSelecionado || !Array.isArray(cedenteSelecionado.contasBancarias)) {
            return [];
        }
        return cedenteSelecionado.contasBancarias
            .filter(conta => conta.chave_pix)
            .map(conta => ({
                label: `${conta.tipo_chave_pix}: ${conta.chave_pix}`,
                value: conta.chave_pix,
                type: conta.tipo_chave_pix
            }));
    }, [cedenteSelecionado]);


    return (
        <section className="bg-gray-800 p-4 rounded-lg shadow-md mt-4">
            <h2 className="text-2xl font-semibold mb-4 text-gray-100">Duplicatas da Operação</h2>

            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-700">
                    <thead className="bg-gray-700">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">{docType}</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Cliente</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">Valor Bruto</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">Deságio (Juros)</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">Valor Líquido</th>
                        </tr>
                    </thead>
                    <tbody className="bg-gray-800 divide-y divide-gray-700">
                        {notasFiscais.map((nf) => (
                            <tr key={nf.id}>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-100">{nf.nfCte}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{nf.clienteSacado}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400 text-right">{formatBRLNumber(nf.valorNf)}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-red-400 text-right">-{formatBRLNumber(nf.jurosCalculado || 0)}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400 text-right">
                                    {formatBRLNumber(jurosPre ? (nf.valorLiquidoCalculado || nf.valorNf) : nf.valorNf)}
                                </td>
                            </tr>
                        ))}
                        {notasFiscais.length === 0 && (
                            <tr>
                                <td colSpan="5" className="text-center py-10 text-gray-400">Nenhuma duplicata adicionada a esta operação.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
                <div className="md:col-span-2 space-y-3">
                    <h3 className="text-lg font-semibold text-gray-200">Outros Descontos / Taxas</h3>
                    {descontos.length > 0 ? (
                        <ul className="border border-gray-700 rounded-md divide-y divide-gray-700">
                            {descontos.map(d => (
                                <li key={d.id} className="p-3 flex justify-between items-center text-sm">
                                    <span className="text-gray-300">{d.descricao}</span>
                                    <div className="flex items-center gap-3">
                                        <span className="font-medium text-red-400">-{formatBRLNumber(d.valor)}</span>
                                        <button onClick={() => onRemoveDesconto(d.id)} className="text-gray-500 hover:text-red-400">&times;</button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-sm text-gray-400 italic">Nenhum desconto adicionado.</p>
                    )}
                    <button onClick={onAddDescontoClick} type="button" className="text-sm font-medium text-orange-400 hover:text-orange-500 transition">
                        + Adicionar Desconto/Taxa
                    </button>
                </div>

                <div className="bg-gray-700 p-4 rounded-lg space-y-3">
                    <div className="flex justify-between text-sm font-medium text-gray-300">
                        <span>Valor Total dos Títulos:</span>
                        <span>{formatBRLNumber(totais.valorTotalBruto)}</span>
                    </div>
                    <div className="flex justify-between text-sm font-medium text-red-400">
                        <span>{jurosPre ? '(-) Deságio Total:' : 'Deságio Total:'}</span>
                        <span>{jurosPre ? '-' : ''}{formatBRLNumber(totais.desagioTotal)}</span>
                    </div>
                    <div className="flex justify-between text-sm font-medium text-red-400">
                        <span>(-) Outros Descontos:</span>
                        <span>-{formatBRLNumber(totais.totalOutrosDescontos)}</span>
                    </div>
                    <hr className="border-gray-600"/>
                    <div className="flex justify-between text-lg font-bold text-gray-100">
                        <span>Líquido da Operação:</span>
                        <span className="text-orange-400">{formatBRLNumber(totais.liquidoOperacao)}</span>
                    </div>

                    <div className="flex flex-col gap-2 pt-2">
                        <label htmlFor="contaBancaria" className="text-sm font-medium text-gray-300">Conta Bancária para Débito:</label>
                        <select
                            id="contaBancaria"
                            name="contaBancaria"
                            value={contaBancariaId}
                            onChange={e => setContaBancariaId(e.target.value)}
                            className="p-2 bg-gray-600 border-gray-500 rounded-md text-white"
                        >
                            <option value="">Selecione uma conta</option>
                            {contasBancarias.map(conta => (
                                <option key={conta.id} value={conta.id}>
                                    {conta.banco} - {conta.agencia}/{conta.contaCorrente}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="pt-2 space-y-2">
                        <label className="flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={isPartialDebit}
                                onChange={(e) => setIsPartialDebit(e.target.checked)}
                                className="h-4 w-4 rounded text-orange-500 bg-gray-600 border-gray-500 focus:ring-orange-500"
                            />
                            <span className="ml-2 text-sm text-gray-200">Debitar Valor Parcial</span>
                        </label>
                         <label className="flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={jurosPre}
                                onChange={(e) => setjurosPre(e.target.checked)}
                                className="h-4 w-4 rounded text-orange-500 bg-gray-600 border-gray-500 focus:ring-orange-500"
                            />
                            <span className="ml-2 text-sm text-gray-200">Juros Pré</span>
                        </label>
                        {isContaInter && (
                          <label className="flex items-center cursor-pointer pt-2 border-t border-gray-600 mt-2">
                            <input
                              type="checkbox"
                              checked={isPagarComPix}
                              onChange={(e) => setIsPagarComPix(e.target.checked)}
                              className="h-4 w-4 rounded text-green-500 bg-gray-600 border-gray-500 focus:ring-green-500"
                            />
                            <span className="ml-2 text-sm font-semibold text-green-300">Pagar com PIX</span>
                          </label>
                        )}
                    </div>
                    {isPagarComPix && isContaInter && (
                        <div className="space-y-2 pt-2 border-t border-gray-600">
                            <label className="text-xs font-bold text-gray-300">Chave PIX do Favorecido</label>
                            {chavesPixDisponiveis.length > 0 ? (
                                <select 
                                    value={pixData.chave} 
                                    onChange={e => {
                                        const chaveSelecionada = chavesPixDisponiveis.find(c => c.value === e.target.value);
                                        setPixData({
                                            chave: e.target.value,
                                            tipo_chave_pix: chaveSelecionada ? chaveSelecionada.type : ''
                                        });
                                    }}
                                    className="mt-1 block w-full bg-gray-600 p-1.5 rounded text-sm"
                                >
                                    <option value="">Selecione uma chave...</option>
                                    {chavesPixDisponiveis.map(chave => (
                                        <option key={chave.value} value={chave.value}>{chave.label}</option>
                                    ))}
                                </select>
                            ) : (
                                <p className="text-xs text-yellow-400 mt-1">Nenhuma chave PIX cadastrada para este cliente.</p>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <div className="mt-8 flex justify-end gap-4">
                <button type="button" onClick={handleLimparTudo} className="bg-gray-600 text-gray-100 font-semibold py-2 px-6 rounded-md hover:bg-gray-500 transition">
                    Limpar
                </button>
                <button
                    type="button"
                    onClick={handleSalvarOperacao}
                    disabled={isSaving}
                    className="bg-green-500 text-white font-semibold py-2 px-6 rounded-md shadow-sm hover:bg-green-600 transition disabled:bg-green-400"
                >
                    {isSaving ? 'Salvando...' : 'Salvar Operação'}
                </button>
            </div>
        </section>
    );
}