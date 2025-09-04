'use client'

import { jwtDecode } from 'jwt-decode';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { FaChartLine } from "react-icons/fa";
import Link from "next/link";

// Componente de Cabeçalho do Portal
function PortalNavbar({ user, onLogout }) {
    if (!user) return null;

    return (
        <nav className="bg-gray-900/80 backdrop-blur-sm border-b border-gray-700 fixed w-full z-10">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between items-center h-16">
                    <div className="flex items-center space-x-3">
                        <FaChartLine className="text-orange-400 text-2xl" />
                        <span className="text-xl font-bold text-white">IJJ FIDC - Portal do Cliente</span>
                    </div>
                    <div className="flex items-center space-x-4">
                         <span className="hidden sm:block text-gray-300 font-medium">{user.cliente_nome}</span>
                         <button onClick={onLogout} className="text-sm text-gray-300 hover:text-orange-400 transition">Sair</button>
                    </div>
                </div>
            </div>
        </nav>
    );
}


export default function PortalLayout({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        const token = sessionStorage.getItem('authToken');
        if (token) {
            try {
                const decoded = jwtDecode(token);
                const userRoles = decoded.roles || [];
                // Se não for cliente, redireciona para o login (ou para o dashboard admin)
                if (!userRoles.includes('ROLE_CLIENTE')) {
                    router.push('/login');
                    return;
                }
                setUser({
                    username: decoded.sub,
                    cliente_nome: decoded.cliente_nome
                });
            } catch (error) {
                sessionStorage.removeItem('authToken');
                router.push('/login');
            }
        } else {
            router.push('/login');
        }
        setLoading(false);
    }, [router]);

    const handleLogout = () => {
        sessionStorage.removeItem('authToken');
        router.push('/login');
    };

    if (loading || !user) {
        return <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white">Verificando acesso...</div>;
    }

    return (
        <>
            <PortalNavbar user={user} onLogout={handleLogout} />
            <main className="pt-16 bg-gray-900 min-h-screen">
                {children}
            </main>
        </>
    );
}

