'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import EditSacadoModal from '@/app/components/EditSacadoModal';
import Notification from '@/app/components/Notification';
import ConfirmacaoModal from '@/app/components/ConfirmacaoModal';
import Pagination from '@/app/components/Pagination';
import FiltroLateralSacados from '@/app/components/FiltroLateralSacados';
import { formatCnpjCpf, formatTelefone } from '@/app/utils/formatters';
import useAuth from '@/app/hooks/useAuth';
import { API_URL } from '../../apiConfig'; 

const ITEMS_PER_PAGE = 10;

export default function SacadosPage() {
    const { isAdmin } = useAuth();
    const [sacados, setSacados] = useState([]);
    const [tiposOperacao, setTiposOperacao] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingSacado, setEditingSacado] = useState(null);
    const [notification, setNotification] = useState({ message: '', type: '' });
    const [currentPage, setCurrentPage] = useState(1);
    const [filters, setFilters] = useState({ nome: '', cnpj: '' });
    
    const [sacadoParaExcluir, setSacadoParaExcluir] = useState(null);

    const getAuthHeader = () => {
        const token = sessionStorage.getItem('authToken');
        return token ? { 'Authorization': `Bearer ${token}` } : {};
    };

    const showNotification = (message, type) => {
        setNotification({ message, type });
        setTimeout(() => setNotification({ message: '', type: '' }), 5000);
    };

    const fetchData = async () => {
        setLoading(true);
        try {
            const headers = getAuthHeader();
            const [sacadosRes, tiposRes] = await Promise.all([
                fetch(`${API_URL}/cadastros/sacados`, { headers }),
                fetch(`${API_URL}/cadastros/tipos-operacao`, { headers })
            ]);
            if (!sacadosRes.ok) throw new Error('Falha ao carregar sacados.');
            if (!tiposRes.ok) throw new Error('Falha ao carregar tipos de operação.');
            
            setSacados(await sacadosRes.json());
            setTiposOperacao(await tiposRes.json());
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const filteredSacados = useMemo(() => {
        return sacados.filter(sacado => {
            const nomeMatch = !filters.nome || sacado.nome.toLowerCase().includes(filters.nome.toLowerCase());
            const cnpjMatch = !filters.cnpj || (sacado.cnpj && sacado.cnpj.includes(filters.cnpj.replace(/\D/g, '')));
            return nomeMatch && cnpjMatch;
        });
    }, [filters, sacados]);

    const handleFilterChange = (e) => {
        setCurrentPage(1);
        setFilters(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const clearFilters = () => {
        setCurrentPage(1);
        setFilters({ nome: '', cnpj: '' });
    };

    const handleOpenAddModal = () => { setEditingSacado(null); setIsModalOpen(true); };
    const handleOpenEditModal = (sacado) => { setEditingSacado(sacado); setIsModalOpen(true); };

    const handleSaveSacado = async (id, data) => {
        try {
            const isUpdating = !!id;
            const url = isUpdating ? `${API_URL}/cadastros/sacados/${id}` : `${API_URL}/cadastros/sacados`;
            const method = isUpdating ? 'PUT' : 'POST';

            const payload = { ...data };
            const response = await fetch(url, { 
                method, 
                headers: { 'Content-Type': 'application/json', ...getAuthHeader() }, 
                body: JSON.stringify(payload) 
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || 'Falha ao salvar o sacado.');
            }
            
            setIsModalOpen(false);
            await fetchData();
            showNotification(`Sacado ${isUpdating ? 'atualizado' : 'criado'} com sucesso!`, 'success');
            return { success: true };
        } catch (err) {
            return { success: false, message: err.message };
        }
    };
    
    const handleDeleteRequest = (id) => {
        const sacado = sacados.find(s => s.id === id);
        setSacadoParaExcluir(sacado);
    };

    const handleConfirmarExclusao = async () => {
        if (!sacadoParaExcluir) return;
        try {
            const response = await fetch(`${API_URL}/cadastros/sacados/${sacadoParaExcluir.id}`, { 
                method: 'DELETE',
                headers: getAuthHeader()
            });
            if (!response.ok) throw new Error('Falha ao excluir o sacado.');
            showNotification('Sacado excluído com sucesso!', 'success');
            await fetchData();
        } catch (err) {
            showNotification(err.message, 'error');
        } finally {
            setSacadoParaExcluir(null);
            setIsModalOpen(false);
        }
    };

    const indexOfLastItem = currentPage * ITEMS_PER_PAGE;
    const indexOfFirstItem = indexOfLastItem - ITEMS_PER_PAGE;
    const currentItems = filteredSacados.slice(indexOfFirstItem, indexOfLastItem);
    const paginate = (pageNumber) => setCurrentPage(pageNumber);

    return (
        <main className="min-h-screen pt-16 p-6 bg-gradient-to-br from-gray-900 to-gray-800 text-white">
            <Notification message={notification.message} type={notification.type} onClose={() => setNotification({ message: '', type: '' })} />
            
            <EditSacadoModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                sacado={editingSacado}
                onSave={handleSaveSacado}
                onDelete={handleDeleteRequest}
            />

            <ConfirmacaoModal
                isOpen={!!sacadoParaExcluir}
                onClose={() => setSacadoParaExcluir(null)}
                onConfirm={handleConfirmarExclusao}
                title="Confirmar Exclusão"
                message={`Deseja excluir o sacado "${sacadoParaExcluir?.nome}"?`}
            />
            
            <motion.header 
                className="mb-4 border-b-2 border-orange-500 pb-4"
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
            >
                <h1 className="text-3xl font-bold">Cadastros</h1>
                <p className="text-sm text-gray-300">Gestão de Clientes e Sacados</p>
            </motion.header>
            <div className="mb-4 border-b border-gray-700">
                <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                    <Link href="/cadastros/clientes" className="border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-300 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm">Clientes (Cedentes)</Link>
                    <Link href="/cadastros/sacados" className="border-orange-500 text-orange-400 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm">Sacados (Devedores)</Link>
                    <Link href="/cadastros/tipos-operacao" className="border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-300 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm">Tipos de Operação</Link>
                    {isAdmin && (
                        <Link href="/cadastros/usuarios" className="border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-300 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm">Usuários</Link>
                    )}
                </nav>
            </div>
            <div className="flex-grow flex flex-col lg:flex-row gap-6">
                <FiltroLateralSacados filters={filters} onFilterChange={handleFilterChange} onClear={clearFilters} />
                <div className="flex-grow bg-gray-800 p-4 rounded-lg shadow-md flex flex-col">
                    <div className="flex justify-end mb-4">
                        <button onClick={handleOpenAddModal} className="bg-orange-500 text-white font-semibold py-2 px-4 rounded-md shadow-sm hover:bg-orange-600 transition">Novo Sacado</button>
                    </div>
                    <div className="overflow-auto">
                        {loading ? <p className="text-center py-10 text-gray-400">A carregar...</p> : error ? <p className="text-red-400 text-center py-10">{error}</p> : (
                            <table className="min-w-full divide-y divide-gray-700">
                                <thead className="bg-gray-700">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Nome</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">CNPJ</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Município</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Telefone</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-gray-800 divide-y divide-gray-700">
                                    {currentItems.map((sacado) => (
                                        <tr key={sacado.id} onClick={() => handleOpenEditModal(sacado)} className="hover:bg-gray-700 cursor-pointer">
                                            <td className="px-6 py-4 text-sm font-medium text-gray-100">{sacado.nome}</td>
                                            <td className="px-6 py-4 text-sm text-gray-400">{formatCnpjCpf(sacado.cnpj)}</td>
                                            <td className="px-6 py-4 text-sm text-gray-400">{sacado.municipio ? `${sacado.municipio} - ${sacado.uf}`: ''}</td>
                                            <td className="px-6 py-4 text-sm text-gray-400">{formatTelefone(sacado.fone)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                    <Pagination totalItems={filteredSacados.length} itemsPerPage={ITEMS_PER_PAGE} currentPage={currentPage} onPageChange={paginate} />
                </div>
            </div>
        </main>
    );
}