"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { FiLogIn, FiUser, FiLock, FiEye, FiEyeOff } from 'react-icons/fi';
import { jwtDecode } from 'jwt-decode';
import { formatCnpjCpf } from '@/app/utils/formatters'; // Importar a função de formatação

const LoginPage = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false); // Estado para controlar a visibilidade
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            // A API já remove a formatação, então enviamos o valor mascarado
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

            const decodedToken = jwtDecode(data.token);
            const userRoles = decodedToken.roles || [];

            if (userRoles.includes('ROLE_CLIENTE')) {
                router.push('/portal/dashboard');
            } else {
                router.push('/resumo');
            }

        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };
    
    // Aplica a máscara de CPF/CNPJ ao digitar
    const handleUsernameChange = (e) => {
        const value = e.target.value;
        const cleanValue = value.replace(/\D/g, '');
        // Se parece com CPF/CNPJ, formata. Senão, mantém como está.
        if (!isNaN(Number(cleanValue)) && cleanValue.length > 0) {
            setUsername(formatCnpjCpf(value));
        } else {
            setUsername(value);
        }
    }

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
                            placeholder="Usuário ou CPF/CNPJ"
                            value={username}
                            onChange={handleUsernameChange}
                            className="w-full pl-10 pr-4 py-2 text-white bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                            required
                        />
                    </div>
                    <div className="relative">
                        <FiLock className="absolute top-3 left-3 text-gray-400" />
                        <input
                            type={showPassword ? "text" : "password"}
                            placeholder="Senha"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full pl-10 pr-10 py-2 text-white bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                            required
                        />
                        <div className="absolute inset-y-0 right-0 pr-3 flex items-center text-sm leading-5">
                           <button type="button" onClick={() => setShowPassword(!showPassword)} className="text-gray-400 hover:text-white">
                             {showPassword ? <FiEyeOff/> : <FiEye/>}
                           </button>
                        </div>
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