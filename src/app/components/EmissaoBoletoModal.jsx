'use client';

import { useState, useEffect } from 'react';
import { formatBRLNumber, formatDate } from '@/app/utils/formatters';

export default function EmissaoBoletoModal({ isOpen, onClose, duplicatas, showNotification }) {
    const [bancoSelecionado, setBancoSelecionado] = useState('bradesco');
    const [isLoading, setIsLoading] = useState(false);
    const [resultados, setResultados] = useState([]);

    useEffect(() => {
        if (isOpen) {
            setResultados([]);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const getAuthHeader = () => {
        const token = sessionStorage.getItem('authToken');
        return token ? { 'Authorization': `Bearer ${token}` } : {};
    };

    const handleEmitirBoletos = async () => {
        setIsLoading(true);
        setResultados([]);
        const operacaoId = duplicatas[0]?.operacaoId;
        showNotification(`Iniciando emissão de ${duplicatas.length} boleto(s) para a operação #${operacaoId}...`, 'info');

        const resultadosEmissao = [];

        for (const duplicata of duplicatas) {
            try {
                // 1. Obter os dados formatados para o banco selecionado
                const dadosResponse = await fetch(`/api/dados-boleto/${bancoSelecionado}/${duplicata.id}`, {
                    headers: getAuthHeader(),
                });

                if (!dadosResponse.ok) {
                    const errorData = await dadosResponse.json();
                    throw new Error(errorData.message || `Falha ao buscar dados do boleto para a duplicata ${duplicata.nfCte}.`);
                }
                const dadosParaBoleto = await dadosResponse.json();

                // 2. Chamar a API de registro do banco
                const registroResponse = await fetch(`/api/${bancoSelecionado}/registrar-boleto`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
                    body: JSON.stringify(dadosParaBoleto),
                });

                if (!registroResponse.ok) {
                    const errorData = await registroResponse.json();
                    throw new Error(errorData.message || `Falha ao registrar boleto para a duplicata ${duplicata.nfCte}.`);
                }

                const boletoGerado = await registroResponse.json();
                resultadosEmissao.push({
                    nfCte: duplicata.nfCte,
                    success: true,
                    linhaDigitavel: boletoGerado.data?.codigoBarras || boletoGerado.linhaDigitavel || 'Disponível no banco',
                });

            } catch (err) {
                resultadosEmissao.push({
                    nfCte: duplicata.nfCte,
                    success: false,
                    error: err.message,
                });
            }
        }
        setResultados(resultadosEmissao);
        setIsLoading(false);
        showNotification('Processo de emissão finalizado.', 'success');
    };

    const operacaoId = duplicatas[0]?.operacaoId;
    const cedente = duplicatas[0]?.empresaCedente;
    const sacado = duplicatas[0]?.clienteSacado;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4">
            <div className="bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-2xl text-white">
                <h2 className="text-2xl font-bold mb-4">Emissão de Boletos - Operação #{operacaoId}</h2>
                
                {resultados.length === 0 ? (
                    <>
                        <div className="bg-gray-700 p-4 rounded-md space-y-3 mb-6">
                            <p><strong>Cedente:</strong> {cedente}</p>
                            <p><strong>Sacado:</strong> {sacado}</p>
                            <p><strong>Boletos a serem emitidos:</strong> {duplicatas.length}</p>
                            <ul className="list-disc list-inside pl-4 text-sm text-gray-300">
                                {duplicatas.map(dup => (
                                    <li key={dup.id}>
                                        {dup.nfCte} - Venc: {formatDate(dup.dataVencimento)} - Valor: {formatBRLNumber(dup.valorBruto)}
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <div>
                            <label htmlFor="banco" className="block text-sm font-medium text-gray-300 mb-2">Selecione o banco para a emissão:</label>
                            <select
                                id="banco"
                                value={bancoSelecionado}
                                onChange={(e) => setBancoSelecionado(e.target.value)}
                                className="w-full bg-gray-600 border-gray-500 rounded-md shadow-sm p-2"
                            >
                                <option value="bradesco">Bradesco</option>
                                <option value="safra">Safra</option>
                            </select>
                        </div>

                        <div className="mt-6 flex justify-end gap-4">
                            <button onClick={onClose} disabled={isLoading} className="bg-gray-600 text-gray-100 font-semibold py-2 px-4 rounded-md hover:bg-gray-500 transition disabled:opacity-50">
                                Cancelar
                            </button>
                            <button onClick={handleEmitirBoletos} disabled={isLoading} className="bg-orange-500 text-white font-semibold py-2 px-4 rounded-md hover:bg-orange-600 transition disabled:opacity-50">
                                {isLoading ? `Emitindo ${duplicatas.length} boleto(s)...` : 'Confirmar Emissão'}
                            </button>
                        </div>
                    </>
                ) : (
                    <div>
                        <h3 className="text-lg font-semibold mb-4">Resultados da Emissão:</h3>
                        <div className="space-y-2 max-h-60 overflow-y-auto">
                            {resultados.map((res, index) => (
                                <div key={index} className={`p-2 rounded-md ${res.success ? 'bg-green-900/50' : 'bg-red-900/50'}`}>
                                    <p className="font-bold">{res.nfCte}</p>
                                    {res.success ? (
                                        <p className="text-sm text-green-300">Sucesso! Linha Digitável: {res.linhaDigitavel}</p>
                                    ) : (
                                        <p className="text-sm text-red-300">Erro: {res.error}</p>
                                    )}
                                </div>
                            ))}
                        </div>
                        <div className="mt-6 flex justify-end">
                            <button onClick={onClose} className="bg-gray-600 text-gray-100 font-semibold py-2 px-4 rounded-md hover:bg-gray-500 transition">
                                Fechar
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}