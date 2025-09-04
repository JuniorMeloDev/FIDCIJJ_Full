"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { FiLogIn, FiUser, FiLock } from 'react-icons/fi';
import { jwtDecode } from 'jwt-decode'; // <-- IMPORTANTE: Adicione esta linha

const LoginPage = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, password }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Usuário ou senha inválidos.');
            }

            const data = await response.json();
            sessionStorage.setItem('authToken', data.token); 

            // --- LÓGICA DE REDIRECIONAMENTO CORRIGIDA ---
            // 1. Decodifica o token para ler as informações (roles)
            const decodedToken = jwtDecode(data.token);
            const userRoles = decodedToken.roles || [];

            // 2. Verifica se o usuário é um cliente
            if (userRoles.includes('ROLE_CLIENTE')) {
                // Se for, redireciona para o dashboard do cliente
                router.push('/portal/dashboard');
            } else {
                // Senão, redireciona para o resumo do admin
                router.push('/resumo');
            }
            // --- FIM DA CORREÇÃO ---

        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white">
            <motion.div 
                className="w-full max-w-md p-8 space-y-8 bg-gray-800 rounded-lg shadow-lg"
                initial={{ opacity: 0, y: -50 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
            >
                <div className="text-center">
                    <h1 className="text-4xl font-bold text-orange-500">FIDCIJJ</h1>
                    <p className="mt-2 text-gray-400">Bem-vindo de volta! Faça login para continuar.</p>
                </div>
                <form className="space-y-6" onSubmit={handleLogin}>
                    <div className="relative">
                        <FiUser className="absolute top-3 left-3 text-gray-400" />
                        <input 
                            type="text" 
                            placeholder="Usuário" 
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 text-white bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                            required
                        />
                    </div>
                    <div className="relative">
                        <FiLock className="absolute top-3 left-3 text-gray-400" />
                        <input 
                            type="password" 
                            placeholder="Senha" 
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 text-white bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                            required
                        />
                    </div>
                    {error && <p className="text-red-500 text-sm text-center">{error}</p>}
                    <div>
                        <button 
                            type="submit" 
                            disabled={loading}
                            className="w-full flex justify-center items-center py-2 px-4 text-sm font-medium rounded-md text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 disabled:bg-orange-400 transition-colors"
                        >
                            {loading ? 'Entrando...' : <><FiLogIn className="mr-2" /> Entrar</>}
                        </button>
                    </div>
                </form>
            </motion.div>
        </div>
    );
};

export default LoginPage;