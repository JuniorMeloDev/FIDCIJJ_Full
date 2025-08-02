'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import Notification from '@/app/components/Notification';
import UserModal from '@/app/components/UserModal';
import useAuth from '@/app/hooks/useAuth';
import { API_URL } from '../../apiConfig';

export default function UsuariosPage() {
    const { isAdmin } = useAuth();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState(null);
    const [notification, setNotification] = useState({ message: '', type: '' });

    const getAuthHeader = () => {
        const token = sessionStorage.getItem('authToken');
        return token ? { 'Authorization': `Bearer ${token}` } : {};
    };

    const showNotification = (message, type) => {
        setNotification({ message, type });
        setTimeout(() => setNotification({ message: '', type: '' }), 5000);
    };

    const fetchUsers = async () => {
        setLoading(true);
        try {
     
            const response = await fetch(`${API_URL}/users`, { headers: getAuthHeader() });
            if (response.status === 403) throw new Error("Acesso negado. Apenas administradores podem ver esta página.");
            if (!response.ok) throw new Error("Falha ao carregar usuários.");
            const data = await response.json();
            setUsers(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isAdmin) {
            fetchUsers();
        } else {
            setError("Acesso negado. Apenas administradores podem ver esta página.");
            setLoading(false);
        }
    }, [isAdmin]);

    const handleSave = async (userData) => {
        try {
            const response = await fetch(`${API_URL}/users`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
                body: JSON.stringify(userData),
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || "Falha ao criar usuário.");
            }
            showNotification("Usuário criado com sucesso!", "success");
            setIsModalOpen(false);
            fetchUsers();
        } catch (err) {
            showNotification(err.message, 'error');
        }
    };


    return (
        <main className="min-h-screen pt-16 p-6 bg-gradient-to-br from-gray-900 to-gray-800 text-white">
            <Notification message={notification.message} type={notification.type} onClose={() => setNotification({ message: '', type: '' })} />
            <UserModal 
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleSave}
                user={editingUser}
            />
            <motion.header 
                className="mb-4 border-b-2 border-orange-500 pb-4"
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
            >
                <h1 className="text-3xl font-bold">Cadastros</h1>
            </motion.header>
            <div className="mb-4 border-b border-gray-700">
                <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                    <Link href="/cadastros/clientes" className="border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-300 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm">Clientes (Cedentes)</Link>
                    <Link href="/cadastros/sacados" className="border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-300 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm">Sacados (Devedores)</Link>
                    <Link href="/cadastros/tipos-operacao" className="border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-300 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm">Tipos de Operação</Link>
                    {isAdmin && (
                        <Link href="/cadastros/usuarios" className="border-orange-500 text-orange-400 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm">Usuários</Link>
                    )}
                </nav>
            </div>

            <div className="bg-gray-800 p-4 rounded-lg shadow-md">
                <div className="flex justify-end mb-4">
                    <button onClick={() => { setEditingUser(null); setIsModalOpen(true); }} className="bg-orange-500 text-white font-semibold py-2 px-4 rounded-md hover:bg-orange-600 transition">Novo Usuário</button>
                </div>
                {loading && <p className="text-gray-400">A carregar...</p>}
                {error && <p className="text-red-400">{error}</p>}
                {!loading && !error && (
                    <table className="min-w-full divide-y divide-gray-700">
                        <thead className="bg-gray-700">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Nome</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Email</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Telefone</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Cargo</th>
                            </tr>
                        </thead>
                        <tbody className="bg-gray-800 divide-y divide-gray-700">
                            {users.map(user => (
                                <tr key={user.id}>
                                    <td className="px-6 py-4 text-sm font-medium text-gray-100">{user.username}</td>
                                    <td className="px-6 py-4 text-sm text-gray-400">{user.email}</td>
                                    <td className="px-6 py-4 text-sm text-gray-400">{user.telefone}</td>
                                    <td className="px-6 py-4 text-sm text-gray-400">{user.roles}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </main>
    );
}