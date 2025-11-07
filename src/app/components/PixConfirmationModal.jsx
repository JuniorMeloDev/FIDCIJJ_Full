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
        
        // Tenta o formato aninhado (usado em outros lugares)
        if (data.destinatario?.chave) {
            return [data.destinatario.chave, data.destinatario.tipo];
        }
        
        // Tenta o formato "flat" (enviado pelo operacao-bordero)
        if (data.chave) {
            return [data.chave, data.tipo_chave_pix]; // <-- CORRIGIDO AQUI
        }
        
        // Fallback para o nome antigo (para não quebrar outros lugares)
        if (data.chavePix) {
            return [data.chavePix, data.tipoChave];
        }
        
        return [null, null]; // Nenhum dado encontrado

    }, [data]);
    // --- FIM DA CORREÇÃO ---

    useEffect(() => {
        if (isOpen && chave) {
            // Se tivéssemos uma API de consulta, chamaríamos aqui
            // consultarDadosFavorecido();
        } else if (!isOpen) {
            setLoadingInfo(false);
            setErrorInfo('');
            setRecebedor(null);
        }
    }, [isOpen, chave]);

    // Função de simulação (remover se tiver API real)
    const consultarDadosFavorecido = async () => {
        setLoadingInfo(true);
        setErrorInfo('');
        // Simula uma chamada de API
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        if (data.favorecido) {
             setRecebedor({ nome: data.favorecido, documento: '***.123.456-**' });
        } else {
            setErrorInfo("Não foi possível validar a chave PIX.");
        }
        setLoadingInfo(false);
    };


    if (!isOpen) return null;
    if (!data) return null;

    return (
        <>
            <div className="fixed inset-0 bg-black bg-opacity-75 z-50 flex justify-center items-center p-4">
                <div className="bg-gray-800 text-white rounded-lg shadow-xl max-w-md w-full p-6">
                    <h2 className="text-2xl font-bold mb-4 text-green-400">Confirmar Pagamento PIX</h2>
                    <p className="text-gray-300 mb-6">Por favor, revise os dados antes de confirmar o envio.</p>

                    <div className="space-y-2 text-sm">
                        <div className="flex justify-between py-2 border-b border-gray-600">
                            <span className="text-gray-400">Valor a Pagar:</span>
                            <span className="font-semibold text-xl text-orange-400">{formatBRLNumber(data.valor || 0)}</span>
                        </div>
                        
                        {/* --- INÍCIO DA CORREÇÃO (Exibir Chave) --- */}
                        <div className="flex justify-between py-2 border-b border-gray-600">
                            <span className="text-gray-400">Favorecido:</span>
                            <span className="font-semibold text-right">{data.favorecido || 'N/A'}</span>
                        </div>
                        <div className="flex justify-between py-2 border-b border-gray-600">
                            <span className="text-gray-400">Chave PIX:</span>
                            <span className="font-semibold text-right">{chave || 'N/A'}</span>
                        </div>
                         <div className="flex justify-between py-2 border-b border-gray-600">
                            <span className="text-gray-400">Tipo da Chave:</span>
                            <span className="font-semibold text-right">{tipoChave || 'N/A'}</span>
                        </div>
                        {/* --- FIM DA CORREÇÃO --- */}

                        <div className="flex justify-between py-2 border-b border-gray-600">
                            <span className="text-gray-400">Conta de Origem:</span>
                            <span className="font-semibold text-right">{data.contaOrigem || 'N/A'}</span>
                        </div>
                    </div>

                    {/* Lógica de Carregamento/Erro (se houver consulta) */}
                    {loadingInfo && <p className="text-yellow-400 mt-4 text-sm">Consultando dados do favorecido...</p>}
                    {errorInfo && <p className="text-red-400 mt-4 text-sm font-bold">{errorInfo}</p>}


                    <div className="mt-6 flex justify-end gap-4">
                        <button
                            onClick={onClose}
                            disabled={isSending}
                            className="bg-gray-600 font-semibold py-2 px-4 rounded-md hover:bg-gray-500 transition disabled:opacity-50"
                        >
                            Cancelar
                        </button>
                        
                        <button
                            onClick={onConfirm}
                            disabled={isSending || loadingInfo || !!errorInfo} // Não deixa confirmar se houver erro
                            className="bg-green-600 font-semibold py-2 px-4 rounded-md hover:bg-green-700 transition disabled:opacity-50"
                        >
                            {isSending ? 'Enviando...' : 'Confirmar e Pagar'}
                        </button>
                    </div>
                </div>
            </div>

            {/* O modal de recibo não precisa ser alterado */}
            <PixReceiptModal
                isOpen={showReceipt}
                onClose={() => { setShowReceipt(false); onClose(); }}
                receiptData={receiptData}
            />
        </>
    );
}