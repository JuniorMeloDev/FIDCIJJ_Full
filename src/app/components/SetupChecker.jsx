'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import PrimeiroAcesso from './PrimeiroAcesso';
import { useInactivityTimeout } from '../hooks/useInactivityTimeout';
import SessionTimeoutModal from './SessionTimeoutModal';
import { jwtDecode } from 'jwt-decode';

function InactivityManager() {
    const { isWarningModalOpen, countdown, handleContinue, logout } = useInactivityTimeout();
    return (
        <SessionTimeoutModal
            isOpen={isWarningModalOpen}
            onContinue={handleContinue}
            onLogout={logout}
            countdown={countdown}
        />
    );
}

export default function SetupChecker({ children }) {
    const [status, setStatus] = useState({ loading: true, needsSetup: false, isAuthenticated: false });
    const [error, setError] = useState(null);
    const pathname = usePathname();
    const router = useRouter();

    const getAuthHeader = () => {
        const token = sessionStorage.getItem('authToken');
        return token ? { 'Authorization': `Bearer ${token}` } : {};
    };

    useEffect(() => {
        const checkStatus = async () => {
            const publicPaths = ['/', '/login', '/register'];
            if (publicPaths.includes(pathname)) {
                 setStatus({ loading: false, needsSetup: false, isAuthenticated: false });
                 return;
            }
            
            setStatus(prev => ({...prev, loading: true}));
            try {
                const token = sessionStorage.getItem('authToken');
                if (!token) {
                    router.push('/login');
                    setStatus({ loading: false, needsSetup: false, isAuthenticated: false });
                    return;
                }

                const decodedToken = jwtDecode(token);
                const userRoles = decodedToken.roles || [];
                const isClient = userRoles.includes('ROLE_CLIENTE');
                const isAdmin = userRoles.includes('ROLE_ADMIN');
                const isAdminRoute = !pathname.startsWith('/portal');

                if (isAdminRoute && isClient && !isAdmin) {
                    router.push('/portal/dashboard');
                    return;
                }
                
                if (!isAdminRoute && !isClient) {
                    router.push('/login');
                    return;
                }

                const response = await fetch(`/api/setup/status`, { headers: getAuthHeader() }); 
                
                if (!response.ok) {
                    if (response.status === 401 || response.status === 403) {
                        sessionStorage.removeItem('authToken');
                        router.push('/login');
                        throw new Error('Sessão inválida. Por favor, faça login novamente.');
                    }
                    throw new Error('Não foi possível conectar ao servidor.');
                }
                const data = await response.json();
                
                setStatus({ loading: false, needsSetup: data.needsSetup, isAuthenticated: !!token });
                
            } catch (err) {
                console.error(err);
                if (err.name === 'InvalidTokenError') {
                    sessionStorage.removeItem('authToken');
                    router.push('/login');
                }
                setError(err.message);
                setStatus(prev => ({...prev, loading: false}));
            }
        };

        checkStatus();
    }, [pathname, router]);

    const token = typeof window !== 'undefined' ? sessionStorage.getItem('authToken') : null;
    const isAuthenticated = !!token;

    if (isAuthenticated && pathname === '/login') {
        router.push('/resumo');
        return null;
    }
    
    if (status.loading) {
        return <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white">A carregar...</div>;
    }
    
    if (error) {
        return <div className="flex items-center justify-center min-h-screen text-red-400 bg-gray-900">{error}</div>;
    }
    
    const publicPaths = ['/', '/login', '/register'];
    if (publicPaths.includes(pathname)) {
        return <>{children}</>;
    }

    if (status.needsSetup) {
        if (pathname.startsWith('/cadastros')) {
            return (
                <>
                    {children}
                    {isAuthenticated && <InactivityManager />}
                </>
            );
        }
        return <PrimeiroAcesso />;
    }
    
    if(isAuthenticated){
        return (
            <>
                {children}
                <InactivityManager />
            </>
        );
    }

    return null;
}