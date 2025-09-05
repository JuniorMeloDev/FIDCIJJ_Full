'use client'

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { jwtDecode } from "jwt-decode";
import { formatBRLNumber, formatDate } from "@/app/utils/formatters";
import { FaChevronRight, FaHourglassHalf, FaCheckCircle, FaTimesCircle, FaCheck, FaExclamationCircle, FaClock, FaCloudUploadAlt } from "react-icons/fa";
import Pagination from "@/app/components/Pagination";

const ITEMS_PER_PAGE = 5;

// --- Subcomponente para a Aba "Minhas Operações" ---
const MinhasOperacoesView = ({ operacoes, loading, error }) => {
    const [expandedRow, setExpandedRow] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);

    const toggleRow = (id) => setExpandedRow(expandedRow === id ? null : id);

    const indexOfLastItem = currentPage * ITEMS_PER_PAGE;
    const indexOfFirstItem = indexOfLastItem - ITEMS_PER_PAGE;
    const currentItems = operacoes.slice(indexOfFirstItem, indexOfLastItem);

    const getStatusTag = (status) => {
        const styles = {
            Pendente: "status-tag status-pendente",
            Aprovada: "status-tag status-aprovado",
            Rejeitada: "status-tag status-rejeitado",
        };
        const icons = {
            Pendente: <FaHourglassHalf />,
            Aprovada: <FaCheckCircle />,
            Rejeitada: <FaTimesCircle />,
        };
        return <span className={styles[status] || 'status-tag bg-gray-600'}><div className="w-4 h-4">{icons[status]}</div>{status}</span>;
    };

    return (
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg mb-8">
            <h2 className="text-xl font-semibold mb-4 text-white">Histórico de Operações</h2>
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-700">
                    <thead className="bg-gray-700/50">
                        <tr>
                            <th className="w-12"></th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">ID Operação</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Data de Envio</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase">Valor Bruto</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase">Valor Líquido</th>
                            <th className="px-6 py-3 text-center text-xs font-medium text-gray-300 uppercase">Status</th>
                        </tr>
                    </thead>
                    <tbody className="bg-gray-800 divide-y divide-gray-700">
                        {loading ? (
                            <tr><td colSpan="6" className="text-center py-8">Carregando...</td></tr>
                        ) : error ? (
                            <tr><td colSpan="6" className="text-center py-8 text-red-400">{error}</td></tr>
                        ) : currentItems.length === 0 ? (
                            <tr><td colSpan="6" className="text-center py-8">Nenhuma operação encontrada.</td></tr>
                        ) : (
                            currentItems.map(op => (
                                <React.Fragment key={op.id}>
                                    <tr onClick={() => toggleRow(op.id)} className={`cursor-pointer hover:bg-gray-700/50 ${expandedRow === op.id ? 'expanded' : ''}`}>
                                        <td className="px-4 py-4"><FaChevronRight className="expand-icon text-gray-500" /></td>
                                        <td className="px-6 py-4 font-medium">#{op.id}</td>
                                        <td className="px-6 py-4">{formatDate(op.data_operacao)}</td>
                                        <td className="px-6 py-4 text-right">{formatBRLNumber(op.valor_total_bruto)}</td>
                                        <td className="px-6 py-4 text-right">{formatBRLNumber(op.valor_liquido)}</td>
                                        <td className="px-6 py-4 text-center">{getStatusTag(op.status)}</td>
                                    </tr>
                                    <tr className={`details-row bg-gray-900/50 ${expandedRow === op.id ? 'show' : ''}`}>
                                        <td colSpan="6" className="p-0">
                                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="overflow-hidden p-4">
                                                <h4 className="font-semibold text-sm mb-2 text-orange-400">Detalhes da Operação #{op.id}</h4>
                                                {/* Detalhes da operação aqui */}
                                            </motion.div>
                                        </td>
                                    </tr>
                                </React.Fragment>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
            <Pagination totalItems={operacoes.length} itemsPerPage={ITEMS_PER_PAGE} currentPage={currentPage} onPageChange={setCurrentPage} />
        </div>
    );
};

// --- Componente Principal da Página ---
export default function ClientDashboardPage() {
    const [operacoes, setOperacoes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [activeView, setActiveView] = useState('consultas');

    const kpis = {
        limiteDisponivel: 749250.00,
        totalAVencer: 269500.00,
        taxaMedia: 3.15,
        prazoMedio: 28,
    };

    useEffect(() => {
        const getAuthHeader = () => {
            const token = sessionStorage.getItem('authToken');
            return token ? { 'Authorization': `Bearer ${token}` } : {};
        };
        
        const fetchData = async () => {
            setLoading(true);
            try {
                const response = await fetch('/api/portal/operacoes', { headers: getAuthHeader() });
                if (!response.ok) throw new Error('Falha ao buscar suas operações.');
                const data = await response.json();
                setOperacoes(data);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const TabButton = ({ viewName, currentView, setView, children }) => (
        <button
            onClick={() => setView(viewName)}
            className={`nav-button font-semibold py-2 px-5 rounded-md transition ${
                currentView === viewName ? 'active' : 'text-white'
            }`}
        >
            {children}
        </button>
    );

    return (
        <div className="pt-20">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="mb-6 bg-gray-800 p-2 rounded-lg inline-flex items-center space-x-2">
                    <TabButton viewName="consultas" currentView={activeView} setView={setActiveView}>Minhas Operações</TabButton>
                    <TabButton viewName="nova-operacao" currentView={activeView} setView={setActiveView}>Enviar Nova Operação</TabButton>
                </div>

                <div id="page-content">
                    {activeView === 'consultas' && (
                        <div id="view-consultas">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                                <div className="bg-gray-800 p-5 rounded-lg shadow-lg border-l-4 border-green-500">
                                    <h3 className="text-sm font-medium text-gray-400">Limite Disponível</h3>
                                    <p className="text-3xl font-bold text-white mt-2">{formatBRLNumber(kpis.limiteDisponivel)}</p>
                                </div>
                                <div className="bg-gray-800 p-5 rounded-lg shadow-lg border-l-4 border-blue-500">
                                    <h3 className="text-sm font-medium text-gray-400">Total a Vencer</h3>
                                    <p className="text-3xl font-bold text-white mt-2">{formatBRLNumber(kpis.totalAVencer)}</p>
                                </div>
                                <div className="bg-gray-800 p-5 rounded-lg shadow-lg border-l-4 border-purple-500">
                                    <h3 className="text-sm font-medium text-gray-400">Taxa Média</h3>
                                    <p className="text-3xl font-bold text-white mt-2">{kpis.taxaMedia.toFixed(2)}%</p>
                                </div>
                                <div className="bg-gray-800 p-5 rounded-lg shadow-lg border-l-4 border-yellow-500">
                                    <h3 className="text-sm font-medium text-gray-400">Prazo Médio</h3>
                                    <p className="text-3xl font-bold text-white mt-2">{kpis.prazoMedio} dias</p>
                                </div>
                            </div>
                            <MinhasOperacoesView operacoes={operacoes} loading={loading} error={error} />
                            {/* Aqui entrarão as outras seções do protótipo, como "Acompanhamento" e gráficos */}
                        </div>
                    )}

                    {activeView === 'nova-operacao' && (
                         <div id="view-nova-operacao">
                             <div className="bg-gray-800 p-8 rounded-lg shadow-lg">
                                 {/* O conteúdo da página /portal/enviar-operacao pode ser movido para cá */}
                                 <h2 className="text-2xl font-semibold text-white mb-2">Enviar Nova Operação</h2>
                                 <p className="text-gray-400 mb-6">Em breve: Faça o upload dos seus arquivos para análise.</p>
                             </div>
                         </div>
                    )}
                </div>
            </div>
        </div>
    );
}