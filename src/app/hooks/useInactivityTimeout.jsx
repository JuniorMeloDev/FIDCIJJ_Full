'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';

const INACTIVITY_TIMEOUT = 15 * 60 * 1000; 
const WARNING_TIMEOUT = 1 * 60 * 1000;     

export function useInactivityTimeout() {
    const [isWarningModalOpen, setWarningModalOpen] = useState(false);
    const [countdown, setCountdown] = useState(WARNING_TIMEOUT / 1000);
    
    const router = useRouter();
    
    const warningTimeoutRef = useRef(null);
    const logoutTimeoutRef = useRef(null);
    const countdownIntervalRef = useRef(null);

    const logout = useCallback(() => {
        sessionStorage.removeItem('authToken');
        router.push('/login');
    }, [router]);

    const resetTimers = useCallback(() => {
        setWarningModalOpen(false);
        setCountdown(WARNING_TIMEOUT / 1000);

        if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current);
        if (logoutTimeoutRef.current) clearTimeout(logoutTimeoutRef.current);
        if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);

        warningTimeoutRef.current = setTimeout(() => {
            setWarningModalOpen(true);
            countdownIntervalRef.current = setInterval(() => {
                setCountdown(prev => (prev > 0 ? prev - 1 : 0));
            }, 1000);
        }, INACTIVITY_TIMEOUT - WARNING_TIMEOUT);

        logoutTimeoutRef.current = setTimeout(logout, INACTIVITY_TIMEOUT);
    }, [logout]);

    const handleContinue = () => {
        resetTimers();
    };

    useEffect(() => {
        const events = ['mousemove', 'keydown', 'click', 'scroll'];
        
        const eventHandler = () => {
            resetTimers();
        };

        events.forEach(event => window.addEventListener(event, eventHandler));
        resetTimers(); // Inicia os timers na montagem do componente

        return () => {
            events.forEach(event => window.removeEventListener(event, eventHandler));
            if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current);
            if (logoutTimeoutRef.current) clearTimeout(logoutTimeoutRef.current);
            if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
        };
    }, [resetTimers]);

    return { isWarningModalOpen, countdown, handleContinue, logout };
}