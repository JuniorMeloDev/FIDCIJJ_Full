'use client';

import { useEffect, useState } from 'react';
import { formatBRLNumber } from '@/app/utils/formatters';
import PixReceiptModal from './PixReceiptModal';

export default function PixConfirmationModal({
    isOpen,
    onClose,
    data,
}) {
    const [recebedor, setRecebedor] = useState(null);
    const [loadingInfo, setLoadingInfo] = useState(false);
    const [errorInfo, setErrorInfo] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [showReceipt, setShowReceipt] = useState(false);
    const [receiptData, setReceiptData] = useState(null);

    useEffect(() => {
        if (isOpen && data?.pix?.chave) {
            consultarDadosFavorecido();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    async function consultarDadosFavorecido() {
        setLoadingInfo(true);
        setErrorInfo('');
        try {
            const resposta = await fetch('/api/inter/consultar-pix', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    dadosPix: data,
                    contaCorrente: data.contaOrigem
                }),
            });

            const resultado = await resposta.json();

            if (resposta.ok && resultado.sucesso) {
                setRecebedor({
                    nome: resultado.favorecido || 'Não informado',
                    cpfCnpj: resultado.cpfCnpj || '',
                    banco: resultado.banco || 'Não disponível',
                });
            } else {
                console.error('Erro ao consultar favorecido:', resultado.message);
                setErrorInfo('Não foi possível validar os dados do favorecido.');
            }
        } catch (error) {
            console.error('Erro na consulta do favorecido:', error);
            setErrorInfo('Erro ao consultar os dados do favorecido.');
        } finally {
            setLoadingInfo(false);
        }
    }

    async function confirmarEnvioPix() {
        setIsSending(true);
        try {
            const resposta = await fetch('/api/inter/enviar-pix', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    dadosPix: data,
                    contaCorrente: data.contaOrigem
                }),
            });

            const resultado = await resposta.json();

            if (resposta.ok) {
                // Monta dados para comprovante
                const comprovante = {
                    valor: data.valor,
                    descricao: data.descricao,
                    data: new Date(),
                    transactionId: resultado.transactionId || resultado.endToEndId || 'N/A',
                    recebedor: {
                        nome: recebedor?.nome,
                        cnpj: recebedor?.cpfCnpj,
                        instituicao: recebedor?.banco,
                        chavePix: data.pix.chave,
                    },
                    pagador: {
                        nome: data.empresaAssociada || 'Empresa',
                        conta: data.contaOrigem,
                    },
                };
                setReceiptData(comprovante);
                setShowReceipt(true);
            } else {
                alert('❌ Erro ao enviar PIX: ' + (resultado.message || 'Erro desconhecido.'));
            }
        } catch (err) {
            console.error('Erro ao enviar PIX:', err);
            alert('Erro ao enviar PIX. Tente novamente.');
        } finally {
            setIsSending(false);
        }
    }

    if (!isOpen || !data) return null;

    return (
        <>
            {/* Modal de Confirmação */}
            <div
                className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-[60]"
                onClick={onClose}
            >
                <div
                    className="bg-gray-700 p-6 rounded-lg shadow-xl w-full max-w-md text-white"
                    onClick={e => e.stopPropagation()}
                >
                    <h2 className="text-xl font-bold mb-4">Confirme os Dados do PIX</h2>

                    {loadingInfo && (
                        <p className="text-sm text-yellow-300 bg-yellow-900/40 p-2 rounded-md mb-3">
                            Consultando dados do favorecido...
                        </p>
                    )}

                    {errorInfo && (
                        <p className="text-sm text-red-300 bg-red-900/40 p-2 rounded-md mb-3">
                            {errorInfo}
                        </p>
                    )}

                    <div className="space-y-3 text-sm bg-gray-800 p-4 rounded-md">
                        <div className="flex justify-between">
                            <span className="text-gray-400">Valor a ser enviado:</span>
                            <span className="font-semibold text-lg text-orange-400">
                                {formatBRLNumber(data.valor)}
                            </span>
                        </div>

                        <div className="flex justify-between">
                            <span className="text-gray-400">Chave PIX:</span>
                            <span className="font-semibold break-all text-right">{data.pix.chave}</span>
                        </div>

                        <div className="flex justify-between">
                            <span className="text-gray-400">Tipo da Chave:</span>
                            <span className="font-semibold">{data.pix.tipo}</span>
                        </div>

                        {recebedor && (
                            <>
                                <div className="flex justify-between">
                                    <span className="text-gray-400">Favorecido:</span>
                                    <span className="font-semibold text-right">{recebedor.nome}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-400">Banco:</span>
                                    <span className="font-semibold text-right">{recebedor.banco}</span>
                                </div>
                            </>
                        )}

                        <div className="flex justify-between">
                            <span className="text-gray-400">Descrição:</span>
                            <span className="font-semibold text-right">{data.descricao}</span>
                        </div>

                        <div className="flex justify-between">
                            <span className="text-gray-400">Conta de Origem:</span>
                            <span className="font-semibold text-right">{data.contaOrigem}</span>
                        </div>
                    </div>

                    <div className="mt-6 flex justify-end gap-4">
                        <button
                            onClick={onClose}
                            disabled={isSending}
                            className="bg-gray-600 font-semibold py-2 px-4 rounded-md hover:bg-gray-500 transition disabled:opacity-50"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={confirmarEnvioPix}
                            disabled={isSending || loadingInfo}
                            className="bg-green-600 font-semibold py-2 px-4 rounded-md hover:bg-green-700 transition disabled:opacity-50"
                        >
                            {isSending ? 'Enviando...' : 'Confirmar e Pagar'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Modal de Comprovante (PixReceiptModal) */}
            <PixReceiptModal
                isOpen={showReceipt}
                onClose={() => {
                    setShowReceipt(false);
                    onClose();
                }}
                receiptData={receiptData}
            />
        </>
    );
}
