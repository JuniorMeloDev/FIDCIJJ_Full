'use client';

import { formatBRLNumber } from '@/app/utils/formatters';

export default function PixConfirmationModal({ isOpen, onClose, onConfirm, data, isSending }) {
    if (!isOpen || !data) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-[60]" onClick={onClose}>
            <div className="bg-gray-700 p-6 rounded-lg shadow-xl w-full max-w-md text-white" onClick={e => e.stopPropagation()}>
                <h2 className="text-xl font-bold mb-4">Confirme os Dados do PIX</h2>
                <p className="text-xs text-yellow-300 bg-yellow-900/50 p-2 rounded-md mb-4">
                    Atenção: A API do banco não permite validar os dados do recebedor antes do envio. Verifique com atenção se a chave PIX digitada está correta.
                </p>
                
                <div className="space-y-3 text-sm bg-gray-800 p-4 rounded-md">
                    <div className="flex justify-between">
                        <span className="text-gray-400">Valor a ser enviado:</span>
                        <span className="font-semibold text-lg text-orange-400">{formatBRLNumber(data.valor)}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-gray-400">Para a Chave PIX:</span>
                        <span className="font-semibold break-all text-right">{data.pix.chave}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-gray-400">Tipo da Chave:</span>
                        <span className="font-semibold">{data.pix.tipo}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-gray-400">Descrição na Transação:</span>
                        <span className="font-semibold">{data.descricao}</span>
                    </div>
                     <div className="flex justify-between">
                        <span className="text-gray-400">Debitar da Conta:</span>
                        <span className="font-semibold">{data.contaOrigem}</span>
                    </div>
                </div>

                <div className="mt-6 flex justify-end gap-4">
                    <button onClick={onClose} disabled={isSending} className="bg-gray-600 font-semibold py-2 px-4 rounded-md hover:bg-gray-500 transition disabled:opacity-50">
                        Cancelar
                    </button>
                    <button onClick={onConfirm} disabled={isSending} className="bg-green-600 font-semibold py-2 px-4 rounded-md hover:bg-green-700 transition disabled:opacity-50">
                        {isSending ? 'Enviando...' : 'Confirmar e Pagar'}
                    </button>
                </div>
            </div>
        </div>
    );
}