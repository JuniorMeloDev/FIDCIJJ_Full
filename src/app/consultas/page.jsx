'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import Notification from '@/app/components/Notification';
import LiquidacaoModal from '@/app/components/LiquidacaoModal';
import ConfirmacaoEstornoModal from '@/app/components/ConfirmacaoEstornoModal';
import { formatBRLNumber, formatDate } from '@/app/utils/formatters';
import EmailModal from '@/app/components/EmailModal';
import Pagination from '@/app/components/Pagination';
import FiltroLateralConsultas from '@/app/components/FiltroLateralConsultas';
import { FaSort, FaSortUp, FaSortDown } from 'react-icons/fa';

const ITEMS_PER_PAGE = 7;

export default function ConsultasPage() {
    const [duplicatas, setDuplicatas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [contasMaster, setContasMaster] = useState([]);
    const [tiposOperacao, setTiposOperacao] = useState([]);
    
    const [filters, setFilters] = useState({
        dataOpInicio: '', dataOpFim: '',
        dataVencInicio: '', dataVencFim: '',
        sacado: '', nfCte: '', status: 'Todos',
        clienteId: '', clienteNome: '', tipoOperacaoId: ''
    });

    const [sortConfig, setSortConfig] = useState({ key: 'dataOperacao', direction: 'DESC' });
    
    const [contextMenu, setContextMenu] = useState({
        visible: false,
        x: 0,
        y: 0,
        selectedItem: null,
    });

    const [notification, setNotification] = useState({ message: '', type: '' });
    const [isLiquidarModalOpen, setIsLiquidarModalOpen] = useState(false);
    const [duplicataParaLiquidar, setDuplicataParaLiquidar] = useState(null);
    const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
    const [operacaoParaEmail, setOperacaoParaEmail] = useState(null);
    const [isSendingEmail, setIsSendingEmail] = useState(false);
    const menuRef = useRef(null);
    const [estornoInfo, setEstornoInfo] = useState(null);

    const getAuthHeader = () => {
        const token = sessionStorage.getItem('authToken');
        return token ? { 'Authorization': `Bearer ${token}` } : {};
    };

    const fetchDuplicatas = async (currentFilters, currentSortConfig) => {
        setLoading(true);
        const params = new URLSearchParams();
        Object.entries(currentFilters).forEach(([key, value]) => {
            if (value && value !== 'Todos' && key !== 'clienteNome') {
                params.append(key, value);
            }
        });

        params.append('sort', currentSortConfig.key);
        params.append('direction', currentSortConfig.direction);
        
        try {
            const response = await fetch(`/api/duplicatas?${params.toString()}`, {
                headers: getAuthHeader()
            });
            if (!response.ok) {
                const errorJson = await response.json();
                throw new Error(errorJson.message || 'Falha ao buscar os dados da API.');
            }
            const data = await response.json();
            setDuplicatas(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };
    
    useEffect(() => {
        const fetchInitialData = async () => {
            try {
                const headers = getAuthHeader();
                const [contasRes, tiposRes] = await Promise.all([
                    fetch(`/api/cadastros/contas/master`, { headers }),
                    fetch(`/api/cadastros/tipos-operacao`, { headers })
                ]);
                if (!contasRes.ok) throw new Error("Falha ao buscar contas master.");
                if (!tiposRes.ok) throw new Error("Falha ao buscar tipos de operação.");
                
                const contas = await contasRes.json();
                const tipos = await tiposRes.json();
                
                const formattedTipos = tipos.map(t => ({...t, taxaJuros: t.taxa_juros, valorFixo: t.valor_fixo, despesasBancarias: t.despesas_bancarias, usarPrazoSacado: t.usar_prazo_sacado, usarPesoNoValorFixo: t.usar_peso_no_valor_fixo}));
                const formattedContas = contas.map(c => ({...c, contaCorrente: c.conta_corrente}));

                setContasMaster(formattedContas);
                setTiposOperacao(formattedTipos);
            } catch (error) {
                console.error(error);
                showNotification(error.message, 'error');
            }
        };
        fetchInitialData();
    }, []);

    useEffect(() => {
        const handler = setTimeout(() => { fetchDuplicatas(filters, sortConfig); }, 500);
        return () => { clearTimeout(handler); };
    }, [filters, sortConfig]);

    useEffect(() => {
        const handleClick = () => setContextMenu({ ...contextMenu, visible: false });
        document.addEventListener('click', handleClick);
        return () => { document.removeEventListener('click', handleClick); };
    }, [contextMenu]);

    const fetchApiData = async (url) => {
        try {
            const res = await fetch(url, { headers: getAuthHeader() });
            if (!res.ok) return [];
            return await res.json();
        } catch {
            return [];
        }
    };
    
    const fetchClientes = (query) => fetchApiData(`/api/cadastros/clientes/search?nome=${query}`);
    const fetchSacados = (query) => fetchApiData(`/api/cadastros/sacados/search?nome=${query}`);

    const handleFilterChange = (e) => {
        setCurrentPage(1);
        const { name, value } = e.target;
        if (name === "clienteNome" && value === "") {
            setFilters(prev => ({ ...prev, clienteId: "", clienteNome: "" }));
        } else {
            setFilters(prev => ({ ...prev, [name]: value }));
        }
    };
    
    const handleAutocompleteSelect = (name, item) => {
        setCurrentPage(1);
        if (name === 'cliente') {
            setFilters(prev => ({ ...prev, clienteId: item?.id || '', clienteNome: item?.nome || '' }));
        } else if (name === 'sacado') {
            setFilters(prev => ({ ...prev, sacado: item?.nome || '' }));
        }
    };

    const clearFilters = () => {
        const cleared = { dataOpInicio: '', dataOpFim: '', dataVencInicio: '', dataVencFim: '', sacado: '', nfCte: '', status: 'Todos', clienteId: '', clienteNome: '', tipoOperacaoId: '' };
        setFilters(cleared);
        setCurrentPage(1);
    };

    const handleSort = (key) => {
        let direction = 'ASC';
        if (sortConfig.key === key && sortConfig.direction === 'ASC') { direction = 'DESC'; }
        setCurrentPage(1);
        setSortConfig({ key, direction });
    };

    const getSortIcon = (key) => {
        if (sortConfig.key !== key) return <FaSort className="text-gray-400" />;
        if (sortConfig.direction === 'ASC') return <FaSortUp />;
        return <FaSortDown />;
    };
    
    const handleContextMenu = (event, item) => {
        event.preventDefault();
        setContextMenu({ visible: true, x: event.pageX, y: event.pageY, selectedItem: item });
    };

    const showNotification = (message, type) => { setNotification({ message, type }); setTimeout(() => setNotification({ message: '', type: '' }), 5000); };
    const handleAbrirModalLiquidacao = () => { if (!contextMenu.selectedItem) return; setDuplicataParaLiquidar(contextMenu.selectedItem); setIsLiquidarModalOpen(true); };
    const handleConfirmarLiquidacao = async (duplicataId, dataLiquidacao, jurosMora, contaBancariaId) => {
        let url = `/api/duplicatas/${duplicataId}/liquidar`;
        const params = new URLSearchParams();
        if (dataLiquidacao) params.append('dataLiquidacao', dataLiquidacao);
        if (jurosMora && jurosMora > 0) params.append('jurosMora', jurosMora);
        if(contaBancariaId) params.append('contaBancariaId', contaBancariaId);
        const queryString = params.toString();
        if (queryString) url += `?${queryString}`;
        try {
            const response = await fetch(url, { method: 'POST', headers: getAuthHeader() });
            if (!response.ok) throw new Error('Falha ao dar baixa na duplicata.');
            showNotification('Duplicata liquidada com sucesso!', 'success');
            fetchDuplicatas(filters, sortConfig);
        } catch (err) {
            showNotification(err.message, 'error');
        } finally {
            setIsLiquidarModalOpen(false);
        }
    };
    const handleEstornar = () => { if (!contextMenu.selectedItem) return; setEstornoInfo({ id: contextMenu.selectedItem.id }); };
    const confirmarEstorno = async () => { if (!estornoInfo) return; try { const response = await fetch(`/api/duplicatas/${estornoInfo.id}/estornar`, { method: 'POST', headers: getAuthHeader() }); if (!response.ok) { const errorData = await response.json(); throw new Error(errorData.message || 'Falha ao estornar a liquidação.'); } showNotification('Liquidação estornada com sucesso!', 'success'); fetchDuplicatas(filters, sortConfig); } catch (err) { showNotification(err.message, 'error'); } finally { setEstornoInfo(null); } };
    const handleAbrirEmailModal = () => {
        if (!contextMenu.selectedItem) return;
        setOperacaoParaEmail({ id: contextMenu.selectedItem.operacaoId, clienteId: contextMenu.selectedItem.clienteId });
        setIsEmailModalOpen(true);
    };
    const handleSendEmail = async (destinatarios) => {
        if (!operacaoParaEmail) return;
        setIsSendingEmail(true);
        try {
            const response = await fetch(`/api/operacoes/${operacaoParaEmail.id}/enviar-email`, { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json', ...getAuthHeader() }, 
                body: JSON.stringify({ destinatarios }) 
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || "Falha ao enviar o e-mail.");
            }
            showNotification("E-mail(s) enviado(s) com sucesso!", "success");
        } catch (err) {
            showNotification(err.message, "error");
        } finally {
            setIsSendingEmail(false);
            setIsEmailModalOpen(false);
        }
    };

    const handleGeneratePdf = async () => {
        if (!contextMenu.selectedItem) return;
        const operacaoId = contextMenu.selectedItem.operacaoId;
        if (!operacaoId) {
            alert("Esta duplicata não está associada a uma operação para gerar PDF.");
            return;
        }

        try {
            const response = await fetch(`/api/operacoes/${operacaoId}/pdf`, { 
                headers: getAuthHeader() 
            });

            if (!response.ok) {
                // Tenta ler a mensagem de erro do servidor
                try {
                    const errorData = await response.json();
                    throw new Error(errorData.message || 'Não foi possível gerar o PDF.');
                } catch {
                    // Se a resposta não for JSON, mostra uma mensagem genérica
                    throw new Error(`Erro do servidor: ${response.status} ${response.statusText}`);
                }
            }
            
            // Lê o nome do ficheiro do cabeçalho Content-Disposition
            const contentDisposition = response.headers.get('content-disposition');
            let filename = `bordero-${operacaoId}.pdf`; // Nome padrão
            if (contentDisposition) {
                const filenameMatch = contentDisposition.match(/filename="([^"]+)"/);
                if (filenameMatch && filenameMatch.length > 1) {
                    filename = filenameMatch[1];
                }
            }
            
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename; // Usa o nome do ficheiro recebido da API
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } catch (err) {
            alert(err.message);
        }
    };
    
    const indexOfLastItem = currentPage * ITEMS_PER_PAGE;
    const indexOfFirstItem = indexOfLastItem - ITEMS_PER_PAGE;
    const currentItems = duplicatas.slice(indexOfFirstItem, indexOfLastItem);
    const paginate = (pageNumber) => setCurrentPage(pageNumber);
    
    return (
        <>
            <Notification message={notification.message} type={notification.type} onClose={() => setNotification({ message: '', type: '' })} />
            <ConfirmacaoEstornoModal isOpen={!!estornoInfo} onClose={() => setEstornoInfo(null)} onConfirm={confirmarEstorno} title="Confirmar Estorno" message="Tem a certeza que deseja estornar esta liquidação? A movimentação de caixa correspondente (se existir) será excluída." />
            <LiquidacaoModal isOpen={isLiquidarModalOpen} onClose={() => setIsLiquidarModalOpen(false)} onConfirm={handleConfirmarLiquidacao} duplicata={duplicataParaLiquidar} contasMaster={contasMaster} />
            <EmailModal isOpen={isEmailModalOpen} onClose={() => setIsEmailModalOpen(false)} onSend={handleSendEmail} isSending={isSendingEmail} clienteId={operacaoParaEmail?.clienteId} />

            <main className="min-h-screen pt-16 p-6 bg-gradient-to-br from-gray-900 to-gray-800 text-white">
                <motion.header 
                    className="mb-4 border-b-2 border-orange-500 pb-4"
                    initial={{ y: -20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                >
                    <h1 className="text-3xl font-bold">Consulta de Duplicatas Operadas</h1>
                    <p className="text-sm text-gray-300">Histórico completo de todas as duplicatas processadas.</p>
                </motion.header>

                <div className="flex-grow flex flex-col lg:flex-row gap-6">
                    <FiltroLateralConsultas
                        filters={filters}
                        onFilterChange={handleFilterChange}
                        onClear={clearFilters}
                        tiposOperacao={tiposOperacao}
                        fetchClientes={fetchClientes}
                        fetchSacados={fetchSacados}
                        onAutocompleteSelect={handleAutocompleteSelect}
                    />
                    <div className="flex-grow bg-gray-800 p-4 rounded-lg shadow-md flex flex-col min-w-0">
                         {loading ? <p className="text-center py-10 text-gray-400">A carregar...</p> : error ? <p className="text-red-400 text-center py-10">{error}</p> : (
                            <>
                                <div className="overflow-auto">
                                    <table className="min-w-full divide-y divide-gray-700">
                                        <thead className="bg-gray-700">
                                        <tr>
                                            <th className="sticky top-0 bg-gray-700 z-10 px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase"><button onClick={() => handleSort('dataOperacao')} className="flex items-center gap-1">Data Op. {getSortIcon('dataOperacao')}</button></th>
                                            <th className="sticky top-0 bg-gray-700 z-10 px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase min-w-[120px]"><button onClick={() => handleSort('nfCte')} className="flex items-center gap-1">NF/CT-e {getSortIcon('nfCte')}</button></th>
                                            <th className="sticky top-0 bg-gray-700 z-10 px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase"><button onClick={() => handleSort('empresaCedente')} className="flex items-center gap-1">Cedente {getSortIcon('empresaCedente')}</button></th>
                                            <th className="sticky top-0 bg-gray-700 z-10 px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase"><button onClick={() => handleSort('clienteSacado')} className="flex items-center gap-1">Sacado {getSortIcon('clienteSacado')}</button></th>
                                            <th className="sticky top-0 bg-gray-700 z-10 px-4 py-2 text-right text-xs font-medium text-gray-300 uppercase"><button onClick={() => handleSort('valorBruto')} className="flex items-center gap-1 float-right">Valor Bruto {getSortIcon('valorBruto')}</button></th>
                                            <th className="sticky top-0 bg-gray-700 z-10 px-4 py-2 text-right text-xs font-medium text-gray-300 uppercase"><button onClick={() => handleSort('valorJuros')} className="flex items-center gap-1 float-right">Juros {getSortIcon('valorJuros')}</button></th>
                                            <th className="sticky top-0 bg-gray-700 z-10 px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase"><button onClick={() => handleSort('dataVencimento')} className="flex items-center gap-1">Data Venc. {getSortIcon('dataVencimento')}</button></th>
                                        </tr>
                                        </thead>
                                        <tbody className="bg-gray-800 divide-y divide-gray-700">
                                            {currentItems.map((dup) => {
                                                const isLiquidado = dup.statusRecebimento === 'Recebido';
                                                return (
                                                    <tr key={dup.id} onContextMenu={(e) => handleContextMenu(e, dup)} className="group relative hover:bg-gray-700 cursor-pointer">
                                                        <td className={`px-4 py-2 whitespace-nowrap text-sm align-middle ${isLiquidado ? 'text-gray-500' : 'text-gray-400'}`}>{formatDate(dup.dataOperacao)}</td>
                                                        <td className={`px-4 py-2 whitespace-nowrap text-sm font-medium align-middle ${isLiquidado ? 'text-gray-500' : 'text-gray-100'}`}>{dup.nfCte}</td>
                                                        <td className={`px-4 py-2 whitespace-nowrap text-sm align-middle ${isLiquidado ? 'text-gray-500' : 'text-gray-400'}`}>{dup.empresaCedente}</td>
                                                        <td className={`px-4 py-2 whitespace-nowrap text-sm align-middle ${isLiquidado ? 'text-gray-500' : 'text-gray-400'}`}>{dup.clienteSacado}</td>
                                                        <td className={`px-4 py-2 whitespace-nowrap text-sm text-right align-middle ${isLiquidado ? 'text-gray-500' : 'text-gray-100'}`}>{formatBRLNumber(dup.valorBruto)}</td>
                                                        <td className={`px-4 py-2 whitespace-nowrap text-sm text-right align-middle ${isLiquidado ? 'text-gray-500' : 'text-red-400'}`}>{formatBRLNumber(dup.valorJuros)}</td>
                                                        <td className={`px-4 py-2 whitespace-nowrap text-sm align-middle ${isLiquidado ? 'text-gray-500' : 'text-gray-400'}`}>
                                                            {formatDate(dup.dataVencimento)}
                                                            {isLiquidado && dup.dataLiquidacao && (
                                                                <div className="absolute inset-0 hidden group-hover:flex items-center justify-center bg-gray-900 bg-opacity-80 pointer-events-none transition-opacity duration-300">
                                                                    <span className="bg-green-800 text-white text-xs font-bold py-1 px-4 rounded-full shadow-lg">
                                                                        Recebido em {formatDate(dup.dataLiquidacao)} na conta {dup.contaLiquidacao}
                                                                    </span>
                                                                </div>
                                                            )}
                                                        </td>
                                                    </tr>
                                                )
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                                <Pagination totalItems={duplicatas.length} itemsPerPage={ITEMS_PER_PAGE} currentPage={currentPage} onPageChange={paginate} />
                            </>
                        )}
                    </div>
                </div>
            </main>

            {contextMenu.visible && (
                <div ref={menuRef} style={{ top: contextMenu.y, left: contextMenu.x }} className="absolute origin-top-right w-48 rounded-md shadow-lg bg-gray-700 ring-1 ring-black ring-opacity-5 z-20">
                    <div className="py-1" onClick={(e) => e.stopPropagation()}>
                        {contextMenu.selectedItem?.statusRecebimento === 'Recebido' ? (
                            <a href="#" onClick={(e) => { e.preventDefault(); handleEstornar(); }} className="block px-4 py-2 text-sm text-gray-200 hover:bg-gray-600">Estornar Liquidação</a>
                        ) : (
                            <a href="#" onClick={(e) => { e.preventDefault(); handleAbrirModalLiquidacao(); }} className="block px-4 py-2 text-sm text-gray-200 hover:bg-gray-600">Liquidar Duplicata</a>
                        )}
                        <a href="#" onClick={(e) => { e.preventDefault(); handleGeneratePdf(); }} className="block px-4 py-2 text-sm text-gray-200 hover:bg-gray-600">Gerar PDF</a>
                        <a href="#" onClick={(e) => { e.preventDefault(); handleAbrirEmailModal(); }} className="block px-4 py-2 text-sm text-gray-200 hover:bg-gray-600">Enviar por E-mail</a>
                    </div>
                </div>
            )}
        </>
    );
}