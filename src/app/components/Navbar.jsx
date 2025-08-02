'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { jwtDecode } from 'jwt-decode';
import { motion } from 'framer-motion'
import { FaChartLine } from 'react-icons/fa'
import { FaBars, FaTimes } from 'react-icons/fa'

export default function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [currentUser, setCurrentUser] = useState(null)

  const router = useRouter()
  const pathname = usePathname()
  const profileRef = useRef(null)

  useEffect(() => {
    const token = sessionStorage.getItem('authToken')
    if (token) {
      try {
        const { sub: username } = jwtDecode(token)
        setCurrentUser({ username })
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
    { label: 'Consultas', href: '/consultas' },
    { label: 'Fluxo de Caixa', href: '/fluxo-caixa' },
    { label: 'Cadastros', href: '/cadastros/clientes' },
  ]

  return (
    <motion.nav
      className="bg-gray-900 border-b border-gray-800 shadow-lg fixed w-full z-30"
      initial={{ y: -40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <Link href="/resumo" className="flex items-center space-x-2">
            <FaChartLine className="w-6 h-6 text-orange-400" />
            <span className="text-xl font-bold text-white">IJJ FIDC</span>
          </Link>

          <button
            className="md:hidden text-gray-400 hover:text-white"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            {isMenuOpen ? <FaTimes /> : <FaBars />}
          </button>

          <div className={`${isMenuOpen ? 'block' : 'hidden'} md:flex md:items-center md:space-x-8`}>
            {links.map(({ label, href }) => (
              <Link key={href} href={href} className={`block px-3 py-2 rounded-md text-sm font-medium ${pathname.startsWith(href) ? 'text-white border-b-2 border-orange-400' : 'text-gray-300 hover:text-orange-400'}`}>
                {label}
              </Link>
            ))}
          </div>

          <div className="relative ml-4 flex-shrink-0" ref={profileRef}>
            <button onClick={() => setIsProfileOpen(!isProfileOpen)} className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-gray-800 transition">
              <span className="font-medium text-gray-200">{currentUser.username}</span>
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
            </button>
            {isProfileOpen && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.2 }}
                className="origin-top-right absolute right-0 mt-2 w-44 bg-gray-800 rounded-md shadow-xl py-1"
              >
                <Link href="/profile" onClick={() => setIsProfileOpen(false)} className="block px-4 py-2 text-sm text-gray-200 hover:bg-gray-700">Perfil</Link>
                <button onClick={handleLogout} className="w-full text-left block px-4 py-2 text-sm text-red-500 hover:bg-gray-700">Sair</button>
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </motion.nav>
  )
}