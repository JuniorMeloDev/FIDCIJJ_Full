'use client'

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { jwtDecode } from "jwt-decode";
import { formatBRLNumber, formatDate } from "@/app/utils/formatters";
import { FaChevronRight, FaHourglassHalf, FaCheckCircle, FaTimesCircle, FaCheck, FaExclamationCircle, FaClock, FaCloudUploadAlt, FaDownload, FaSort, FaSortUp, FaSortDown } from "react-icons/fa";
import Pagination from "@/app/components/Pagination";

const ITEMS_PER_PAGE_OPERATIONS = 5;
const ITEMS_PER_PAGE_DUPLICATAS = 10;

// ===================================================================
//  Hook Genérico para Ordenação de Tabelas
// ===================================================================
const useSortableData = (items, initialConfig = { key: null, direction: 'DESC' }) => {
    const [sortConfig, setSortConfig] = useState(initialConfig);

    const sortedItems = useMemo(() => {
        let sortableItems = [...items];
        if (sortConfig.key !== null) {
            sortableItems.sort((a, b) => {
                const valA = a[sortConfig.key];
                const valB = b[sortConfig.key];
                if (valA === null || valA === undefined) return 1;
                if (valB === null || valB === undefined) return -1;
                if (valA < valB) return sortConfig.direction === 'ASC' ? -1 : 1;
                if (valA > valB) return sortConfig.direction === 'ASC' ? 1 : -1;
                return 0;
            });
        }
        return sortableItems;
    }, [items, sortConfig]);

    const requestSort = (key) => {
        let direction = 'ASC';
        if (sortConfig.key === key && sortConfig.direction === 'ASC') {
            direction = 'DESC';
        }
        setSortConfig({ key, direction });
    };
    
    const getSortIcon = (key) => {
        if (sortConfig.key !== key) return <FaSort className="inline-block ml-1 text-gray-500" />;
        if (sortConfig.direction === 'ASC') return <FaSortUp className="inline-block ml-1" />;
        return <FaSortDown className="inline-block ml-1" />;
    };

    return { items: sortedItems, requestSort, getSortIcon };
};

