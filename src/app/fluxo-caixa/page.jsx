'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import LancamentoModal from '@/app/components/LancamentoModal';
import Notification from '@/app/components/Notification';
import ConfirmacaoModal from '@/app/components/ConfirmacaoModal';
import EmailModal from '@/app/components/EmailModal';
import { formatBRLNumber, formatDate } from '@/app/utils/formatters';
import FiltroLateral from '@/app/components/FiltroLateral';
import Pagination from '@/app/components/Pagination';
import { FaSort, FaSortUp, FaSortDown } from 'react-icons/fa';
import { API_URL } from '../apiConfig'; // IMPORTAÇÃO CORRETA DA URL

const ITEMS_PER_PAGE = 6;

export default function FluxoDeCaixaPage() {
    const [movimentacoes, setMovimentacoes] = useState([]);
    const [saldos, setSaldos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [notification, setNotification] = useState({ message: '', type: '' });
    const [itemParaExcluir, setItemParaExcluir] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [contasMaster, setContasMaster] = useState([]);
    const [clienteMasterNome, setClienteMasterNome] = useState('');
    const [filters, setFilters] = useState({
        dataInicio: '', dataFim: '', descricao: '', contaBancaria: '', categoria: 'Todos'
    });
    const [sortConfig, setSortConfig] = useState({ key: 'dataMovimento', direction: 'DESC' });
    
    const [contextMenu, setContextMenu] = useState({
        visible: false,
        x: 0,
        y: 0,
        selectedItem: null,
    });
    
    const menuRef = useRef(null);
    const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
    const [isSendingEmail, setIsSendingEmail] = useState(false);

    const getAuthHeader = () => {
        const token = sessionStorage.getItem('authToken');
        return token ? { 'Authorization': `Bearer ${token}` } : {};
    };

    const showNotification = (message, type) => {
        setNotification({ message, type });
        setTimeout(() => setNotification({ message: '', type: '' }), 5000);
    };

    const fetchMovimentacoes = async (currentFilters, currentSortConfig) => {
        setLoading(true);
        const params = new URLSearchParams();
        if (currentFilters.dataInicio) params.append('dataInicio', currentFilters.dataInicio);
        if (currentFilters.dataFim) params.append('dataFim', currentFilters.dataFim);
        if (currentFilters.descricao) params.append('descricao', currentFilters.descricao);
        if (currentFilters.contaBancaria) params.append('conta', currentFilters.contaBancaria);
        if (currentFilters.categoria && currentFilters.categoria !== 'Todos') {
            params.append('categoria', currentFilters.categoria);
        }
        params.append('sort', currentSortConfig.key);
        params.append('direction', currentSortConfig.direction);

        try {
            const response = await fetch(`${API_URL}/movimentacoes-caixa?${params.toString()}`, { headers: getAuthHeader() });
            if (!response.ok) throw new Error('Falha ao carregar movimentações.');
            const data = await response.json();
            setMovimentacoes(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };
    
    const fetchSaldos = async (currentFilters) => {
        const params = new URLSearchParams();
        if (currentFilters.dataInicio) params.append('dataInicio', currentFilters.dataInicio);
        if (currentFilters.dataFim) params.append('dataFim', currentFilters.dataFim);
        const url = `${API_URL}/dashboard/saldos?${params.toString()}`;
        try {
            const saldosResponse = await fetch(url, { headers: getAuthHeader() });
            if (!saldosResponse.ok) throw new Error('Falha ao carregar saldos.');
            const saldosData = await saldosResponse.json();
            setSaldos(saldosData);
        } catch (err) {
            showNotification(err.message, 'error');
        }
    };

    useEffect(() => {
        const fetchStaticData = async () => {
             try {
                const headers = getAuthHeader();
                const [masterContasResponse, clientesResponse] = await Promise.all([
                    fetch(`${API_URL}/cadastros/contas/master`, { headers }),
                    fetch(`${API_URL}/cadastros/clientes`, { headers })
                ]);
                if (!masterContasResponse.ok || !clientesResponse.ok) {
                    throw new Error('Falha ao carregar dados para o modal.');
                }
                const masterContasData = await masterContasResponse.json();
                const clientesData = await clientesResponse.json();
                const masterContasFormatadas = masterContasData.map(c => ({ contaBancaria: `${c.banco} - ${c.agencia}/${c.contaCorrente}` }));
                setContasMaster(masterContasFormatadas);
                if (clientesData.length > 0) {
                    setClienteMasterNome(clientesData[0].nome);
                }
             } catch (err) {
                 console.error(err.message);
             }
        };
        fetchStaticData();
    }, []);

    useEffect(() => {
        fetchMovimentacoes(filters, sortConfig);
        fetchSaldos(filters);
    }, [filters, sortConfig]);
    
    useEffect(() => {
        const handleClick = () => setContextMenu({ ...contextMenu, visible: false });
        document.addEventListener("click", handleClick);
        return () => {
            document.removeEventListener("click", handleClick);
        };
    }, [contextMenu]);

    const handleSort = (key) => {
        let direction = 'ASC';
        if (sortConfig.key === key && sortConfig.direction === 'ASC') {
            direction = 'DESC';
        }
        setCurrentPage(1);
        setSortConfig({ key, direction });
    };

    const getSortIcon = (key) => {
        if (sortConfig.key !== key) return <FaSort className="text-gray-400" />;
        if (sortConfig.direction === 'ASC') return <FaSortUp />;
        return <FaSortDown />;
    };

    const clearFilters = () => {
        const cleared = { dataInicio: '', dataFim: '', descricao: '', contaBancaria: '', categoria: 'Todos' };
        setFilters(cleared);
        setCurrentPage(1);
    };
    
    const handleFilterChange = (e) => {
        setCurrentPage(1);
        setFilters(prev => ({...prev, [e.target.name]: e.target.value}));
    };

    const handleSaveLancamento = async (payload) => {
        try {
            const response = await fetch(`${API_URL}/lancamentos`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
                body: JSON.stringify(payload)
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || "Falha ao salvar lançamento.");
            }
            showNotification('Lançamento salvo com sucesso!', 'success');
            clearFilters();
            return true;
        } catch (error) {
            showNotification(error.message, 'error');
            return false;
        }
    };
    
    const handleDeleteRequest = () => {
        if (!contextMenu.selectedItem) return;
        setItemParaExcluir(contextMenu.selectedItem.id);
    };

    const handleConfirmDelete = async () => {
        if(!itemParaExcluir) return;
        try {
            await fetch(`${API_URL}/movimentacoes-caixa/${itemParaExcluir}`, { 
                method: 'DELETE',
                headers: getAuthHeader()
            });
            showNotification('Lançamento excluído com sucesso!', 'success');
            fetchMovimentacoes(filters, sortConfig);
            fetchSaldos(filters);
        } catch (err) {
            showNotification(err.message, 'error');
        } finally {
            setItemParaExcluir(null);
        }
    };

    const handleGeneratePdf = async () => {
        if (!contextMenu.selectedItem) return;
        const operacaoId = contextMenu.selectedItem.operacaoId;
        try {
            const response = await fetch(`${API_URL}/operacoes/${operacaoId}/pdf`, { headers: getAuthHeader() });
            if (!response.ok) throw new Error('Não foi possível gerar o PDF.');
            const contentDisposition = response.headers.get('content-disposition');
            let filename = `bordero-${operacaoId}.pdf`;
            if (contentDisposition) {
                const filenameMatch = contentDisposition.match(/filename="([^"]+)"/);
                if (filenameMatch && filenameMatch.length > 1) {
                    filename = filenameMatch[1].replace(/[^a-zA-Z0-9.,\s-]/g, '').trim();
                }
            }
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = filename;
            document.body.appendChild(a); a.click(); a.remove(); window.URL.revokeObjectURL(url);
        } catch (err) {
            alert(err.message);
        }
    };
    
    const handleAbrirEmailModal = () => {
        if (!contextMenu.selectedItem) return;
        setIsEmailModalOpen(true);
    };

    const handleSendEmail = async (destinatarios) => {
        if (!contextMenu.selectedItem) return;
        setIsSendingEmail(true);
        try {
            const response = await fetch(`${API_URL}/operacoes/${contextMenu.selectedItem.operacaoId}/enviar-email`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
                body: JSON.stringify({ destinatarios }),
            });
            if (!response.ok) throw new Error("Falha ao enviar o e-mail.");
            showNotification("E-mail(s) enviado(s) com sucesso!", "success");
        } catch (err) {
            showNotification(err.message, "error");
        } finally {
            setIsSendingEmail(false);
            setIsEmailModalOpen(false);
        }
    };
    
    const handleContextMenu = (event, item) => {
        event.preventDefault();
        setContextMenu({
            visible: true,
            x: event.pageX,
            y: event.pageY,
            selectedItem: item,
        });
    };

    const indexOfLastItem = currentPage * ITEMS_PER_PAGE;
    const indexOfFirstItem = indexOfLastItem - ITEMS_PER_PAGE;
    const currentItems = movimentacoes.slice(indexOfFirstItem, indexOfLastItem);

    if (loading && movimentacoes.length === 0) return <div className="text-center p-10">A carregar...</div>;
    if (error) return <div className="text-center p-10 text-red-500">Erro: {error}</div>;

    const saldosTitle = filters.dataInicio && filters.dataFim ? 'Resultado do Período' : 'Saldos Atuais';

    return (
        <>
            <Notification message={notification.message} type={notification.type} onClose={() => setNotification({ message: '', type: '' })} />
            <LancamentoModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSave={handleSaveLancamento} contasMaster={contasMaster} clienteMasterNome={clienteMasterNome} />
            <ConfirmacaoModal isOpen={!!itemParaExcluir} onClose={() => setItemParaExcluir(null)} onConfirm={handleConfirmDelete} title="Confirmar Exclusão" message="Tem a certeza que deseja excluir este lançamento? Esta ação não pode ser desfeita."/>
            <EmailModal isOpen={isEmailModalOpen} onClose={() => setIsEmailModalOpen(false)} onSend={handleSendEmail} isSending={isSendingEmail} clienteId={contextMenu.selectedItem?.operacao?.cliente?.id}/>

            <main className="min-h-screen pt-16 p-6 bg-gradient-to-br from-gray-900 to-gray-800 text-white">
                <motion.header 
                    className="mb-4 flex justify-between items-center border-b-2 border-orange-500 pb-4"
                    initial={{ y: -20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                >
                    <div>
                        <h1 className="text-3xl font-bold">Fluxo de Caixa</h1>
                        <p className="text-sm text-gray-300">Visão geral das suas movimentações financeiras.</p>
                    </div>
                    <button onClick={() => setIsModalOpen(true)} className="bg-orange-500 text-white font-semibold py-2 px-4 rounded-md shadow-sm hover:bg-orange-600 transition">
                        + Novo Lançamento
                    </button>
                </motion.header>
                
                <motion.div 
                    className="mb-6"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                >
                    <h2 className="text-lg font-semibold text-gray-100 mb-2">{saldosTitle}</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {saldos.map((saldo, index) => (
                            <div key={index} className="bg-gray-800 p-3 rounded-lg shadow-lg border-l-4 border-orange-500">
                                <p className="text-sm text-gray-400 truncate">{saldo.contaBancaria}</p>
                                <p className={`text-xl font-bold ${saldo.saldo >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    {formatBRLNumber(saldo.saldo)}
                                </p>
                            </div>
                        ))}
                    </div>
                </motion.div>

                <div className="flex flex-col lg:flex-row gap-6">
                    <FiltroLateral
                        filters={filters}
                        saldos={saldos}
                        onFilterChange={handleFilterChange}
                        onClear={clearFilters}
                    />
                    <div className="flex-grow bg-gray-800 p-4 rounded-lg shadow-md min-w-0">
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-700">
                                <thead className="bg-gray-700">
                                    <tr>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                                            <button onClick={() => handleSort('dataMovimento')} className="flex items-center gap-2">Data {getSortIcon('dataMovimento')}</button>
                                        </th>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                                            <button onClick={() => handleSort('descricao')} className="flex items-center gap-2">Descrição {getSortIcon('descricao')}</button>
                                        </th>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Conta</th>
                                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">
                                            <button onClick={() => handleSort('valor')} className="flex items-center gap-2 float-right">Valor {getSortIcon('valor')}</button>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="bg-gray-800 divide-y divide-gray-700">
                                    {loading ? (
                                        <tr><td colSpan="4" className="text-center py-10 text-gray-400">A carregar...</td></tr>
                                    ) : currentItems.length > 0 ? (
                                        currentItems.map((mov) => (
                                            <tr key={mov.id} onContextMenu={(e) => handleContextMenu(e, mov)} className="hover:bg-gray-700 cursor-pointer">
                                                <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-400 align-middle">{formatDate(mov.dataMovimento)}</td>
                                                <td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-100 align-middle">{mov.descricao}</td>
                                                <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-400 align-middle">{mov.contaBancaria}</td>
                                                <td className={`px-3 py-2 whitespace-nowrap text-sm text-right font-semibold align-middle ${mov.valor >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                    {formatBRLNumber(mov.valor)}
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr><td colSpan="4" className="text-center py-10 text-gray-400">Nenhuma movimentação encontrada.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <Pagination
                            totalItems={movimentacoes.length}
                            itemsPerPage={ITEMS_PER_PAGE}
                            currentPage={currentPage}
                            onPageChange={(page) => setCurrentPage(page)}
                        />
                    </div>
                </div>
            </main>
            
            {contextMenu.visible && (
                <div
                    ref={menuRef}
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                    className="absolute origin-top-right w-56 rounded-md shadow-lg bg-gray-700 ring-1 ring-black ring-opacity-5 z-20"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="py-1">
                        {contextMenu.selectedItem?.operacaoId && (
                            <>
                                <a href="#" onClick={(e) => { e.preventDefault(); handleGeneratePdf(); }} className="block px-4 py-2 text-sm text-gray-200 hover:bg-gray-600">Gerar PDF do Borderô</a>
                                <a href="#" onClick={(e) => { e.preventDefault(); handleAbrirEmailModal(); }} className="block px-4 py-2 text-sm text-gray-200 hover:bg-gray-600">Enviar Borderô por E-mail</a>
                                <div className="border-t border-gray-600 my-1"></div>
                            </>
                        )}
                        <a href="#" onClick={(e) => { e.preventDefault(); handleDeleteRequest(); }} 
                            className={`block w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-gray-600 ${contextMenu.selectedItem?.categoria === 'Pagamento de Borderô' || contextMenu.selectedItem?.categoria === 'Recebimento' ? 'opacity-50 cursor-not-allowed' : ''}`}
                            disabled={contextMenu.selectedItem?.categoria === 'Pagamento de Borderô' || contextMenu.selectedItem?.categoria === 'Recebimento'}>
                            Excluir Lançamento
                        </a>
                    </div>
                </div>
            )}
        </>
    );
}