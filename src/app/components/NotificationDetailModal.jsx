'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { FaTimes, FaPaperclip } from 'react-icons/fa';
import { formatDate } from '@/app/utils/formatters';

export default function NotificationDetailModal({ notification, onClose }) {
    if (!notification) return null;

    return (
        <AnimatePresence>
            {notification && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[60] p-4" // Z-index maior para ficar sobre outros modais
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.9, opacity: 0 }}
                        onClick={(e) => e.stopPropagation()}
                        className="bg-gray-800 text-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col"
                    >
                        <header className="p-4 border-b border-gray-700 flex justify-between items-center flex-shrink-0">
                            <div>
                                <h2 className="text-xl font-bold">{notification.title}</h2>
                                <p className="text-xs text-gray-400">Recebida em: {formatDate(notification.created_at)}</p>
                            </div>
                            <button onClick={onClose} className="text-gray-400 hover:text-white"><FaTimes size={20}/></button>
                        </header>

                        <div className="p-6 flex-grow overflow-y-auto">
                            {/* Renderiza o HTML da mensagem de forma segura */}
                            <div
                                className="prose prose-invert max-w-none"
                                dangerouslySetInnerHTML={{ __html: notification.message }}
                            />
                        </div>

                        {/* Mostra a seção de anexos apenas se existirem */}
                        {notification.attachments && notification.attachments.length > 0 && (
                            <footer className="p-4 border-t border-gray-700 flex-shrink-0">
                                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                                    <FaPaperclip /> Anexos:
                                </h3>
                                <div className="flex flex-wrap gap-2">
                                    {notification.attachments.map((file, index) => (
                                        <span key={index} className="bg-gray-700 text-gray-300 text-xs px-2 py-1 rounded">
                                            {file}
                                        </span>
                                    ))}
                                </div>
                                <p className="text-xs text-gray-500 mt-2">Os anexos foram enviados por e-mail.</p>
                            </footer>
                        )}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}