'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import ChangePasswordModal from '../components/ChangePasswordModal';
import Notification from '../components/Notification';
import { API_URL } from '../apiConfig';

export default function ProfilePage() {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [notification, setNotification] = useState({ message: '', type: '' });

    const showNotification = (message, type) => {
        setNotification({ message, type });
        setTimeout(() => setNotification({ message: '', type: '' }), 5000);
    };

    const handlePasswordSave = async (passwordData) => {
        try {
            const token = sessionStorage.getItem('authToken');
            const response = await fetch(`${API_URL}/users/change-password`, { 
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(passwordData),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || "Falha ao alterar a senha.");
            }
            showNotification("Senha alterada com sucesso!", "success");
            setIsModalOpen(false);

        } catch (err) {
            showNotification(err.message, 'error');
        }
    };

    useEffect(() => {
        const fetchUserData = async () => {
            const token = sessionStorage.getItem('authToken');
            if (!token) {
                setError('Não autenticado.');
                setLoading(false);
                return;
            }

            try {
                const response = await fetch(`${API_URL}/users/me`, { 
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!response.ok) {
                    throw new Error('Falha ao buscar dados do perfil.');
                }
                const data = await response.json();
                setUser(data);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchUserData();
    }, []);

    if (loading) {
        return <div className="p-8 text-center text-gray-300">Carregando perfil...</div>;
    }

    if (error) {
        return <div className="p-8 text-center text-red-400">{error}</div>;
    }

    return (
        <>
            <Notification message={notification.message} type={notification.type} onClose={() => setNotification({ message: '', type: '' })} />
            <ChangePasswordModal 
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handlePasswordSave}
            />
            <main className="min-h-screen pt-16 p-6 bg-gradient-to-br from-gray-900 to-gray-800 text-white">
                <motion.header 
                    className="mb-6 flex justify-between items-center border-b-2 border-orange-500 pb-4"
                    initial={{ y: -20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                >
                    <h1 className="text-3xl font-bold">Perfil do Usuário</h1>
                    <button
                        onClick={() => setIsModalOpen(true)}
                        className="bg-orange-500 text-white font-semibold py-2 px-4 rounded-md hover:bg-orange-600 transition"
                    >
                        Alterar Senha
                    </button>
                </motion.header>
                
                {user && (
                    <motion.div 
                        className="bg-gray-800 p-6 rounded-lg shadow-md max-w-2xl"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.2 }}
                    >
                        <h2 className="text-xl font-semibold border-b border-gray-700 pb-3 mb-4">Informações</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-400">Nome</label>
                                <p className="mt-1 text-lg text-gray-100">{user.username}</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-400">Login do Usuário</label>
                                <p className="mt-1 text-lg text-gray-100">{user.email || 'Não informado'}</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-400">E-mail</label>
                                <p className="mt-1 text-lg text-gray-100">{user.email || 'Não informado'}</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-400">Telefone</label>
                                <p className="mt-1 text-lg text-gray-100">{user.telefone || 'Não informado'}</p>
                            </div>
                        </div>
                    </motion.div>
                )}
            </main>
        </>
    );
}