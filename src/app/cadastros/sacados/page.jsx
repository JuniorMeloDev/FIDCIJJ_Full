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

const ITEMS_PER_PAGE = 10;

export default function SacadosPage() {
    const { isAdmin } = useAuth();
    const [sacados, setSacados] = useState([]);
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
            const response = await fetch(`/api/cadastros/sacados`, { headers: getAuthHeader() });
            if (!response.ok) throw new Error('Falha ao carregar sacados.');
            const data = await response.json();
            setSacados(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const groupedAndFilteredSacados = useMemo(() => {
        let items = [...sacados];

        // Adiciona o nome da matriz em cada filial para referência
        items.forEach(item => {
            if (item.matriz_id) {
                const matriz = items.find(m => m.id === item.matriz_id);
                item.matriz_nome = matriz ? matriz.nome : 'Matriz não encontrada';
            }
        });

        // Se houver filtros ativos, retorna a lista filtrada simples
        if (filters.nome || filters.cnpj) {
            return items.filter(sacado => {
                const nomeMatch = !filters.nome || sacado.nome.toLowerCase().includes(filters.nome.toLowerCase());
                const cnpjMatch = !filters.cnpj || (sacado.cnpj && sacado.cnpj.includes(filters.cnpj.replace(/\D/g, '')));
                return nomeMatch && cnpjMatch;
            });
        }
        
        // Lógica para agrupar matrizes e filiais
        const matrizes = {};
        const filiais = [];
        const outros = []; // Sacados que porventura tenham matriz_id inválido

        items.forEach(sacado => {
            if (sacado.matriz_id) {
                filiais.push(sacado);
            } else {
                matrizes[sacado.id] = { ...sacado, filiais: [] };
            }
        });

        filiais.forEach(filial => {
            if (matrizes[filial.matriz_id]) {
                matrizes[filial.matriz_id].filiais.push(filial);
            } else {
                outros.push(filial);
            }
        });

        const result = [];
        Object.values(matrizes).sort((a, b) => a.nome.localeCompare(b.nome)).forEach(matriz => {
            result.push(matriz);
            if (matriz.filiais.length > 0) {
                result.push(...matriz.filiais.sort((a, b) => a.cnpj.localeCompare(b.cnpj)));
            }
        });

        return [...result, ...outros];
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

    // Função para fechar o modal atual e abrir o da filial clicada
    const handleEditFilial = (filial) => {
        setIsModalOpen(false); // Fecha o modal da matriz
        const filialCompleta = sacados.find(s => s.id === filial.id);
        if (filialCompleta) {
            // Pequeno delay para garantir que o modal feche antes de abrir o próximo
            setTimeout(() => {
                handleOpenEditModal(filialCompleta);
            }, 50);
        }
    };

    const handleSaveSacado = async (id, data) => {
        try {
            const isUpdating = !!id;
            const url = isUpdating ? `/api/cadastros/sacados/${id}` : `/api/cadastros/sacados`;
            const method = isUpdating ? 'PUT' : 'POST';

            const payload = {
                ...data,
                // Remove o ID temporário das condições de pagamento antes de salvar
                condicoesPagamento: data.condicoesPagamento.map(({id, ...rest}) => rest)
            };

            const response = await fetch(url, { 
                method, 
                headers: { 'Content-Type': 'application/json', ...getAuthHeader() }, 
                body: JSON.stringify(payload) 
            });

            if (!response.ok) {
                const errorText = await response.json();
                throw new Error(errorText.message || 'Falha ao salvar o sacado.');
            }

            setIsModalOpen(false);
            await fetchData();
            showNotification(`Sacado ${isUpdating ? 'atualizado' : 'criado'} com sucesso!`, 'success');
            
            // Limpa os filtros e volta para a primeira página para ver o resultado
            clearFilters(); 
            setCurrentPage(1);

            return { success: true };
        } catch (err) {
            showNotification(err.message, 'error');
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
            const response = await fetch(`/api/cadastros/sacados/${sacadoParaExcluir.id}`, { 
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
    const currentItems = groupedAndFilteredSacados.slice(indexOfFirstItem, indexOfLastItem);
    const paginate = (pageNumber) => setCurrentPage(pageNumber);

    return (
        <main className="h-full p-6 bg-gradient-to-br from-gray-900 to-gray-800 text-white flex flex-col">
            <Notification message={notification.message} type={notification.type} onClose={() => setNotification({ message: '', type: '' })} />
            <EditSacadoModal 
                isOpen={isModalOpen} 
                onClose={() => setIsModalOpen(false)} 
                sacado={editingSacado} 
                onSave={handleSaveSacado} 
                onDelete={handleDeleteRequest}
                onEditFilial={handleEditFilial} // Passa a nova função
            />
            <ConfirmacaoModal isOpen={!!sacadoParaExcluir} onClose={() => setSacadoParaExcluir(null)} onConfirm={handleConfirmarExclusao} title="Confirmar Exclusão" message={`Deseja excluir o sacado "${sacadoParaExcluir?.nome}"?`} />

            <div className="flex-shrink-0">
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
            </div>
            
            <div className="flex-grow flex flex-col lg:flex-row gap-6 min-h-0">
                <FiltroLateralSacados filters={filters} onFilterChange={handleFilterChange} onClear={clearFilters} />
                <div className="flex-grow bg-gray-800 p-4 rounded-lg shadow-md flex flex-col min-h-0">
                    <div className="flex justify-end mb-4 flex-shrink-0">
                        <button onClick={handleOpenAddModal} className="bg-orange-500 text-white font-semibold py-2 px-4 rounded-md shadow-sm hover:bg-orange-600 transition">Novo Sacado</button>
                    </div>
                    <div className="flex-grow overflow-auto">
                        {loading ? <p className="text-center py-10 text-gray-400">A carregar...</p> : error ? <p className="text-red-400 text-center py-10">{error}</p> : (
                            <table className="min-w-full divide-y divide-gray-700">
                                <thead className="bg-gray-700 sticky top-0 z-10">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Nome</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">CNPJ</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Município</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Telefone</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-gray-800 divide-y divide-gray-700">
                                    {currentItems.map((sacado) => {
                                        const isFilial = !!sacado.matriz_id;
                                        return (
                                            <tr key={sacado.id} onClick={() => handleOpenEditModal(sacado)} className="hover:bg-gray-700 cursor-pointer">
                                                <td className={`px-6 py-4 text-sm font-medium ${isFilial ? 'pl-10' : 'font-bold'} text-gray-100`}>
                                                    {isFilial && <span className="mr-2 text-gray-500">↳</span>}
                                                    {sacado.nome}
                                                </td>
                                                <td className="px-6 py-4 text-sm text-gray-400 whitespace-nowrap">{formatCnpjCpf(sacado.cnpj)}</td>
                                                <td className="px-6 py-4 text-sm text-gray-400">{sacado.municipio ? `${sacado.municipio} - ${sacado.uf}`: ''}</td>
                                                <td className="px-6 py-4 text-sm text-gray-400 whitespace-nowrap">{formatTelefone(sacado.fone)}</td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                    <div className="flex-shrink-0 mt-4">
                        <Pagination totalItems={groupedAndFilteredSacados.length} itemsPerPage={ITEMS_PER_PAGE} currentPage={currentPage} onPageChange={paginate} />
                    </div>
                </div>
            </div>
        </main>
    );
}