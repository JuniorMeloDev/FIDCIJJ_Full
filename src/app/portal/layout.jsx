'use client'

import { jwtDecode } from 'jwt-decode';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { FaChartLine, FaBell } from "react-icons/fa";
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import NotificationModal from '@/app/components/NotificationModal';

function PortalNavbar({ user, onLogout, unreadCount, onBellClick }) {
    const [isProfileOpen, setIsProfileOpen] = useState(false);
    const profileRef = useRef(null);
    
    useEffect(() => {
        function onClickOutside(e) {
          if (profileRef.current && !profileRef.current.contains(e.target)) {
            setIsProfileOpen(false)
          }
        }
        document.addEventListener('mousedown', onClickOutside)
        return () => document.removeEventListener('mousedown', onClickOutside)
    }, [])

    if (!user) return null;

    return (
        <nav className="bg-gray-900 border-b border-gray-700 fixed w-full z-20 top-0 left-0 h-16">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between items-center h-16">
                    <Link href="/portal/dashboard" className="flex items-center space-x-3">
                        <FaChartLine className="text-orange-400 text-2xl" />
                        <span className="text-xl font-bold text-white">IJJ FIDC - Portal do Cliente</span>
                    </Link>
                    <div className="flex items-center space-x-4">
                         <button onClick={onBellClick} className="relative text-gray-400 hover:text-white">
                            <FaBell size={20} />
                            {unreadCount > 0 && (
                                <span className="absolute -top-1 -right-1 flex h-3 w-3 items-center justify-center rounded-full bg-red-500 text-xs text-white animate-pulse"></span>
                            )}
                        </button>
                         <div className="relative" ref={profileRef}>
                            <button onClick={() => setIsProfileOpen(!isProfileOpen)} className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-gray-800 transition">
                                <span className="hidden sm:block text-gray-300 font-medium">{user.cliente_nome}</span>
                                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                            </button>
                            <AnimatePresence>
                            {isProfileOpen && (
                                <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                transition={{ duration: 0.2 }}
                                className="origin-top-right absolute right-0 mt-2 w-48 bg-gray-800 rounded-md shadow-xl py-1"
                                >
                                <Link href="/portal/dashboard" onClick={() => setIsProfileOpen(false)} className="block px-4 py-2 text-sm text-gray-200 hover:bg-gray-700">Dashboard</Link>
                                <Link href="/portal/profile" onClick={() => setIsProfileOpen(false)} className="block px-4 py-2 text-sm text-gray-200 hover:bg-gray-700">Perfil</Link>
                                <button onClick={onLogout} className="w-full text-left block px-4 py-2 text-sm text-red-500 hover:bg-gray-700">Sair</button>
                                </motion.div>
                            )}
                            </AnimatePresence>
                         </div>
                    </div>
                </div>
            </div>
        </nav>
    );
}

export default function PortalLayout({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [unreadCount, setUnreadCount] = useState(0);
    const [isNotificationModalOpen, setIsNotificationModalOpen] = useState(false);
    const router = useRouter();
    
    const getAuthHeader = () => {
        const token = sessionStorage.getItem('authToken');
        return token ? { 'Authorization': `Bearer ${token}` } : {};
    };

    const fetchUnreadCount = async () => {
        try {
            const response = await fetch('/api/notifications/unread-count', { headers: getAuthHeader() });
            if (response.ok) {
                const data = await response.json();
                setUnreadCount(data.count);
            }
        } catch (error) {
            console.error("Failed to fetch unread count", error);
        }
    };

    useEffect(() => {
        const checkAuthAndLoadData = async () => {
            const token = sessionStorage.getItem('authToken');
            if (!token) {
                router.push('/login');
                setLoading(false);
                return;
            }

            try {
                const decoded = jwtDecode(token);
                const userRoles = decoded.roles || [];

                if (!userRoles.includes('ROLE_CLIENTE')) {
                    router.push('/login');
                    setLoading(false);
                    return;
                }
                
                setUser({
                    username: decoded.sub,
                    cliente_nome: decoded.cliente_nome
                });

                await fetchUnreadCount();
                
                const interval = setInterval(fetchUnreadCount, 30000);
                return () => clearInterval(interval);

            } catch (error) {
                sessionStorage.removeItem('authToken');
                router.push('/login');
            } finally {
                setLoading(false);
            }
        };

        checkAuthAndLoadData();
    }, [router]);

    const handleLogout = () => {
        sessionStorage.removeItem('authToken');
        router.push('/login');
    };

    if (loading || !user) {
        return <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white">Verificando acesso...</div>;
    }

    return (
        <div className="h-full flex flex-col bg-gray-900">
            <NotificationModal 
                isOpen={isNotificationModalOpen}
                onClose={() => setIsNotificationModalOpen(false)}
                onUpdateCount={fetchUnreadCount}
                isAdmin={false}
            />
            <PortalNavbar 
                user={user} 
                onLogout={handleLogout} 
                unreadCount={unreadCount}
                onBellClick={() => setIsNotificationModalOpen(true)}
            />
            <main className="pt-16 flex-grow overflow-y-auto">
                {children}
            </main>
        </div>
    );
}