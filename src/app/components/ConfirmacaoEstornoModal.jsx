'use client';

import { formatBRLNumber } from "@/app/utils/formatters";

export default function ConfirmacaoEstornoModal({ isOpen, onClose, onConfirm, item }) {
  if (!isOpen) return null;

  const message = item
    ? `Tem certeza que deseja estornar o lançamento "${item.descricao}" no valor de ${formatBRLNumber(item.valor)}?`
    : 'Tem certeza que deseja estornar esta liquidação?';

  const duplicataInfo = item?.duplicata?.nf_cte
    ? `A duplicata ${item.duplicata.nf_cte} voltará ao status 'Pendente'.`
    : "A duplicata correspondente voltará ao status 'Pendente'.";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-3xl bg-gray-800 p-6 text-white shadow-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 text-xl font-bold text-white">Confirmar Estorno</h2>
        <p className="mb-2 text-gray-300">{message}</p>
        <p className="mb-6 text-sm text-gray-400">
          {duplicataInfo} Esta movimentação de caixa será excluída.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button onClick={onClose} className="w-full rounded-md bg-gray-600 px-4 py-3 font-semibold text-gray-100 transition hover:bg-gray-500 sm:w-auto">
            Cancelar
          </button>
          <button onClick={onConfirm} className="w-full rounded-md bg-red-600 px-4 py-3 font-semibold text-white transition hover:bg-red-700 sm:w-auto">
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}
