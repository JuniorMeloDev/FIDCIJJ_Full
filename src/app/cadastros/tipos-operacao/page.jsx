'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import Pagination from '@/app/components/Pagination';
import Notification from '@/app/components/Notification';
import FiltroLateralTiposOperacao from '@/app/components/FiltroLateralTiposOperacao';
import EditTipoOperacaoModal from '@/app/components/EditTipoOperacaoModal';
import ConfirmacaoModal from '@/app/components/ConfirmacaoModal';
import { formatBRLNumber } from '@/app/utils/formatters';
import useAuth from '@/app/hooks/useAuth';
import { API_URL } from '../../apiConfig';

const ITEMS_PER_PAGE = 7;

export default function TiposOperacaoPage() {
    const { isAdmin } = useAuth();
    const [tiposOperacao, setTiposOperacao] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingOperacao, setEditingOperacao] = useState(null);
    const [notification, setNotification] = useState({ message: '', type: '' });
    const [filters, setFilters] = useState({ nome: '' });
    
    const [operacaoParaExcluir, setOperacaoParaExcluir] = useState(null);

    const getAuthHeader = () => {
        const token = sessionStorage.getItem('authToken');
        return token ? { 'Authorization': `Bearer ${token}` } : {};
    };

    const showNotification = (message, type) => {
        setNotification({ message, type });
        setTimeout(() => setNotification({ message: '', type: '' }), 5000);
    };

    const fetchTiposOperacao = async () => {
        setLoading(true);
        try {
            const response = await fetch(`${API_URL}/cadastros/tipos-operacao`, { headers: getAuthHeader() });
            if (!response.ok) throw new Error('Falha ao carregar os tipos de operação.');
            setTiposOperacao(await response.json());
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTiposOperacao();
    }, []);

    const filteredItems = useMemo(() => {
        return tiposOperacao.filter(item => 
            item.nome.toLowerCase().includes(filters.nome.toLowerCase())
        );
    }, [filters, tiposOperacao]);

    const handleFilterChange = (e) => {
        setCurrentPage(1);
        setFilters({ ...filters, [e.target.name]: e.target.value });
    };

    const clearFilters = () => {
        setCurrentPage(1);
        setFilters({ nome: '' });
    };

    const handleOpenAddModal = () => {
        setEditingOperacao(null);
        setIsModalOpen(true);
    };

    const handleOpenEditModal = (item) => {
        setEditingOperacao(item);
        setIsModalOpen(true);
    };

    const handleSave = async (id, data) => {
        const isUpdating = !!id;
        const url = isUpdating ? `${API_URL}/cadastros/tipos-operacao/${id}` : `${API_URL}/cadastros/tipos-operacao`;
        const method = isUpdating ? 'PUT' : 'POST';

        try {
            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
                body: JSON.stringify(data),
            });
            if (!response.ok) throw new Error(`Falha ao ${isUpdating ? 'atualizar' : 'criar'} tipo de operação.`);
            
            showNotification(`Operação ${isUpdating ? 'atualizada' : 'criada'} com sucesso!`, 'success');
            setIsModalOpen(false);
            await fetchTiposOperacao();
        } catch (err) {
            showNotification(err.message, 'error');
        }
    };

    const handleDeleteRequest = (id) => {
        const operacao = tiposOperacao.find(op => op.id === id);
        setOperacaoParaExcluir(operacao);
    };
    
    const handleConfirmarExclusao = async () => {
        if (!operacaoParaExcluir) return;
        try {
            const response = await fetch(`${API_URL}/cadastros/tipos-operacao/${operacaoParaExcluir.id}`, { 
                method: 'DELETE',
                headers: getAuthHeader()
            });
            if (!response.ok) throw new Error('Falha ao excluir. Este tipo de operação pode estar em uso.');
            showNotification('Tipo de operação excluído com sucesso!', 'success');
            await fetchTiposOperacao();
        } catch (err) {
            showNotification(err.message, 'error');
        } finally {
            setOperacaoParaExcluir(null);
            setIsModalOpen(false);
        }
    };

    const indexOfLastItem = currentPage * ITEMS_PER_PAGE;
    const indexOfFirstItem = indexOfLastItem - ITEMS_PER_PAGE;
    const currentItems = filteredItems.slice(indexOfFirstItem, indexOfLastItem);
    const paginate = (pageNumber) => setCurrentPage(pageNumber);

    return (
        <main className="min-h-screen pt-16 p-6 bg-gradient-to-br from-gray-900 to-gray-800 text-white">
            <Notification message={notification.message} type={notification.type} onClose={() => setNotification({ message: '', type: '' })} />
            <EditTipoOperacaoModal 
                isOpen={isModalOpen} 
                onClose={() => setIsModalOpen(false)} 
                onSave={handleSave} 
                onDelete={handleDeleteRequest}
                tipoOperacao={editingOperacao} 
            />
            <ConfirmacaoModal
                isOpen={!!operacaoParaExcluir}
                onClose={() => setOperacaoParaExcluir(null)}
                onConfirm={handleConfirmarExclusao}
                title="Confirmar Exclusão"
                message={`Deseja excluir o tipo de operação "${operacaoParaExcluir?.nome}"?`}
            />
            
            <motion.header 
                className="mb-4 border-b-2 border-orange-500 pb-4"
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
            >
                <h1 className="text-3xl font-bold">Cadastros</h1>
                <p className="text-sm text-gray-300">Gestão de Clientes, Sacados e Tipos de Operação</p>
            </motion.header>
            <div className="mb-4 border-b border-gray-700">
                <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                    <Link href="/cadastros/clientes" className="border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-300 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm">
                        Clientes (Cedentes)
                    </Link>
                    <Link href="/cadastros/sacados" className="border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-300 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm">
                        Sacados (Devedores)
                    </Link>
                    <Link href="/cadastros/tipos-operacao" className="border-orange-500 text-orange-400 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm">
                        Tipos de Operação
                    </Link>
                    {isAdmin && (
                        <Link href="/cadastros/usuarios" className="border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-300 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm">
                            Usuários
                        </Link>
                    )}
                </nav>
            </div>

            <div className="flex-grow flex flex-col lg:flex-row gap-6">
                <FiltroLateralTiposOperacao filters={filters} onFilterChange={handleFilterChange} onClear={clearFilters} />
                <div className="flex-grow bg-gray-800 p-4 rounded-lg shadow-md flex flex-col">
                    <div className="flex justify-end mb-4">
                        <button onClick={handleOpenAddModal} className="bg-orange-500 text-white font-semibold py-2 px-4 rounded-md shadow-sm hover:bg-orange-600 transition">Nova Operação</button>
                    </div>
                    <div className="overflow-auto">
                        {loading ? <p className="text-center py-10 text-gray-400">A carregar...</p> : error ? <p className="text-red-400 text-center py-10">{error}</p> : (
                            <table className="min-w-full divide-y divide-gray-700">
                                <thead className="bg-gray-700">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Nome</th>
                                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase">Taxa (%)</th>
                                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase">Valor Fixo</th>
                                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase">Desp. Bancárias</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-gray-800 divide-y divide-gray-700">
                                    {currentItems.map((item) => (
                                        <tr key={item.id} onClick={() => handleOpenEditModal(item)} className="hover:bg-gray-700 cursor-pointer">
                                            <td className="px-6 py-4 text-sm font-medium text-gray-100">{item.nome}</td>
                                            <td className="px-6 py-4 text-sm text-gray-400 text-right">{item.taxaJuros.toFixed(2)}%</td>
                                            <td className="px-6 py-4 text-sm text-gray-400 text-right">{formatBRLNumber(item.valorFixo)}</td>
                                            <td className="px-6 py-4 text-sm text-gray-400 text-right">{formatBRLNumber(item.despesasBancarias)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                    <Pagination totalItems={filteredItems.length} itemsPerPage={ITEMS_PER_PAGE} currentPage={currentPage} onPageChange={paginate} />
                </div>
            </div>
        </main>
    );
}