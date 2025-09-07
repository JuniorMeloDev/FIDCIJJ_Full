'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import ChangePasswordModal from '@/app/components/ChangePasswordModal';
import Notification from '@/app/components/Notification';
import { formatCnpjCpf, formatTelefone } from '@/app/utils/formatters';

export default function ProfilePage() {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [notification, setNotification] = useState({ message: '', type: '' });

    const getAuthHeader = () => {
        const token = sessionStorage.getItem('authToken');
        return token ? { 'Authorization': `Bearer ${token}` } : {};
    };

    const showNotification = (message, type) => {
        setNotification({ message, type });
        setTimeout(() => setNotification({ message: '', type: '' }), 5000);
    };

    const handlePasswordSave = async (passwordData) => {
        try {
            const response = await fetch(`/api/portal/change-password`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...getAuthHeader()
                },
                body: JSON.stringify(passwordData),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || "Falha ao alterar a senha.");
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
                const response = await fetch(`/api/portal/profile`, {
                    headers: getAuthHeader()
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
        return <div className="p-6 text-center text-gray-300">Carregando perfil...</div>;
    }

    if (error) {
        return <div className="p-6 text-center text-red-400">{error}</div>;
    }

    return (
        <>
            <Notification message={notification.message} type={notification.type} onClose={() => setNotification({ message: '', type: '' })} />
            <ChangePasswordModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handlePasswordSave}
            />
            <main className="h-full p-6 bg-gradient-to-br from-gray-900 to-gray-800 text-white flex flex-col items-center">
                <div className="w-full max-w-4xl">
                     <motion.header
                        className="mb-6 flex justify-between items-center border-b-2 border-orange-500 pb-4"
                        initial={{ y: -20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                    >
                        <h1 className="text-2xl font-bold">Perfil do Cliente</h1>
                        <button
                            onClick={() => setIsModalOpen(true)}
                            className="bg-orange-500 text-white font-semibold py-2 px-4 rounded-md hover:bg-orange-600 transition"
                        >
                            Alterar Senha
                        </button>
                    </motion.header>

                    {user && (
                        <motion.div
                            className="bg-gray-800 p-6 rounded-lg shadow-md"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.2 }}
                        >
                            <h2 className="text-lg font-semibold border-b border-gray-700 pb-2 mb-4">Informações da Empresa</h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                                <div>
                                    <label className="block text-xs font-medium text-gray-400">Nome da Empresa</label>
                                    <p className="mt-1 text-base text-gray-100">{user.nome}</p>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-400">CNPJ</label>
                                    <p className="mt-1 text-base text-gray-100">{formatCnpjCpf(user.cnpj)}</p>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-400">E-mail Principal</label>
                                    <p className="mt-1 text-base text-gray-100">{user.email || 'Não informado'}</p>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-400">Telefone</label>
                                    <p className="mt-1 text-base text-gray-100">{formatTelefone(user.fone) || 'Não informado'}</p>
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-xs font-medium text-gray-400">Endereço</label>
                                    <p className="mt-1 text-base text-gray-100">{`${user.endereco || ''}, ${user.bairro || ''} - ${user.municipio || ''}/${user.uf || ''}`}</p>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-400">Usuário de Acesso</label>
                                    <p className="mt-1 text-base text-gray-100">{user.username}</p>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </div>
            </main>
        </>
    );
}