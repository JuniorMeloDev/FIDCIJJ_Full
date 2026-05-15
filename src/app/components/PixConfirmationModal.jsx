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

    if (data.destinatario?.chave) {
      return [data.destinatario.chave, data.destinatario.tipo];
    }

    if (data.chave) {
      return [data.chave, data.tipo_chave_pix];
    }

    if (data.chavePix) {
      return [data.chavePix, data.tipoChave];
    }

    return [null, null];
  }, [data]);

  useEffect(() => {
    if (isOpen && chave) {
      // Consulta real pode ser plugada aqui.
    } else if (!isOpen) {
      setLoadingInfo(false);
      setErrorInfo('');
      setRecebedor(null);
    }
  }, [isOpen, chave]);

  if (!isOpen || !data) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 sm:items-center sm:p-4">
        <div className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl bg-gray-800 text-white shadow-2xl sm:max-w-md sm:rounded-2xl">
          <div className="border-b border-gray-700 px-5 py-4 sm:px-6">
            <h2 className="text-xl font-bold text-green-400">Confirmar Pagamento PIX</h2>
            <p className="mt-1 text-sm text-gray-300">Por favor, revise os dados antes de confirmar o envio.</p>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-6">
            <div className="space-y-2 text-sm">
              <div className="flex flex-col gap-1 border-b border-gray-600 py-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-gray-400">Valor a Pagar:</span>
                <span className="text-xl font-semibold text-orange-400">{formatBRLNumber(data.valor || 0)}</span>
              </div>
              <div className="flex flex-col gap-1 border-b border-gray-600 py-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-gray-400">Favorecido:</span>
                <span className="font-semibold sm:text-right">{data.favorecido || 'N/A'}</span>
              </div>
              <div className="flex flex-col gap-1 border-b border-gray-600 py-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-gray-400">Instituição:</span>
                <span className="font-semibold sm:text-right">{data.instituicao || 'N/A'}</span>
              </div>
              <div className="flex flex-col gap-1 border-b border-gray-600 py-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-gray-400">Chave PIX:</span>
                <span className="font-semibold sm:text-right">{chave || 'N/A'}</span>
              </div>
              <div className="flex flex-col gap-1 border-b border-gray-600 py-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-gray-400">Tipo da Chave:</span>
                <span className="font-semibold sm:text-right">{tipoChave || 'N/A'}</span>
              </div>
              <div className="flex flex-col gap-1 border-b border-gray-600 py-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-gray-400">Conta de Origem:</span>
                <span className="font-semibold sm:text-right">{data.contaOrigem || 'N/A'}</span>
              </div>
            </div>

            {loadingInfo && <p className="mt-4 text-sm text-yellow-400">Consultando dados do favorecido...</p>}
            {errorInfo && <p className="mt-4 text-sm font-bold text-red-400">{errorInfo}</p>}
          </div>

          <div className="border-t border-gray-700 px-5 py-4 sm:px-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                onClick={onClose}
                disabled={isSending}
                className="w-full rounded-md bg-gray-600 px-4 py-3 font-semibold transition hover:bg-gray-500 disabled:opacity-50 sm:w-auto"
              >
                Cancelar
              </button>
              <button
                onClick={onConfirm}
                disabled={isSending || loadingInfo || !!errorInfo}
                className="w-full rounded-md bg-green-600 px-4 py-3 font-semibold transition hover:bg-green-700 disabled:opacity-50 sm:w-auto"
              >
                {isSending ? 'Enviando...' : 'Confirmar e Pagar'}
              </button>
            </div>
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