// ===================================================================
//  Subcomponente para a Aba "Minhas Operações"
// ===================================================================
// AQUI ESTÁ A CORREÇÃO: O nome do componente foi alterado para MinhasOperacoesView
const MinhasOperacoesView = ({ operacoes, duplicatas, kpis, loading, error }) => {
    const [expandedRow, setExpandedRow] = useState(null);
    const [currentPageOperacoes, setCurrentPageOperacoes] = useState(1);
    const [currentPageDuplicatas, setCurrentPageDuplicatas] = useState(1);

    const { items: sortedOperacoes, requestSort: requestSortOperacoes, getSortIcon: getSortIconOperacoes } = useSortableData(operacoes, { key: 'data_operacao', direction: 'DESC' });
    const { items: sortedDuplicatas, requestSort: requestSortDuplicatas, getSortIcon: getSortIconDuplicatas } = useSortableData(duplicatas, { key: 'data_vencimento', direction: 'DESC' });

    const currentOperacoes = sortedOperacoes.slice((currentPageOperacoes - 1) * ITEMS_PER_PAGE_OPERATIONS, currentPageOperacoes * ITEMS_PER_PAGE_OPERATIONS);
    const currentDuplicatas = sortedDuplicatas.slice((currentPageDuplicatas - 1) * ITEMS_PER_PAGE_DUPLICATAS, currentPageDuplicatas * ITEMS_PER_PAGE_DUPLICATAS);

    const getStatusTag = (status) => {
        const styles = { Pendente: "bg-orange-800 text-amber-100", Aprovada: "bg-green-800 text-green-100", Rejeitada: "bg-red-800 text-red-100" };
        const icons = { Pendente: <FaHourglassHalf />, Aprovada: <FaCheckCircle />, Rejeitada: <FaTimesCircle /> };
        return <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${styles[status] || 'bg-gray-600'}`}>{icons[status]} {status}</span>;
    };
    
    const getDuplicataStatusTag = (dup) => {
        if (dup.status_recebimento === 'Recebido') {
            return <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-800 text-blue-100"><FaCheck /> Liquidada</span>;
        }
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        const vencimento = new Date(dup.data_vencimento + 'T00:00:00-03:00');
        const diffTime = vencimento - hoje;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays < 0) {
            return <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-red-900 text-red-200"><FaExclamationCircle /> Vencida ({Math.abs(diffDays)} dia{Math.abs(diffDays) > 1 ? 's' : ''})</span>;
        }
        return <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-sky-900 text-sky-100"><FaClock /> A Vencer</span>;
    };

    return (
        <>
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

            <div className="bg-gray-800 p-6 rounded-lg shadow-lg mb-8">
                <h2 className="text-xl font-semibold mb-4 text-white">Histórico de Operações</h2>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-700">
                        <thead className="bg-gray-700/50">
                            <tr>
                                <th className="w-12"></th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer" onClick={() => requestSortOperacoes('id')}>ID{getSortIconOperacoes('id')}</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer" onClick={() => requestSortOperacoes('data_operacao')}>Data de Envio{getSortIconOperacoes('data_operacao')}</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer" onClick={() => requestSortOperacoes('valor_total_bruto')}>Valor Bruto{getSortIconOperacoes('valor_total_bruto')}</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer" onClick={() => requestSortOperacoes('valor_liquido')}>Valor Líquido{getSortIconOperacoes('valor_liquido')}</th>
                                <th className="px-6 py-3 text-center text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer" onClick={() => requestSortOperacoes('status')}>Status{getSortIconOperacoes('status')}</th>
                            </tr>
                        </thead>
                        <tbody className="bg-gray-800 divide-y divide-gray-700">
                            {loading ? <tr><td colSpan="6" className="text-center py-8">Carregando...</td></tr> :
                             currentOperacoes.map(op => (
                                <React.Fragment key={op.id}>
                                    <tr onClick={() => setExpandedRow(expandedRow === op.id ? null : op.id)} className={`cursor-pointer hover:bg-gray-700/50 ${expandedRow === op.id ? 'bg-gray-700/50' : ''}`}>
                                        <td className="px-4 py-4"><FaChevronRight className={`text-gray-500 transition-transform duration-300 ${expandedRow === op.id ? 'rotate-90' : ''}`} /></td>
                                        <td className="px-6 py-4 font-medium text-white">#{op.id}</td>
                                        <td className="px-6 py-4 text-gray-300">{formatDate(op.data_operacao)}</td>
                                        <td className="px-6 py-4 text-right text-gray-300">{formatBRLNumber(op.valor_total_bruto)}</td>
                                        <td className="px-6 py-4 text-right text-gray-300">{formatBRLNumber(op.valor_liquido)}</td>
                                        <td className="px-6 py-4 text-center">{getStatusTag(op.status)}</td>
                                    </tr>
                                    {expandedRow === op.id && ( /* Detalhes podem ser adicionados aqui */ )}
                                </React.Fragment>
                             ))}
                        </tbody>
                    </table>
                </div>
                <Pagination totalItems={operacoes.length} itemsPerPage={ITEMS_PER_PAGE_OPERATIONS} currentPage={currentPageOperacoes} onPageChange={setCurrentPageOperacoes} />
            </div>
            
            <div className="bg-gray-800 p-6 rounded-lg shadow-lg mb-8">
                 <h2 className="text-xl font-semibold mb-4 text-white">Acompanhamento de Duplicatas</h2>
                 <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-700">
                        <thead className="bg-gray-700/50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer" onClick={() => requestSortDuplicatas('nf_cte')}>NF/CT-e{getSortIconDuplicatas('nf_cte')}</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer" onClick={() => requestSortDuplicatas('cliente_sacado')}>Sacado{getSortIconDuplicatas('cliente_sacado')}</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer" onClick={() => requestSortDuplicatas('data_vencimento')}>Vencimento{getSortIconDuplicatas('data_vencimento')}</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer" onClick={() => requestSortDuplicatas('valor_bruto')}>Valor{getSortIconDuplicatas('valor_bruto')}</th>
                                <th className="px-6 py-3 text-center text-xs font-medium text-gray-300 uppercase">Status</th>
                            </tr>
                        </thead>
                         <tbody className="bg-gray-800 divide-y divide-gray-700">
                             {loading ? <tr><td colSpan="5" className="text-center py-8">Carregando...</td></tr> :
                              currentDuplicatas.map(d => (
                                 <tr key={d.id}>
                                     <td className="px-6 py-4 font-medium text-white">{d.nf_cte}</td>
                                     <td className="px-6 py-4 text-gray-300">{d.cliente_sacado}</td>
                                     <td className={`px-6 py-4 ${new Date(d.data_vencimento + 'T00:00:00-03:00') < new Date() && d.status_recebimento !== 'Recebido' ? 'text-red-400 font-semibold' : 'text-gray-300'}`}>{formatDate(d.data_vencimento)}</td>
                                     <td className="px-6 py-4 text-right text-gray-300">{formatBRLNumber(d.valor_bruto)}</td>
                                     <td className="px-6 py-4 text-center">{getDuplicataStatusTag(d)}</td>
                                 </tr>
                             ))}
                         </tbody>
                    </table>
                 </div>
                 <Pagination totalItems={duplicatas.length} itemsPerPage={ITEMS_PER_PAGE_DUPLICATAS} currentPage={currentPageDuplicatas} onPageChange={setCurrentPageDuplicatas} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
                    <h3 className="text-lg font-semibold text-white mb-4">Volume Operado (Últimos 6 Meses)</h3>
                    <div className="text-center text-gray-400 py-10">[Gráfico de Volume Operado]</div>
                </div>
                <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
                    <h3 className="text-lg font-semibold text-white mb-4">Maiores Sacados</h3>
                    <div className="text-center text-gray-400 py-10">[Gráfico de Maiores Sacados]</div>
                </div>
            </div>
        </>
    );
};

// ===================================================================
//  Subcomponente para a Aba "Enviar Nova Operação"
// ===================================================================
const NovaOperacaoView = () => {
    return (
        <div className="bg-gray-800 p-8 rounded-lg shadow-lg">
            <h2 className="text-2xl font-semibold text-white mb-2">Enviar Nova Operação</h2>
            <p className="text-gray-400 mb-6">Faça o upload dos arquivos XML (NF-e) ou PDF (CT-e) para análise.</p>
            <div className="mt-1 flex justify-center px-6 pt-10 pb-12 border-2 border-gray-600 border-dashed rounded-md cursor-pointer hover:border-orange-500 transition-all">
                <div className="space-y-1 text-center">
                    <FaCloudUploadAlt className="mx-auto h-12 w-12 text-gray-500" />
                    <div className="flex text-sm text-gray-400">
                        <label htmlFor="file-upload" className="relative cursor-pointer bg-gray-800 rounded-md font-medium text-orange-500 hover:text-orange-400 focus-within:outline-none">
                            <span>Selecione os Arquivos</span>
                            <input id="file-upload" name="file-upload" type="file" className="sr-only" multiple />
                        </label>
                        <p className="pl-1">ou arraste e solte aqui</p>
                    </div>
                    <p className="text-xs text-gray-500">XML ou PDF</p>
                </div>
            </div>
        </div>
    );
};

// ===================================================================
//  Componente Principal da Página
// ===================================================================
export default function ClientDashboardPage() {
    const [operacoes, setOperacoes] = useState([]);
    const [duplicatas, setDuplicatas] = useState([]);
    const [kpis, setKpis] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [activeView, setActiveView] = useState('consultas');

    useEffect(() => {
        const getAuthHeader = () => {
            const token = sessionStorage.getItem('authToken');
            return token ? { 'Authorization': `Bearer ${token}` } : {};
        };
        
        const fetchData = async () => {
            setLoading(true);
            setError(null);
            try {
                const headers = getAuthHeader();
                const [operacoesRes, duplicatasRes] = await Promise.all([
                    fetch('/api/portal/operacoes', { headers }),
                    fetch('/api/portal/duplicatas', { headers })
                ]);

                if (!operacoesRes.ok) throw new Error('Falha ao buscar suas operações.');
                if (!duplicatasRes.ok) throw new Error('Falha ao buscar suas duplicatas.');

                const operacoesData = await operacoesRes.json();
                const duplicatasData = await duplicatasRes.json();
                
                setOperacoes(operacoesData);
                setDuplicatas(duplicatasData);

                setKpis({
                    limiteDisponivel: 749250.00,
                    totalAVencer: 269500.00,
                    taxaMedia: 3.15,
                    prazoMedio: 28,
                });
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
            className={`font-semibold py-2 px-5 rounded-md transition-colors text-sm
                ${ currentView === viewName ? 'bg-orange-500 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600' }
            `}
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
                    {activeView === 'consultas' && kpis && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                            <MinhasOperacoesView 
                                operacoes={operacoes} 
                                duplicatas={duplicatas}
                                kpis={kpis}
                                loading={loading}
                                error={error} 
                            />
                        </motion.div>
                    )}

                    {activeView === 'nova-operacao' && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                            <NovaOperacaoView />
                        </motion.div>
                    )}
                </div>
            </div>
        </div>
    );
}