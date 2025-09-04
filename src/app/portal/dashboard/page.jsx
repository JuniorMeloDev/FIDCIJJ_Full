'use client'

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { jwtDecode } from "jwt-decode";
import { formatBRLNumber, formatDate } from "@/app/utils/formatters";
import { FaChevronRight } from "react-icons/fa";
import Pagination from "@/app/components/Pagination"; // Importe o componente de paginação

const ITEMS_PER_PAGE = 5; // Define quantos itens por página na tabela de operações

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
            Pendente: "bg-yellow-500 text-white",
            Aprovada: "bg-green-500 text-white",
            Rejeitada: "bg-red-500 text-white",
        };
        return <span className={`inline-block px-2 py-1 text-xs font-semibold rounded-full ${styles[status] || 'bg-gray-500'}`}>{status}</span>;
    };

    return (
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg mt-8">
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
                                    <tr onClick={() => toggleRow(op.id)} className="cursor-pointer hover:bg-gray-700/50">
                                        <td className="px-4 py-4"><FaChevronRight className={`transform transition-transform ${expandedRow === op.id ? 'rotate-90' : ''}`} /></td>
                                        <td className="px-6 py-4 font-medium">#{op.id}</td>
                                        <td className="px-6 py-4">{formatDate(op.data_operacao)}</td>
                                        <td className="px-6 py-4 text-right">{formatBRLNumber(op.valor_total_bruto)}</td>
                                        <td className="px-6 py-4 text-right">{formatBRLNumber(op.valor_liquido)}</td>
                                        <td className="px-6 py-4 text-center">{getStatusTag(op.status)}</td>
                                    </tr>
                                    {expandedRow === op.id && ( /* Detalhes da Operação */ )}
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

// --- Subcomponente para a Aba "Acompanhamento" (Placeholder) ---
const AcompanhamentoView = () => (
    <div className="bg-gray-800 p-6 rounded-lg shadow-lg mt-8 text-center">
        <h2 className="text-xl font-semibold mb-4 text-white">Acompanhamento de Duplicatas</h2>
        <p className="text-gray-400">Em breve: Acompanhe suas duplicatas liquidadas, a vencer e vencidas, além de gráficos de performance.</p>
    </div>
);


// --- Componente Principal da Página ---
export default function ClientDashboardPage() {
    const [operacoes, setOperacoes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [clienteNome, setClienteNome] = useState('');
    const [activeView, setActiveView] = useState('operacoes');

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
                const token = sessionStorage.getItem('authToken');
                if (token) {
                    const decodedToken = jwtDecode(token);
                    setClienteNome(decodedToken.cliente_nome || '');
                }

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
            className={`py-2 px-5 rounded-md text-sm font-semibold transition-colors ${
                currentView === viewName ? 'bg-orange-500 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
        >
            {children}
        </button>
    );

    return (
        <div className="text-gray-200">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-3xl font-bold text-white">Portal do Cliente</h1>
                    <Link href="/portal/enviar-operacao" className="bg-orange-500 text-white font-semibold py-2 px-4 rounded-md hover:bg-orange-600 transition">
                        + Enviar Nova Operação
                    </Link>
                </div>

                <div className="flex space-x-2 border-b border-gray-700 pb-4">
                    <TabButton viewName="operacoes" currentView={activeView} setView={setActiveView}>Minhas Operações</TabButton>
                    <TabButton viewName="duplicatas" currentView={activeView} setView={setActiveView}>Acompanhamento de Duplicatas</TabButton>
                </div>

                {activeView === 'operacoes' && (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-8">
                            <div className="bg-gray-800 p-5 rounded-lg shadow-lg border-l-4 border-green-500">
                                <h3 className="text-sm font-medium text-gray-400">Limite Disponível</h3>
                                <p className="text-3xl font-bold mt-2">{formatBRLNumber(kpis.limiteDisponivel)}</p>
                            </div>
                            <div className="bg-gray-800 p-5 rounded-lg shadow-lg border-l-4 border-blue-500">
                                <h3 className="text-sm font-medium text-gray-400">Total a Vencer</h3>
                                <p className="text-3xl font-bold mt-2">{formatBRLNumber(kpis.totalAVencer)}</p>
                            </div>
                            <div className="bg-gray-800 p-5 rounded-lg shadow-lg border-l-4 border-purple-500">
                                <h3 className="text-sm font-medium text-gray-400">Taxa Média</h3>
                                <p className="text-3xl font-bold mt-2">{kpis.taxaMedia.toFixed(2)}%</p>
                            </div>
                            <div className="bg-gray-800 p-5 rounded-lg shadow-lg border-l-4 border-yellow-500">
                                <h3 className="text-sm font-medium text-gray-400">Prazo Médio</h3>
                                <p className="text-3xl font-bold mt-2">{kpis.prazoMedio} dias</p>
                            </div>
                        </div>
                        <MinhasOperacoesView operacoes={operacoes} loading={loading} error={error} />
                    </>
                )}

                {activeView === 'duplicatas' && (
                    <AcompanhamentoView />
                )}
            </div>
        </div>
    );
}