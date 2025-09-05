'use client'

import React, { useState, useEffect, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import { formatBRLNumber, formatDate } from "@/app/utils/formatters";
import { FaChevronRight, FaHourglassHalf, FaCheckCircle, FaTimesCircle, FaCheck, FaExclamationCircle, FaClock, FaCloudUploadAlt, FaDownload, FaSort, FaSortUp, FaSortDown } from "react-icons/fa";
import Pagination from "@/app/components/Pagination";
import Notification from "@/app/components/Notification";
import TopFiveApex from "@/app/components/TopFiveApex";
import VolumeOperadoChart from "@/app/components/VolumeOperadoChart";

const ITEMS_PER_PAGE_OPERATIONS = 5;
const ITEMS_PER_PAGE_DUPLICATAS = 10;

// Ícones SVG para a nova view
const UploadIcon = () => <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg>;
const CheckCircleIcon = () => <svg className="w-5 h-5 text-green-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"></path></svg>;


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

const HistoricoOperacoesTable = ({ operacoes, loading, error, getAuthHeader, showNotification }) => {
    const [expandedRow, setExpandedRow] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [downloadingId, setDownloadingId] = useState(null);
    const { items: sortedOperacoes, requestSort, getSortIcon } = useSortableData(operacoes, { key: 'data_operacao', direction: 'DESC' });
    const toggleRow = (id) => setExpandedRow(expandedRow === id ? null : id);
    const indexOfLastItem = currentPage * ITEMS_PER_PAGE_OPERATIONS;
    const indexOfFirstItem = indexOfLastItem - ITEMS_PER_PAGE_OPERATIONS;
    const currentOperacoes = sortedOperacoes.slice(indexOfFirstItem, indexOfLastItem);
    const getStatusTag = (status) => {
        const styles = { Pendente: "bg-orange-800 text-amber-100", Aprovada: "bg-green-800 text-green-100", Rejeitada: "bg-red-800 text-red-100" };
        const icons = { Pendente: <FaHourglassHalf />, Aprovada: <FaCheckCircle />, Rejeitada: <FaTimesCircle /> };
        return <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${styles[status] || 'bg-gray-600'}`}>{icons[status]} {status}</span>;
    };
    const handleDownloadBordero = async (operacaoId) => {
        setDownloadingId(operacaoId);
        try {
            const response = await fetch(`/api/operacoes/${operacaoId}/pdf`, { headers: getAuthHeader() });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || "Não foi possível gerar o PDF.");
            }
            const contentDisposition = response.headers.get("content-disposition");
            let filename = `bordero-${operacaoId}.pdf`;
            if (contentDisposition) {
                const filenameMatch = contentDisposition.match(/filename="([^"]+)"/);
                if (filenameMatch && filenameMatch.length > 1) filename = filenameMatch[1];
            }
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } catch (err) {
            showNotification(err.message, 'error');
        } finally {
            setDownloadingId(null);
        }
    };
    return (
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg mb-8">
            <h2 className="text-xl font-semibold mb-4 text-white">Histórico de Operações</h2>
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-700">
                    <thead className="bg-gray-700/50">
                        <tr>
                            <th className="w-12"></th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer" onClick={() => requestSort('id')}>ID{getSortIcon('id')}</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer" onClick={() => requestSort('data_operacao')}>Data de Envio{getSortIcon('data_operacao')}</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer" onClick={() => requestSort('valor_total_bruto')}>Valor Bruto{getSortIcon('valor_total_bruto')}</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer" onClick={() => requestSort('valor_liquido')}>Valor Líquido{getSortIcon('valor_liquido')}</th>
                            <th className="px-6 py-3 text-center text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer" onClick={() => requestSort('status')}>Status{getSortIcon('status')}</th>
                        </tr>
                    </thead>
                    <tbody className="bg-gray-800 divide-y divide-gray-700">
                       {loading ? <tr><td colSpan="6" className="text-center py-8">Carregando...</td></tr> :
                        error ? <tr><td colSpan="6" className="text-center py-8 text-red-400">{error}</td></tr> :
                        currentOperacoes.length === 0 ? <tr><td colSpan="6" className="text-center py-8">Nenhuma operação encontrada.</td></tr> :
                        currentOperacoes.map(op => (
                           <React.Fragment key={op.id}>
                               <tr onClick={() => toggleRow(op.id)} className={`cursor-pointer hover:bg-gray-700/50 ${expandedRow === op.id ? 'bg-gray-700/50' : ''}`}>
                                   <td className="px-4 py-4"><FaChevronRight className={`text-gray-500 transition-transform duration-300 ${expandedRow === op.id ? 'rotate-90' : ''}`} /></td>
                                   <td className="px-6 py-4 font-medium text-white">#{op.id}</td>
                                   <td className="px-6 py-4 text-gray-300">{formatDate(op.data_operacao)}</td>
                                   <td className="px-6 py-4 text-right text-gray-300">{formatBRLNumber(op.valor_total_bruto)}</td>
                                   <td className="px-6 py-4 text-right text-gray-300">{formatBRLNumber(op.valor_liquido)}</td>
                                   <td className="px-6 py-4 text-center">{getStatusTag(op.status)}</td>
                               </tr>
                               {expandedRow === op.id && (
                                   <tr className="bg-gray-900/50">
                                       <td colSpan="6" className="p-0">
                                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="overflow-hidden p-4 space-y-4">
                                                <div className="flex justify-between items-center">
                                                    <h4 className="font-semibold text-sm text-orange-400">Detalhes da Operação #{op.id}</h4>
                                                    <button 
                                                        onClick={() => handleDownloadBordero(op.id)}
                                                        disabled={downloadingId === op.id}
                                                        className="text-xs bg-blue-600 hover:bg-blue-700 text-white py-1 px-3 rounded-md flex items-center gap-2 ml-auto disabled:bg-blue-400"
                                                    >
                                                        <FaDownload />
                                                        {downloadingId === op.id ? 'Baixando...' : 'Baixar Borderô'}
                                                    </button>
                                                </div>
                                                <table className="min-w-full text-xs">
                                                    <thead className="bg-gray-700/50">
                                                        <tr>
                                                            <th className="px-3 py-2 text-left">NF/CT-e</th>
                                                            <th className="px-3 py-2 text-left">Sacado</th>
                                                            <th className="px-3 py-2 text-center">Vencimento</th>
                                                            <th className="px-3 py-2 text-right">Valor Bruto</th>
                                                            <th className="px-3 py-2 text-right">Juros (Deságio)</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-700">
                                                        {op.duplicatas.map(dup => (
                                                            <tr key={dup.id}>
                                                                <td className="px-3 py-2">{dup.nf_cte}</td>
                                                                <td className="px-3 py-2">{dup.cliente_sacado}</td>
                                                                <td className="px-3 py-2 text-center">{formatDate(dup.data_vencimento)}</td>
                                                                <td className="px-3 py-2 text-right">{formatBRLNumber(dup.valor_bruto)}</td>
                                                                <td className="px-3 py-2 text-right text-red-400">{formatBRLNumber(dup.valor_juros)}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </motion.div>
                                       </td>
                                   </tr>
                               )}
                           </React.Fragment>
                        ))}
                   </tbody>
                </table>
            </div>
            <Pagination totalItems={operacoes.length} itemsPerPage={ITEMS_PER_PAGE_OPERATIONS} currentPage={currentPage} onPageChange={setCurrentPage} />
        </div>
    );
};

const AcompanhamentoDuplicatasTable = ({ duplicatas, loading, error }) => {
    const [currentPage, setCurrentPage] = useState(1);
    const { items: sortedDuplicatas, requestSort, getSortIcon } = useSortableData(duplicatas, { key: 'data_vencimento', direction: 'DESC' });
    const currentDuplicatas = sortedDuplicatas.slice((currentPage - 1) * ITEMS_PER_PAGE_DUPLICATAS, currentPage * ITEMS_PER_PAGE_DUPLICATAS);
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
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg mb-8">
            <h2 className="text-xl font-semibold mb-4 text-white">Acompanhamento de Duplicatas</h2>
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-700">
                    <thead className="bg-gray-700/50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer" onClick={() => requestSort('nf_cte')}>NF/CT-e{getSortIcon('nf_cte')}</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer" onClick={() => requestSort('cliente_sacado')}>Sacado{getSortIcon('cliente_sacado')}</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer" onClick={() => requestSort('data_vencimento')}>Vencimento{getSortIcon('data_vencimento')}</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer" onClick={() => requestSort('valor_bruto')}>Valor{getSortIcon('valor_bruto')}</th>
                            <th className="px-6 py-3 text-center text-xs font-medium text-gray-300 uppercase">Status</th>
                        </tr>
                    </thead>
                     <tbody className="bg-gray-800 divide-y divide-gray-700">
                         {loading ? <tr><td colSpan="5" className="text-center py-8">Carregando...</td></tr> :
                          error ? <tr><td colSpan="5" className="text-center py-8 text-red-400">{error}</td></tr> :
                          currentDuplicatas.length === 0 ? <tr><td colSpan="5" className="text-center py-8">Nenhuma duplicata encontrada.</td></tr> :
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
            <Pagination totalItems={duplicatas.length} itemsPerPage={ITEMS_PER_PAGE_DUPLICATAS} currentPage={currentPage} onPageChange={setCurrentPage} />
        </div>
    );
};

const NovaOperacaoView = ({ showNotification, getAuthHeader }) => {
    const [tiposOperacao, setTiposOperacao] = useState([]);
    const [selectedFile, setSelectedFile] = useState(null);
    const [tipoOperacaoId, setTipoOperacaoId] = useState("");
    const [simulationResult, setSimulationResult] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const fileInputRef = useRef(null);
    useEffect(() => {
        const fetchTiposOperacao = async () => {
            try {
                const res = await fetch('/api/portal/tipos-operacao', { headers: getAuthHeader() });
                if (!res.ok) throw new Error("Não foi possível carregar os tipos de operação.");
                const data = await res.json();
                const formattedData = data.map(t => ({...t, taxaJuros: t.taxa_juros, valorFixo: t.valor_fixo}));
                setTiposOperacao(formattedData);
            } catch (error) {
                showNotification(error.message, 'error');
            }
        };
        fetchTiposOperacao();
    }, [getAuthHeader, showNotification]);
    const handleFileChange = (event) => {
        const file = event.target.files[0];
        if (file && (file.type === 'text/xml' || file.type === 'application/pdf')) {
            setSelectedFile(file);
        } else {
            showNotification("Por favor, selecione um arquivo XML ou PDF.", 'error');
            setSelectedFile(null);
        }
    };
    const handleSimulate = async () => {
        if (!selectedFile || !tipoOperacaoId) {
            showNotification("Por favor, selecione um arquivo e um tipo de operação.", 'error');
            return;
        }
        setIsLoading(true);
        setSimulationResult(null);
        
        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('tipoOperacaoId', tipoOperacaoId);
        try {
            const response = await fetch('/api/portal/simular-operacao', {
                method: 'POST',
                headers: getAuthHeader(),
                body: formData,
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Falha ao simular operação.');
            }
            const data = await response.json();
            setSimulationResult(data);
        } catch (error) {
            showNotification(error.message, 'error');
        } finally {
            setIsLoading(false);
        }
    };
    const handleConfirmSubmit = async () => {
        if (!simulationResult) return;
        setIsSubmitting(true);
        try {
            const response = await fetch('/api/portal/operacoes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
                body: JSON.stringify({
                    dataOperacao: new Date().toISOString().split('T')[0],
                    tipoOperacaoId: parseInt(tipoOperacaoId),
                    notasFiscais: [simulationResult],
                }),
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Falha ao enviar operação.');
            }
            showNotification("Operação enviada para análise com sucesso! Atualize a página em alguns instantes para vê-la no histórico.", 'success');
            setSelectedFile(null);
            setTipoOperacaoId('');
            setSimulationResult(null);
            if(fileInputRef.current) fileInputRef.current.value = "";
        } catch(error) {
            showNotification(error.message, 'error');
        } finally {
            setIsSubmitting(false);
        }
    };
    const SimulationDetails = ({ result, onSubmit, onCancel }) => (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-gray-800 p-6 rounded-lg shadow-lg">
            <h3 className="text-xl font-semibold mb-4 text-orange-400">Simulação da Operação</h3>
            <div className="space-y-4">
                <div className="bg-gray-700 p-4 rounded-md">
                     <p className="text-sm text-gray-400">Sacado: <span className="font-medium text-white">{result.clienteSacado}</span></p>
                     <p className="text-sm text-gray-400">NF/CT-e: <span className="font-medium text-white">{result.nfCte}</span></p>
                </div>
                <div className="border-t border-b border-gray-700 py-4">
                    <table className="min-w-full text-sm">
                        <thead>
                            <tr className="text-left text-gray-400">
                                <th className="pb-2">Parcela</th>
                                <th className="pb-2">Vencimento</th>
                                <th className="pb-2 text-right">Valor</th>
                                <th className="pb-2 text-right">Juros (Deságio)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {result.parcelasCalculadas.map(p => (
                                <tr key={p.numeroParcela} className="border-t border-gray-700/50">
                                    <td className="py-2">{p.numeroParcela}</td>
                                    <td className="py-2">{formatDate(p.dataVencimento)}</td>
                                    <td className="py-2 text-right">{formatBRLNumber(p.valorParcela)}</td>
                                    <td className="py-2 text-right text-red-400">-{formatBRLNumber(p.jurosParcela)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="grid grid-cols-2 gap-4 text-right font-medium">
                    <div>
                        <p className="text-gray-400">Valor Total Bruto:</p>
                        <p className="text-white text-lg">{formatBRLNumber(result.valorNf)}</p>
                    </div>
                    <div>
                        <p className="text-gray-400">Deságio Total (Juros):</p>
                        <p className="text-red-400 text-lg">-{formatBRLNumber(result.jurosCalculado)}</p>
                    </div>
                     <div className="col-span-2 border-t border-gray-700 pt-2 mt-2">
                        <p className="text-gray-400">Valor Líquido a Receber:</p>
                        <p className="text-green-400 text-2xl font-bold">{formatBRLNumber(result.valorLiquidoCalculado)}</p>
                    </div>
                </div>
            </div>
             <div className="mt-8 flex justify-end gap-4">
                <button onClick={onCancel} className="bg-gray-600 text-gray-100 font-semibold py-2 px-6 rounded-md hover:bg-gray-500 transition">Cancelar</button>
                <button onClick={onSubmit} disabled={isSubmitting} className="bg-green-500 text-white font-semibold py-2 px-6 rounded-md shadow-sm hover:bg-green-600 transition disabled:bg-green-400">
                    {isSubmitting ? 'Enviando...' : 'Confirmar e Enviar para Análise'}
                </button>
            </div>
        </motion.div>
    );
    return (
        <>
            {!simulationResult ? (
                 <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-gray-800 p-6 rounded-lg shadow-lg">
                    <h2 className="text-2xl font-bold text-white mb-6">Enviar Nova Operação</h2>
                    <div className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">1. Selecione o Tipo de Operação</label>
                            <select value={tipoOperacaoId} onChange={e => setTipoOperacaoId(e.target.value)} className="w-full bg-gray-700 border-gray-600 rounded-md shadow-sm p-3 text-white">
                                <option value="">Escolha uma opção...</option>
                                {tiposOperacao.map(op => ( <option key={op.id} value={op.id}>{op.nome} (Taxa: {op.taxaJuros}%, Fixo: {formatBRLNumber(op.valorFixo)})</option>))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">2. Faça o Upload do Arquivo (XML ou PDF)</label>
                            <div 
                              className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-600 border-dashed rounded-md cursor-pointer hover:border-orange-400"
                              onClick={() => fileInputRef.current.click()}
                            >
                                <div className="space-y-1 text-center">
                                    {selectedFile ? (
                                        <div className="flex items-center text-green-400">
                                            <CheckCircleIcon />
                                            <span className="font-medium">{selectedFile.name}</span>
                                        </div>
                                    ) : (
                                        <>
                                            <UploadIcon />
                                            <p className="text-sm text-gray-400">Clique para selecionar ou arraste o arquivo aqui</p>
                                        </>
                                    )}
                                </div>
                                <input ref={fileInputRef} id="file-upload" name="file-upload" type="file" className="sr-only" onChange={handleFileChange} accept=".xml,.pdf" />
                            </div>
                        </div>
                    </div>
                    <div className="mt-8 text-right">
                        <button onClick={handleSimulate} disabled={isLoading} className="bg-orange-500 text-white font-semibold py-2 px-6 rounded-md shadow-sm hover:bg-orange-600 transition disabled:bg-orange-400">
                            {isLoading ? 'Processando...' : 'Simular Operação'}
                        </button>
                    </div>
                </motion.div>
            ) : (
                <SimulationDetails result={simulationResult} onSubmit={handleConfirmSubmit} onCancel={() => setSimulationResult(null)}/>
            )}
        </>
    );
}

export default function ClientDashboardPage() {
    const [operacoes, setOperacoes] = useState([]);
    const [duplicatas, setDuplicatas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [activeView, setActiveView] = useState('consultas');
    const [notification, setNotification] = useState({ message: '', type: '' });
    
    // States para os novos gráficos
    const [volumeFilter, setVolumeFilter] = useState('last_6_months');
    const [volumeData, setVolumeData] = useState([]);
    const [maioresSacadosData, setMaioresSacadosData] = useState([]);
    const [chartsLoading, setChartsLoading] = useState(true);

    const getAuthHeader = () => {
        const token = sessionStorage.getItem('authToken');
        return token ? { 'Authorization': `Bearer ${token}` } : {};
    };

    const showNotification = (message, type) => {
        setNotification({ message, type });
        setTimeout(() => setNotification({ message: '', type: '' }), 5000);
    };
    
    useEffect(() => {
        const fetchTableData = async () => {
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
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        if (activeView === 'consultas') {
            fetchTableData();
        }
    }, [activeView]);

    // useEffect para buscar dados dos gráficos
    useEffect(() => {
        const fetchChartData = async () => {
            setChartsLoading(true);
            try {
                const headers = getAuthHeader();
                const [volumeRes, sacadosRes] = await Promise.all([
                    fetch(`/api/portal/volume-operado?period=${volumeFilter}`, { headers }),
                    fetch(`/api/portal/maiores-sacados?period=${volumeFilter}`, { headers })
                ]);
                if (!volumeRes.ok || !sacadosRes.ok) throw new Error('Falha ao carregar dados dos gráficos.');
                const volume = await volumeRes.json();
                const sacados = await sacadosRes.json();
                setVolumeData(volume);
                setMaioresSacadosData(sacados);
            } catch (err) {
                showNotification(err.message, 'error');
            } finally {
                setChartsLoading(false);
            }
        };
        
        if (activeView === 'consultas') {
            fetchChartData();
        }
    }, [activeView, volumeFilter]);

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
        <div className="py-8">
            <Notification message={notification.message} type={notification.type} onClose={() => setNotification({ message: "", type: "" })} />
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="mb-6 bg-gray-800 p-2 rounded-lg inline-flex items-center space-x-2">
                    <TabButton viewName="consultas" currentView={activeView} setView={setActiveView}>Minhas Operações</TabButton>
                    <TabButton viewName="nova-operacao" currentView={activeView} setView={setActiveView}>Enviar Nova Operação</TabButton>
                </div>

                <div id="page-content">
                    {activeView === 'consultas' && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                            <HistoricoOperacoesTable 
                                operacoes={operacoes} 
                                loading={loading}
                                error={error}
                                getAuthHeader={getAuthHeader}
                                showNotification={showNotification}
                            />
                            <AcompanhamentoDuplicatasTable 
                                duplicatas={duplicatas}
                                loading={loading}
                                error={error}
                            />
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                                <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
                                    <div className="flex justify-between items-center mb-4">
                                        <h3 className="text-lg font-semibold text-white">Volume Operado</h3>
                                        <select 
                                            value={volumeFilter}
                                            onChange={(e) => setVolumeFilter(e.target.value)}
                                            className="bg-gray-700 text-gray-200 border-gray-600 rounded-md p-1 text-sm focus:ring-orange-500 focus:border-orange-500"
                                        >
                                            <option value="last_6_months">Últimos 6 Meses</option>
                                            <option value="current_month">Mês Atual</option>
                                            <option value="last_month">Mês Passado</option>
                                            <option value="current_year">Este Ano</option>
                                        </select>
                                    </div>
                                    {chartsLoading ? <div className="h-[250px] flex items-center justify-center text-gray-400">Carregando...</div> : <VolumeOperadoChart data={volumeData} />}
                                </div>
                                <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
                                    <h3 className="text-lg font-semibold text-white mb-4">Maiores Sacados</h3>
                                    {chartsLoading ? <div className="h-[250px] flex items-center justify-center text-gray-400">Carregando...</div> : <TopFiveApex data={maioresSacadosData} />}
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {activeView === 'nova-operacao' && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                           <NovaOperacaoView showNotification={showNotification} getAuthHeader={getAuthHeader} />
                        </motion.div>
                    )}
                </div>
            </div>
        </div>
    );
}