'use client';

import { useEffect, useState, useMemo } from 'react';
import { formatBRLNumber } from '@/app/utils/formatters';
import PixReceiptModal from './PixReceiptModal';

export default function PixConfirmationModal({
    isOpen,
    onClose,
    onConfirm,
    data,
    isSending,
}) {
    const [recebedor, setRecebedor] = useState(null);
    const [loadingInfo, setLoadingInfo] = useState(false);
    const [errorInfo, setErrorInfo] = useState('');
    const [showReceipt, setShowReceipt] = useState(false);
    const [receiptData, setReceiptData] = useState(null);

    const [chave, tipoChave] = useMemo(() => {
        if (!data) return [null, null];
        
        // Tenta o formato aninhado (preferencial)
        if (data.destinatario?.chave) {
            return [data.destinatario.chave, data.destinatario.tipo];
        }
        
        // Tenta o formato "flat" (o que está acontecendo agora)
        if (data.chavePix) {
            return [data.chavePix, data.tipoChave];
        }
        
        return [null, null]; // Nenhum dado encontrado

    }, [data]);

    useEffect(() => {
        if (isOpen && chave) {
            consultarDadosFavorecido();
        } else if (!isOpen) {
            setRecebedor(null);
            setErrorInfo('');
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, chave]); 

    async function consultarDadosFavorecido() {
        setLoadingInfo(true);
        setErrorInfo('');
        try {
            const payloadParaConsulta = {
                valor: data.valor, 
                destinatario: {
                    tipo: "CHAVE", 
                    chave: chave,
                },
                dataPagamento: new Date().toISOString().split('T')[0],
                descricao: data.descricao
            };

            const resposta = await fetch('/api/inter/consultar-pix', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionStorage.getItem('authToken')}` }, 
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

    if (!isOpen || !data) return null;

    return (
        <>
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
                            <span className="font-semibold break-all text-right">{chave || 'Não informado'}</span>
                        </div>

                        <div className="flex justify-between">
                            <span className="text-gray-400">Tipo da Chave:</span>
                            <span className="font-semibold">{tipoChave || 'Não informado'}</span>
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
                        
                        {/* --- INÍCIO DA CORREÇÃO --- */}
                        {/* Removido o '!!errorInfo' da lógica de 'disabled' */}
                        <button
                            onClick={onConfirm}
                            disabled={isSending || loadingInfo}
                            className="bg-green-600 font-semibold py-2 px-4 rounded-md hover:bg-green-700 transition disabled:opacity-50"
                        >
                            {isSending ? 'Enviando...' : 'Confirmar e Pagar'}
                        </button>
                        {/* --- FIM DA CORREÇÃO --- */}

                    </div>
                </div>
            </div>

            <PixReceiptModal
                isOpen={showReceipt}
                onClose={() => { setShowReceipt(false); onClose(); }}
                receiptData={receiptData}
            />
        </>
    );
}