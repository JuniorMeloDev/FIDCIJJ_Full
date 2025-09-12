'use client';

import { formatBRLNumber } from "@/app/utils/formatters";

export default function ConfirmacaoEstornoModal({ isOpen, onClose, onConfirm, item }) {
    if (!isOpen) {
        return null;
    }

    const message = item 
        ? `Tem certeza que deseja estornar o lançamento "${item.descricao}" no valor de ${formatBRLNumber(item.valor)}?`
        : "Tem certeza que deseja estornar esta liquidação?";

    const duplicataInfo = item?.duplicata?.nf_cte 
        ? `A duplicata ${item.duplicata.nf_cte} voltará ao status 'Pendente'.`
        : "A duplicata correspondente voltará ao status 'Pendente'.";

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4">
            <div className="bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-md">
                <h2 className="text-xl font-bold mb-4 text-white">Confirmar Estorno</h2>
                
                <p className="text-gray-300 mb-2">{message}</p>
                <p className="text-sm text-gray-400 mb-6">{duplicataInfo} Esta movimentação de caixa será excluída.</p>
                
                <div className="flex justify-end gap-4">
                    <button
                        onClick={onClose}
                        className="bg-gray-600 text-gray-100 font-semibold py-2 px-4 rounded-md hover:bg-gray-500 transition"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={onConfirm}
                        className="bg-red-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-red-700 transition"
                    >
                        Confirmar
                    </button>
                </div>
            </div>
        </div>
    );
}