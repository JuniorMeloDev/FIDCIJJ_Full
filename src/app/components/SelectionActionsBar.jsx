'use client';

import { motion } from 'framer-motion';
import { formatBRLNumber } from '@/app/utils/formatters';

export default function SelectionActionsBar({ selectedCount, totalValue, onLiquidate, onGeneratePdf, onClear }) {
    if (selectedCount === 0) return null;

    return (
        <motion.div
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            exit={{ y: 100 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed bottom-0 left-0 right-0 bg-gray-800 border-t border-orange-500 shadow-lg p-4 z-40 flex items-center justify-between"
        >
            <div className="text-white">
                <span className="font-bold">{selectedCount}</span> duplicata(s) selecionada(s)
                <span className="mx-2 text-gray-500">|</span>
                Total: <span className="font-bold">{formatBRLNumber(totalValue)}</span>
            </div>
            <div className="flex items-center gap-4">
                <button
                    onClick={onLiquidate}
                    className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-md transition text-sm"
                >
                    Liquidar Selecionadas
                </button>
                <button
                    onClick={onGeneratePdf}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-md transition text-sm"
                >
                    Gerar PDF
                </button>
                <button
                    onClick={onClear}
                    title="Limpar seleção"
                    className="text-gray-400 hover:text-white text-2xl font-bold"
                >
                    &times;
                </button>
            </div>
        </motion.div>
    );
}