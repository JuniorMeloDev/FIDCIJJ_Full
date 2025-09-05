'use client'

import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { jwtDecode } from "jwt-decode";
import { formatBRLNumber, formatDate } from "@/app/utils/formatters";
import { FaChevronRight, FaHourglassHalf, FaCheckCircle, FaTimesCircle, FaCheck, FaExclamationCircle, FaClock, FaCloudUploadAlt, FaDownload } from "react-icons/fa";
import Pagination from "@/app/components/Pagination";

const ITEMS_PER_PAGE = 5;

// ===================================================================
//  SUBCUMponente para a Aba "Minhas Operações"
// ===================================================================
const MinhasOperacoesView = ({ operacoes, loading, error }) => {
    const [expandedRow, setExpandedRow] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);

    const toggleRow = (id) => setExpandedRow(expandedRow === id ? null : id);

    const indexOfLastItem = currentPage * ITEMS_PER_PAGE;
    const indexOfFirstItem = indexOfLastItem - ITEMS_PER_PAGE;
    const currentItems = operacoes.slice(indexOfFirstItem, indexOfLastItem);

    const getStatusTag = (status) => {
        const styles = { Pendente: "status-pendente", Aprovada: "status-aprovado", Rejeitada: "status-rejeitado" };
        const icons = { Pendente: <FaHourglassHalf />, Aprovada: <FaCheckCircle />, Rejeitada: <FaTimesCircle /> };
        return <span className={`status-tag ${styles[status] || 'bg-gray-600'}`}>{icons[status]} {status}</span>;
    };
    
    // TODO: Adicionar dados reais para as duplicatas e gráficos
    const duplicatas = [
        { id: 1, nf: '5328.1', sacado: 'NUTRIOURO NUTRICAO ANIMAL', vencimento: '23/08/2025', valor: 35144.00, status: 'Liquidada' },
        { id: 2, nf: '5328.2', sacado: 'NUTRIOURO NUTRICAO ANIMAL', vencimento: '27/08/2025', valor: 35144.00, status: 'Vencida', diasAtraso: 1 },
        { id: 3, nf: '2068.3', sacado: 'INDUSTRIA DE RACOES DAS NEVES', vencimento: '26/08/2025', valor: 45402.00, status: 'A Vencer' },
    ];

    const getDuplicataStatusTag = (status, dias) => {
        const s = { Liquidada: "status-liquidado", Vencida: "status-vencida", 'A Vencer': "status-a-vencer" };
        const i = { Liquidada: <FaCheck />, Vencida: <FaExclamationCircle />, 'A Vencer': <FaClock /> };
        return <span className={`status-tag ${s[status]}`}>{i[status]} {status} {dias ? `(${dias} dia${dias > 1 ? 's' : ''})` : ''}</span>;
    };

    return (
        <>
            {/* Tabela de Operações */}
            <div className="bg-gray-800 p-6 rounded-lg shadow-lg mb-8">
                <h2 className="text-xl font-semibold mb-4 text-white">Histórico de Operações</h2>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-700">
                        {/* Thead e Tbody da tabela de operações */}
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
                           {loading ? <tr><td colSpan="6" className="text-center py-8">Carregando...</td></tr> :
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
                                    {expandedRow === op.id && (
                                         <tr className="details-row bg-gray-900/50 show">
                                             <td colSpan="6" className="p-0">
                                                 <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="overflow-hidden p-4">
                                                     <h4 className="font-semibold text-sm mb-2 text-orange-400">Detalhes da Operação #{op.id}</h4>
                                                      <div className="text-right mt-2"><button className="text-xs bg-blue-600 hover:bg-blue-700 text-white py-1 px-3 rounded-md flex items-center gap-2 ml-auto"><FaDownload />Baixar Borderô</button></div>
                                                 </motion.div>
                                             </td>
                                         </tr>
                                    )}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
                <Pagination totalItems={operacoes.length} itemsPerPage={ITEMS_PER_PAGE} currentPage={currentPage} onPageChange={setCurrentPage} />
            </div>

            {/* Tabela de Duplicatas */}
            <div className="bg-gray-800 p-6 rounded-lg shadow-lg mb-8">
                 <h2 className="text-xl font-semibold mb-4 text-white">Acompanhamento de Duplicatas</h2>
                 <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-700">
                        <thead className="bg-gray-700/50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">NF/CT-e</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Sacado</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Vencimento</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase">Valor</th>
                                <th className="px-6 py-3 text-center text-xs font-medium text-gray-300 uppercase">Status</th>
                            </tr>
                        </thead>
                         <tbody className="bg-gray-800 divide-y divide-gray-700">
                             {duplicatas.map(d => (
                                 <tr key={d.id}>
                                     <td className="px-6 py-4 font-medium">{d.nf}</td>
                                     <td className="px-6 py-4">{d.sacado}</td>
                                     <td className={`px-6 py-4 ${d.status === 'Vencida' ? 'text-red-400 font-semibold' : ''}`}>{d.vencimento}</td>
                                     <td className="px-6 py-4 text-right">{formatBRLNumber(d.valor)}</td>
                                     <td className="px-6 py-4 text-center">{getDuplicataStatusTag(d.status, d.diasAtraso)}</td>
                                 </tr>
                             ))}
                         </tbody>
                    </table>
                 </div>
            </div>

            {/* Gráficos */}
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
//  SUBCUMponente para a Aba "Enviar Nova Operação"
// ===================================================================
const NovaOperacaoView = () => {
    // A lógica da página /portal/enviar-operacao será movida para cá
    return (
        <div className="bg-gray-800 p-8 rounded-lg shadow-lg">
            <div id="upload-section">
                <h2 className="text-2xl font-semibold text-white mb-2">Enviar Nova Operação</h2>
                <p className="text-gray-400 mb-6">Faça o upload dos arquivos XML (NF-e) ou PDF (CT-e) para análise.</p>
                <div className="drag-area rounded-lg p-10 text-center cursor-pointer border-2 border-dashed border-gray-600 hover:border-orange-500">
                    <div className="flex flex-col items-center justify-center space-y-4">
                        <FaCloudUploadAlt className="text-5xl text-gray-500" />
                        <p className="text-lg font-medium text-gray-300">Arraste e solte os arquivos aqui</p>
                        <p className="text-gray-500">ou</p>
                        <button className="bg-orange-500 text-white font-semibold py-2 px-6 rounded-md hover:bg-orange-600 transition">
                            Selecione os Arquivos
                        </button>
                    </div>
                </div>
            </div>
            {/* A seção de simulação aparecerá aqui após o upload */}
        </div>
    );
};

// ===================================================================
//  Componente Principal da Página
// ===================================================================
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
        // TODO: Substituir por chamadas reais de API
        const fetchData = async () => {
            setLoading(true);
            try {
                // Simula a busca de operações
                const mockOperacoes = [
                    { id: 512, data_operacao: '2025-08-28', valor_total_bruto: 85230.00, valor_liquido: 82150.90, status: 'Pendente' },
                    { id: 498, data_operacao: '2025-08-15', valor_total_bruto: 120750.00, valor_liquido: 115880.00, status: 'Aprovada' },
                    { id: 495, data_operacao: '2025-08-12', valor_total_bruto: 33100.00, valor_liquido: 31500.00, status: 'Rejeitada' },
                ];
                setOperacoes(mockOperacoes);
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
                currentView === viewName ? 'active' : 'text-gray-300 hover:bg-gray-700'
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

                {activeView === 'consultas' && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
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
                    </motion.div>
                )}

                {activeView === 'nova-operacao' && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                        <NovaOperacaoView />
                    </motion.div>
                )}
            </div>
        </div>
    );
}