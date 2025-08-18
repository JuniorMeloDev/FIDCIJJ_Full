'use client';

import { motion } from 'framer-motion';
import { FaTrash } from 'react-icons/fa';

export default function AnotacaoActionsBar({ selectedCount, onDelete, onClear }) {
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
                <span className="font-bold">{selectedCount}</span> anotação(ões) selecionada(s)
            </div>
            <div className="flex items-center gap-4">
                <button
                    onClick={onDelete}
                    className="bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-md transition text-sm flex items-center gap-2"
                >
                   <FaTrash /> Excluir Selecionadas
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