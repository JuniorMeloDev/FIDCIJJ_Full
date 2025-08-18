'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FaPlus, FaStickyNote } from 'react-icons/fa';
import { formatDate } from '@/app/utils/formatters';
import Notification from '@/app/components/Notification';
import AnotacaoModal from '@/app/components/AnotacaoModal';
import ConfirmacaoModal from '@/app/components/ConfirmacaoModal';

export default function AgendaPage() {
    const [anotacoes, setAnotacoes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingAnotacao, setEditingAnotacao] = useState(null);
    const [notification, setNotification] = useState({ message: '', type: '' });
    const [itemParaExcluir, setItemParaExcluir] = useState(null);

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

    return (
        <main className="min-h-screen pt-16 p-6 bg-gradient-to-br from-gray-900 to-gray-800 text-white">
            <Notification message={notification.message} type={notification.type} onClose={() => setNotification({ message: '', type: '' })} />
            <AnotacaoModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSave={handleSave} anotacao={editingAnotacao} />

            <motion.header 
                className="mb-6 border-b-2 border-orange-500 pb-4 flex justify-between items-center"
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
            >
                <h1 className="text-3xl font-bold">Agenda de Anotações</h1>
                <button onClick={() => { setEditingAnotacao(null); setIsModalOpen(true); }} className="bg-orange-500 text-white font-semibold py-2 px-4 rounded-md hover:bg-orange-600 transition flex items-center gap-2">
                    <FaPlus /> Nova Anotação
                </button>
            </motion.header>

            {/* Filtros */}
            <div className="bg-gray-800 p-4 rounded-lg shadow-md mb-6 grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
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


            {loading ? <p>Carregando...</p> : error ? <p className="text-red-500">{error}</p> : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {anotacoes.map(anotacao => (
                        <motion.div 
                            key={anotacao.id}
                            className="bg-gray-800 p-5 rounded-lg shadow-lg border-l-4 border-orange-500 cursor-pointer hover:shadow-orange-400/20"
                            onClick={() => { setEditingAnotacao(anotacao); setIsModalOpen(true); }}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3 }}
                        >
                            <div className="flex justify-between items-start">
                                <h3 className="text-xl font-bold text-orange-400">{anotacao.assunto}</h3>
                                <span className="text-sm text-gray-400">{formatDate(anotacao.data)}</span>
                            </div>
                            <p className="mt-3 text-gray-300 whitespace-pre-wrap">{anotacao.conteudo}</p>
                        </motion.div>
                    ))}
                </div>
            )}
             { !loading && anotacoes.length === 0 && <div className="text-center py-10 text-gray-400">Nenhuma anotação encontrada.</div>}
        </main>
    );
}