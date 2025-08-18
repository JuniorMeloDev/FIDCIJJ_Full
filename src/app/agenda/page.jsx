'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { FaPlus, FaTrash } from 'react-icons/fa';
import { formatDate } from '@/app/utils/formatters';
import Notification from '@/app/components/Notification';
import AnotacaoModal from '@/app/components/AnotacaoModal';
import ConfirmacaoModal from '@/app/components/ConfirmacaoModal';
import AnotacaoActionsBar from '@/app/components/AnotacaoActionsBar'; // Importe a nova barra

export default function AgendaPage() {
    const [anotacoes, setAnotacoes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingAnotacao, setEditingAnotacao] = useState(null);
    const [notification, setNotification] = useState({ message: '', type: '' });
    const [itemParaExcluir, setItemParaExcluir] = useState(null);
    
    // Estados para seleção e menu de contexto
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedItems, setSelectedItems] = useState(new Set());
    const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, selectedItem: null });
    const menuRef = useRef(null);

    const [filters, setFilters] = useState({
        dataInicio: '',
        dataFim: '',
        assunto: '',
    });

    const getAuthHeader = () => {
        const token = sessionStorage.getItem('authToken');
        return token ? { 'Authorization': `Bearer ${token}` } : {};
    };

    const showNotification = (message, type) => {
        setNotification({ message, type });
        setTimeout(() => setNotification({ message: '', type: '' }), 5000);
    };

    const fetchAnotacoes = async () => {
        setLoading(true);
        const params = new URLSearchParams(filters);
        try {
            const response = await fetch(`/api/agenda?${params.toString()}`, { headers: getAuthHeader() });
            if (!response.ok) throw new Error('Falha ao carregar anotações.');
            const data = await response.json();
            setAnotacoes(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const handler = setTimeout(() => {
            fetchAnotacoes();
        }, 500);
        return () => clearTimeout(handler);
    }, [filters]);
    
    useEffect(() => {
        const handleClickOutside = () => setContextMenu({ ...contextMenu, visible: false });
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, [contextMenu]);

    const handleSave = async (anotacaoData) => {
        const isUpdating = !!anotacaoData.id;
        const url = isUpdating ? `/api/agenda/${anotacaoData.id}` : '/api/agenda';
        const method = isUpdating ? 'PUT' : 'POST';

        try {
            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
                body: JSON.stringify(anotacaoData),
            });
            if (!response.ok) throw new Error(`Falha ao ${isUpdating ? 'atualizar' : 'criar'} anotação.`);
            showNotification(`Anotação ${isUpdating ? 'atualizada' : 'criada'} com sucesso!`, 'success');
            setIsModalOpen(false);
            fetchAnotacoes();
        } catch (err) {
            showNotification(err.message, 'error');
        }
    };
    
    const handleFilterChange = (e) => {
        setFilters(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const clearFilters = () => {
        setFilters({ dataInicio: '', dataFim: '', assunto: '' });
    };

    const handleToggleSelection = (id) => {
        setSelectedItems(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) {
                newSet.delete(id);
            } else {
                newSet.add(id);
            }
            // Sai do modo de seleção se não houver mais itens selecionados
            if (newSet.size === 0) {
                setIsSelectionMode(false);
            }
            return newSet;
        });
    };

    const handleDeleteRequest = (ids) => {
        const idsToDelete = Array.isArray(ids) ? ids : [ids];
        if (idsToDelete.length === 0) return;
        setItemParaExcluir(idsToDelete);
        setIsModalOpen(false);
    };

    const handleConfirmDelete = async () => {
        if (!itemParaExcluir) return;
        try {
            const response = await fetch('/api/agenda', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
                body: JSON.stringify({ ids: itemParaExcluir }),
            });
            if (!response.ok) throw new Error('Falha ao excluir anotação(ões).');
            showNotification('Anotação(ões) excluída(s) com sucesso!', 'success');
            fetchAnotacoes();
            clearSelection();
        } catch (err) {
            showNotification(err.message, 'error');
        } finally {
            setItemParaExcluir(null);
        }
    };
    
    const clearSelection = () => {
        setSelectedItems(new Set());
        setIsSelectionMode(false);
    };

    const handleContextMenu = (event, item) => {
        event.preventDefault();
        setContextMenu({ visible: true, x: event.pageX, y: event.pageY, selectedItem: item });
    };

    return (
        <main className="min-h-screen flex flex-col pt-16 p-6 bg-gradient-to-br from-gray-900 to-gray-800 text-white">
            <Notification message={notification.message} type={notification.type} onClose={() => setNotification({ message: '', type: '' })} />
            <AnotacaoModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSave={handleSave} anotacao={editingAnotacao} onDelete={(id) => handleDeleteRequest([id])} />
            <ConfirmacaoModal 
                isOpen={!!itemParaExcluir} 
                onClose={() => setItemParaExcluir(null)} 
                onConfirm={handleConfirmDelete}
                title="Confirmar Exclusão"
                message={`Tem certeza que deseja excluir ${itemParaExcluir?.length} anotação(ões)?`}
            />

            <motion.header 
                className="mb-6 border-b-2 border-orange-500 pb-4 flex justify-between items-center flex-shrink-0"
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
            >
                <h1 className="text-3xl font-bold">Agenda de Anotações</h1>
                <button onClick={() => { setEditingAnotacao(null); setIsModalOpen(true); }} className="bg-orange-500 text-white font-semibold py-2 px-4 rounded-md hover:bg-orange-600 transition flex items-center gap-2">
                    <FaPlus /> Nova Anotação
                </button>
            </motion.header>

            {/* Filtros */}
            <div className="bg-gray-800 p-4 rounded-lg shadow-md mb-6 grid grid-cols-1 md:grid-cols-4 gap-4 items-end flex-shrink-0">
                <div>
                    <label className="text-sm">De:</label>
                    <input type="date" name="dataInicio" value={filters.dataInicio} onChange={handleFilterChange} className="w-full bg-gray-700 p-2 rounded" />
                </div>
                <div>
                    <label className="text-sm">Até:</label>
                    <input type="date" name="dataFim" value={filters.dataFim} onChange={handleFilterChange} className="w-full bg-gray-700 p-2 rounded" />
                </div>
                <div>
                    <label className="text-sm">Assunto:</label>
                    <input type="text" name="assunto" placeholder="Filtrar por assunto..." value={filters.assunto} onChange={handleFilterChange} className="w-full bg-gray-700 p-2 rounded" />
                </div>
                <button onClick={clearFilters} className="bg-gray-600 hover:bg-gray-500 text-white font-semibold py-2 px-4 rounded-md transition">Limpar Filtros</button>
            </div>
            
            {/* Área de Rolagem das Anotações */}
            <div className="flex-grow overflow-y-auto pr-2">
                {loading ? <p className="text-center pt-10">Carregando...</p> : error ? <p className="text-red-500 text-center pt-10">{error}</p> : (
                    <>
                        {anotacoes.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {anotacoes.map(anotacao => (
                                    <motion.div 
                                        key={anotacao.id}
                                        className={`bg-gray-800 p-5 rounded-lg shadow-lg border-l-4 ${selectedItems.has(anotacao.id) ? 'border-blue-500 ring-2 ring-blue-500' : 'border-orange-500'} cursor-pointer hover:shadow-orange-400/20 relative`}
                                        onClick={() => {
                                            if (isSelectionMode) {
                                                handleToggleSelection(anotacao.id);
                                            } else {
                                                setEditingAnotacao(anotacao); setIsModalOpen(true);
                                            }
                                        }}
                                        onContextMenu={(e) => handleContextMenu(e, anotacao)}
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.3 }}
                                    >
                                        {isSelectionMode && (
                                            <input
                                                type="checkbox"
                                                checked={selectedItems.has(anotacao.id)}
                                                readOnly
                                                className="absolute top-4 right-4 h-5 w-5 rounded text-orange-500 bg-gray-700 border-gray-600 focus:ring-orange-500 pointer-events-none"
                                            />
                                        )}
                                        <div className="flex justify-between items-start">
                                            <h3 className="text-xl font-bold text-orange-400">{anotacao.assunto}</h3>
                                            <span className="text-sm text-gray-400">{formatDate(anotacao.data)}</span>
                                        </div>
                                        <p className="mt-3 text-gray-300 whitespace-pre-wrap">{anotacao.conteudo}</p>
                                    </motion.div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-10 text-gray-400">Nenhuma anotação encontrada.</div>
                        )}
                    </>
                )}
            </div>

            {/* Barra de Ações na parte inferior */}
            {isSelectionMode && (
                <AnotacaoActionsBar
                    selectedCount={selectedItems.size}
                    onDelete={() => handleDeleteRequest(Array.from(selectedItems))}
                    onClear={clearSelection}
                />
            )}
            
            {/* Menu de Contexto */}
            {contextMenu.visible && (
                <div ref={menuRef} style={{ top: contextMenu.y, left: contextMenu.x }} className="absolute origin-top-right w-48 rounded-md shadow-lg bg-gray-700 ring-1 ring-black ring-opacity-5 z-50">
                    <div className="py-1" onClick={(e) => e.stopPropagation()}>
                        <a href="#" onClick={(e) => { e.preventDefault(); setIsSelectionMode(true); handleToggleSelection(contextMenu.selectedItem.id); }} className="block px-4 py-2 text-sm text-gray-200 hover:bg-gray-600">
                            {isSelectionMode ? 'Adicionar à Seleção' : 'Selecionar'}
                        </a>
                        <div className="border-t border-gray-600 my-1"></div>
                        <a href="#" onClick={(e) => { e.preventDefault(); handleDeleteRequest([contextMenu.selectedItem.id]); }} className="block px-4 py-2 text-sm text-red-400 hover:bg-gray-600">
                            Excluir
                        </a>
                    </div>
                </div>
            )}
        </main>
    );
}