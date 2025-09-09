'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FaBell, FaCheckDouble } from 'react-icons/fa';
import { formatDate } from '@/app/utils/formatters';
import Link from 'next/link';
import NotificationDetailModal from '@/app/components/NotificationDetailModal'; // Importar o novo modal

export default function NotificacoesClientePage() {
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [filters, setFilters] = useState({ dataInicio: '', dataFim: '' });
    
    // State para controlar o modal de detalhes
    const [selectedNotification, setSelectedNotification] = useState(null);

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
            // **CORREÇÃO AQUI: Adicionadas as chaves {} ao redor do setError**
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchNotifications();
    }, [filters]);

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

    // Função para extrair texto puro do HTML para a pré-visualização
    const getTextPreview = (html, length = 100) => {
        if (!html) return '';
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const text = doc.body.textContent || "";
        return text.length > length ? text.substring(0, length) + '...' : text;
    };

    return (
        <main className="h-full p-6 bg-gradient-to-br from-gray-900 to-gray-800 text-white flex flex-col items-center">
            <NotificationDetailModal 
                notification={selectedNotification}
                onClose={() => setSelectedNotification(null)}
            />

            <div className="w-full max-w-5xl">
                <motion.header
                    className="mb-6 border-b-2 border-orange-500 pb-4 flex justify-between items-center"
                    initial={{ y: -20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                >
                    <div className="flex items-center gap-3">
                        <FaBell className="text-3xl text-orange-400" />
                        <div>
                            <h1 className="text-3xl font-bold">Minhas Notificações</h1>
                            <p className="text-sm text-gray-300">Acompanhe o status das suas operações.</p>
                        </div>
                    </div>
                     <button 
                        onClick={markAllAsRead}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-md transition flex items-center gap-2 text-sm"
                    >
                        <FaCheckDouble /> Marcar todas como lidas
                    </button>
                </motion.header>

                 <div className="bg-gray-800 p-4 rounded-lg shadow-md mb-6 grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                    <div>
                        <label className="text-sm">De:</label>
                        <input type="date" name="dataInicio" value={filters.dataInicio} onChange={handleFilterChange} className="w-full bg-gray-700 p-2 rounded mt-1" />
                    </div>
                    <div>
                        <label className="text-sm">Até:</label>
                        <input type="date" name="dataFim" value={filters.dataFim} onChange={handleFilterChange} className="w-full bg-gray-700 p-2 rounded mt-1" />
                    </div>
                    <button onClick={() => setFilters({ dataInicio: '', dataFim: '' })} className="bg-gray-600 hover:bg-gray-500 text-white font-semibold py-2 px-4 rounded-md transition h-10">Limpar Filtros</button>
                </div>

                <div className="bg-gray-800 p-4 rounded-lg shadow-md">
                    {loading && <p className="text-center py-10">Carregando...</p>}
                    {error && <p className="text-red-500 text-center py-10">{error}</p>}
                    {!loading && !error && notifications.length === 0 && <p className="text-center py-10 text-gray-400">Nenhuma notificação encontrada.</p>}
                    
                    <div className="space-y-3">
                        {notifications.map(notif => (
                             <motion.div
                                key={notif.id}
                                className={`p-4 rounded-lg flex items-start gap-4 transition-colors cursor-pointer ${notif.is_read ? 'bg-gray-700/50 hover:bg-gray-700/80' : 'bg-gray-700 hover:bg-gray-600'}`}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                onClick={() => setSelectedNotification(notif)}
                            >
                                <div className={`mt-1.5 flex-shrink-0 h-3 w-3 rounded-full ${notif.is_read ? 'bg-gray-500' : 'bg-orange-400 animate-pulse'}`}></div>
                                <div className="flex-grow">
                                    <div className="flex justify-between items-center">
                                        <h3 className={`font-semibold ${notif.is_read ? 'text-gray-300' : 'text-white'}`}>{notif.title}</h3>
                                        <span className="text-xs text-gray-400">{formatDate(notif.created_at)}</span>
                                    </div>
                                    <p className="text-sm text-gray-400 mt-1 italic">
                                        {getTextPreview(notif.message)}
                                    </p>
                                    <div className="mt-2 flex items-center gap-4">
                                        {notif.link && (
                                            <Link 
                                                href={notif.link} 
                                                onClick={(e) => e.stopPropagation()} // Impede que o modal abra ao clicar no link
                                                className="text-sm text-orange-400 hover:underline"
                                            >
                                                Ver Operação
                                            </Link>
                                        )}
                                        {!notif.is_read && (
                                            <button 
                                                onClick={(e) => {
                                                    e.stopPropagation(); // Impede que o modal abra
                                                    markAsRead([notif.id]);
                                                }} 
                                                className="text-sm text-blue-400 hover:underline"
                                            >
                                                Marcar como lida
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </div>
        </main>
    );
}