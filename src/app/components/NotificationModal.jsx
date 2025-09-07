'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaBell, FaCheckDouble, FaTimes } from 'react-icons/fa';
import { formatDate } from '@/app/utils/formatters';
import Link from 'next/link';

export default function NotificationModal({ isOpen, onClose, onUpdateCount }) {
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [filters, setFilters] = useState({ dataInicio: '', dataFim: '' });

    const getAuthHeader = () => {
        const token = sessionStorage.getItem('authToken');
        return token ? { 'Authorization': `Bearer ${token}` } : {};
    };

    const fetchNotifications = async () => {
        setLoading(true);
        const params = new URLSearchParams();
        if (filters.dataInicio) params.append('dataInicio', filters.dataInicio);
        if (filters.dataFim) params.append('dataFim', filters.dataFim);

        try {
            const response = await fetch(`/api/notifications?${params.toString()}`, { headers: getAuthHeader() });
            if (!response.ok) throw new Error('Falha ao carregar notificações.');
            const data = await response.json();
            setNotifications(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            fetchNotifications();
        }
    }, [isOpen, filters]);

    const handleFilterChange = (e) => {
        setFilters(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const markAsRead = async (ids) => {
        try {
            await fetch('/api/notifications', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
                body: JSON.stringify({ ids }),
            });
            setNotifications(prev => 
                prev.map(n => ids.includes(n.id) ? { ...n, is_read: true } : n)
            );
            onUpdateCount(); // Atualiza a contagem no navbar
        } catch (err) {
            alert(err.message);
        }
    };

    const markAllAsRead = () => {
        const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id);
        if (unreadIds.length > 0) {
            markAsRead(unreadIds);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4"
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
                            <div className="flex items-center gap-3">
                                <FaBell className="text-xl text-orange-400" />
                                <h2 className="text-xl font-bold">Notificações</h2>
                            </div>
                            <button onClick={onClose} className="text-gray-400 hover:text-white"><FaTimes size={20}/></button>
                        </header>

                        <div className="p-4 flex-shrink-0 border-b border-gray-700">
                             <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                                <div>
                                    <label className="text-xs text-gray-400">De:</label>
                                    <input type="date" name="dataInicio" value={filters.dataInicio} onChange={handleFilterChange} className="w-full bg-gray-700 p-2 rounded mt-1 text-sm" />
                                </div>
                                <div>
                                    <label className="text-xs text-gray-400">Até:</label>
                                    <input type="date" name="dataFim" value={filters.dataFim} onChange={handleFilterChange} className="w-full bg-gray-700 p-2 rounded mt-1 text-sm" />
                                </div>
                                <button onClick={() => setFilters({ dataInicio: '', dataFim: '' })} className="bg-gray-600 hover:bg-gray-500 text-white font-semibold py-2 px-4 rounded-md transition h-10 text-sm">Limpar</button>
                            </div>
                        </div>

                        <div className="p-4 flex-grow overflow-y-auto">
                            {loading && <p className="text-center py-10">Carregando...</p>}
                            {error && <p className="text-red-500 text-center py-10">{error}</p>}
                            {!loading && !error && notifications.length === 0 && <p className="text-center py-10 text-gray-400">Nenhuma notificação encontrada.</p>}
                            
                            <div className="space-y-3">
                                {notifications.map(notif => (
                                    <div key={notif.id} className={`p-3 rounded-md flex items-start gap-3 transition-colors ${notif.is_read ? 'bg-gray-900/50' : 'bg-gray-700'}`}>
                                        <div className={`mt-1.5 flex-shrink-0 h-2.5 w-2.5 rounded-full ${notif.is_read ? 'bg-gray-500' : 'bg-orange-400'}`}></div>
                                        <div className="flex-grow">
                                            <div className="flex justify-between items-center">
                                                <h3 className={`font-semibold text-sm ${notif.is_read ? 'text-gray-400' : 'text-white'}`}>{notif.title}</h3>
                                                <span className="text-xs text-gray-500">{formatDate(notif.created_at)}</span>
                                            </div>
                                            <p className="text-sm text-gray-300 mt-1">{notif.message}</p>
                                            <div className="mt-2 flex items-center gap-4">
                                                {notif.link && (
                                                    <Link href={notif.link} onClick={onClose} className="text-sm text-orange-400 hover:underline">
                                                        Ver Detalhes
                                                    </Link>
                                                )}
                                                {!notif.is_read && (
                                                    <button onClick={() => markAsRead([notif.id])} className="text-sm text-blue-400 hover:underline">
                                                        Marcar como lida
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <footer className="p-4 border-t border-gray-700 flex-shrink-0 flex justify-end">
                             <button 
                                onClick={markAllAsRead}
                                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-md transition flex items-center gap-2 text-sm"
                            >
                                <FaCheckDouble /> Marcar todas como lidas
                            </button>
                        </footer>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
