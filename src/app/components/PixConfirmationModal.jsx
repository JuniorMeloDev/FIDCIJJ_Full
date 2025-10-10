'use client';

import { useEffect, useState } from 'react';
import { formatBRLNumber } from '@/app/utils/formatters';
import PixReceiptModal from './PixReceiptModal';

export default function PixConfirmationModal({
    isOpen,
    onClose,
    onConfirm, // Esta prop será usada para o fluxo principal
    data,
    isSending: isSendingProp // Renomeado para evitar conflito
}) {
    const [recebedor, setRecebedor] = useState(null);
    const [loadingInfo, setLoadingInfo] = useState(false);
    const [errorInfo, setErrorInfo] = useState('');
    const [isSendingPix, setIsSendingPix] = useState(false); // State interno para o envio
    const [showReceipt, setShowReceipt] = useState(false);
    const [receiptData, setReceiptData] = useState(null);

    // Reseta o estado quando o modal é fechado
    useEffect(() => {
        if (!isOpen) {
            setRecebedor(null);
            setErrorInfo('');
            setShowReceipt(false);
            setReceiptData(null);
        }
    }, [isOpen]);
    
    // Busca os dados do favorecido quando o modal abre
    useEffect(() => {
        if (isOpen && data?.destinatario?.chave) {
            consultarDadosFavorecido();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, data]);

    async function consultarDadosFavorecido() {
        setLoadingInfo(true);
        setErrorInfo('');
        try {
            // A API de consulta agora recebe o payload no formato correto
            const payloadParaConsulta = {
                valor: data.destinatario.valor,
                destinatario: {
                    tipo: data.destinatario.tipo,
                    chave: data.destinatario.chave
                }
            };
            
            const resposta = await fetch('/api/inter/consultar-pix', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    dadosPix: payloadParaConsulta,
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
                setErrorInfo(resultado.message || 'Não foi possível validar os dados do favorecido.');
            }
        } catch (error) {
            setErrorInfo('Erro de comunicação ao consultar os dados do favorecido.');
        } finally {
            setLoadingInfo(false);
        }
    }

    async function handleConfirmarEEnviar() {
        setIsSendingPix(true);
        // Chama a função onConfirm passada pelo pai, que agora vai cuidar da lógica de envio
        await onConfirm();
        // A lógica de sucesso (mostrar recibo) será acionada pelo componente pai se necessário,
        // mas podemos manter uma aqui para o caso de uso geral.
    }


    if (!isOpen || !data) return null;

    // Se o modal de recibo estiver aberto, não renderiza o de confirmação
    if (showReceipt) {
        return (
             <PixReceiptModal
                isOpen={showReceipt}
                onClose={() => {
                    setShowReceipt(false);
                    onClose(); // Fecha o modal principal também
                }}
                receiptData={receiptData}
            />
        );
    }
    
    return (
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
                    {/* CORREÇÃO APLICADA AQUI */}
                    <div className="flex justify-between">
                        <span className="text-gray-400">Valor a ser enviado:</span>
                        <span className="font-semibold text-lg text-orange-400">
                            {formatBRLNumber(data.destinatario.valor)}
                        </span>
                    </div>

                    <div className="flex justify-between">
                        <span className="text-gray-400">Chave PIX:</span>
                        <span className="font-semibold break-all text-right">{data.destinatario.chave}</span>
                    </div>

                    <div className="flex justify-between">
                        <span className="text-gray-400">Tipo da Chave:</span>
                        <span className="font-semibold">{data.destinatario.tipo}</span>
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
                    {/* FIM DA CORREÇÃO */}

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
                        disabled={isSendingPix || isSendingProp}
                        className="bg-gray-600 font-semibold py-2 px-4 rounded-md hover:bg-gray-500 transition disabled:opacity-50"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleConfirmarEEnviar}
                        disabled={isSendingPix || isSendingProp || loadingInfo || errorInfo}
                        className="bg-green-600 font-semibold py-2 px-4 rounded-md hover:bg-green-700 transition disabled:opacity-50"
                    >
                        {isSendingPix || isSendingProp ? 'Enviando...' : 'Confirmar e Pagar'}
                    </button>
                </div>
            </div>
        </div>
    );
}