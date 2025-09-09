'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { jwtDecode } from 'jwt-decode';
import { motion, AnimatePresence } from 'framer-motion'
import { FaChartLine, FaBars, FaTimes, FaBell } from 'react-icons/fa'
import NotificationModal from './NotificationModal';
import NewNotificationModal from './NewNotificationModal';

export default function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [currentUser, setCurrentUser] = useState(null)
  const [unreadCount, setUnreadCount] = useState(0);
  const [isNotificationListOpen, setIsNotificationListOpen] = useState(false);
  const [isNewNotificationOpen, setIsNewNotificationOpen] = useState(false);

  const router = useRouter()
  const pathname = usePathname()
  const profileRef = useRef(null)

  const getAuthHeader = () => {
    const token = sessionStorage.getItem('authToken');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  };

  const fetchApiData = async (url) => {
    try {
        const res = await fetch(url, { headers: getAuthHeader() });
        if (!res.ok) return [];
        return await res.json();
    } catch {
        return [];
    }
  };

  const fetchClientes = (query) => fetchApiData(`/api/cadastros/clientes/search?nome=${query}`);

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
  
  // **NOVA FUNÇÃO PARA TRANSIÇÃO CORRETA DOS MODAIS**
  const handleOpenNewNotificationModal = () => {
    setIsNotificationListOpen(false);
    setIsNewNotificationOpen(true);
  };

  if (pathname.startsWith('/portal')) {
      return null;
  }

  useEffect(() => {
    const token = sessionStorage.getItem('authToken')
    if (token) {
      try {
        const { sub: username } = jwtDecode(token)
        setCurrentUser({ username });
        fetchUnreadCount();
        const interval = setInterval(fetchUnreadCount, 30000);
        return () => clearInterval(interval);
      } catch {
        sessionStorage.removeItem('authToken')
        router.push('/login')
      }
    }
  }, [pathname, router])

  useEffect(() => {
    function onClickOutside(e) {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setIsProfileOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const handleLogout = () => {
    sessionStorage.removeItem('authToken')
    router.push('/login')
  }

  const publicPaths = ['/', '/login'];
  if (publicPaths.includes(pathname)) {
      return null;
  }

  if (!currentUser) return null

  const links = [
    { label: 'Resumo', href: '/resumo' },
    { label: 'Criar Borderô', href: '/operacao-bordero' },
    { label: 'Análise', href: '/analise' },
    { label: 'Consultas', href: '/consultas' },
    { label: 'Fluxo de Caixa', href: '/fluxo-caixa' },
    { label: 'Cadastros', href: '/cadastros/clientes' },
    { label: 'Agenda', href: '/agenda' },
  ]

  return (
    <>
      <NotificationModal 
        isOpen={isNotificationListOpen}
        onClose={() => setIsNotificationListOpen(false)}
        onUpdateCount={fetchUnreadCount}
        onOpenNew={handleOpenNewNotificationModal}
      />
      <NewNotificationModal
        isOpen={isNewNotificationOpen}
        onClose={() => setIsNewNotificationOpen(false)}
        onSuccess={() => {
            alert("Notificação enviada com sucesso!");
            setIsNewNotificationOpen(false);
        }}
        fetchClientes={fetchClientes}
      />
      <motion.nav
        className="bg-gray-900 border-b border-gray-800 shadow-lg fixed w-full z-30"
        initial={{ y: -64, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/resumo" className="flex items-center space-x-2">
              <FaChartLine className="w-6 h-6 text-orange-400" />
              <span className="text-xl font-bold text-white">IJJ FIDC</span>
            </Link>

            <div className="hidden md:flex md:items-center md:space-x-4">
              {links.map(({ label, href }) => (
                <Link key={href} href={href} className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${pathname.startsWith(href) ? 'text-white bg-gray-700' : 'text-gray-300 hover:text-orange-400 hover:bg-gray-800'}`}>
                  {label}
                </Link>
              ))}
            </div>

            <div className="flex items-center">
                <button onClick={() => setIsNotificationListOpen(true)} className="relative text-gray-400 hover:text-white mr-4">
                    <FaBell size={20} />
                    {unreadCount > 0 && (
                        <span className="absolute -top-1 -right-1 flex h-3 w-3 items-center justify-center rounded-full bg-red-500 text-xs text-white">
                        </span>
                    )}
                </button>
                <div className="hidden md:block relative ml-4 flex-shrink-0" ref={profileRef}>
                  <button onClick={() => setIsProfileOpen(!isProfileOpen)} className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-gray-800 transition">
                    <span className="font-medium text-gray-200">{currentUser.username}</span>
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                  </button>
                  {isProfileOpen && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.2 }}
                      className="origin-top-right absolute right-0 mt-2 w-48 bg-gray-800 rounded-md shadow-xl py-1"
                    >
                      <Link href="/profile" onClick={() => setIsProfileOpen(false)} className="block px-4 py-2 text-sm text-gray-200 hover:bg-gray-700">Perfil</Link>
                      <button onClick={handleLogout} className="w-full text-left block px-4 py-2 text-sm text-red-500 hover:bg-gray-700">Sair</button>
                    </motion.div>
                  )}
                </div>
                 <div className="md:hidden flex items-center">
                    <button
                        className="text-gray-400 hover:text-white"
                        onClick={() => setIsMenuOpen(!isMenuOpen)}
                    >
                        {isMenuOpen ? <FaTimes size={20} /> : <FaBars size={20} />}
                    </button>
                </div>
            </div>
          </div>
        </div>
      </motion.nav>

       <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="md:hidden fixed top-16 left-0 h-[calc(100%-4rem)] w-64 bg-gray-900 border-r border-gray-800 z-20 flex flex-col p-4 space-y-2"
          >
             {links.map(({ label, href }) => (
                <Link key={href} href={href} onClick={() => setIsMenuOpen(false)} className={`block px-3 py-2 rounded-md text-base font-medium transition-colors ${pathname.startsWith(href) ? 'text-white bg-gray-700' : 'text-gray-300 hover:text-orange-400 hover:bg-gray-800'}`}>
                  {label}
                </Link>
              ))}
              <div className="border-t border-gray-700 my-4"></div>
               <Link href="/profile" onClick={() => setIsMenuOpen(false)} className="block px-3 py-2 text-base font-medium text-gray-300 hover:text-orange-400 hover:bg-gray-800">Perfil</Link>
               <button onClick={handleLogout} className="w-full text-left block px-3 py-2 text-base font-medium text-red-500 hover:bg-gray-800">Sair</button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}