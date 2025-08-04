'use client';

import { useState, useEffect } from 'react';
import AutocompleteSearch from './AutoCompleteSearch';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { formatBRLNumber, formatDate } from '@/app/utils/formatters';

export default function RelatorioModal({ isOpen, onClose, tiposOperacao, fetchClientes, fetchSacados }) {
    const initialState = {
        dataInicio: "", dataFim: "", tipoOperacaoId: "", clienteId: "", clienteNome: "", sacado: "", conta: "", status: "Todos", categoria: "Todos", tipoValor: "Todos"
    };
    const [reportType, setReportType] = useState('fluxoCaixa');
    const [filters, setFilters] = useState(initialState);
    const [isGenerating, setIsGenerating] = useState(false);
    const [contas, setContas] = useState([]);
    const [format, setFormat] = useState('pdf');

    const getAuthHeader = () => {
        const token = sessionStorage.getItem('authToken');
        return token ? { 'Authorization': `Bearer ${token}` } : {};
    };

    useEffect(() => {
        if (isOpen) {
            const fetchContas = async () => {
                try {
                    const res = await fetch(`/api/dashboard/saldos`, { headers: getAuthHeader() });
                    if (res.ok) {
                        const data = await res.json();
                        setContas(data.map(c => c.contaBancaria));
                    }
                } catch (error) {
                    console.error("Erro ao buscar contas:", error);
                }
            };
            fetchContas();
        }
    }, [isOpen]);

    const handleFilterChange = (e) => {
        const { name, value } = e.target;
        setFilters(prev => ({ ...prev, [name]: value }));
    };
    
    const clearFilters = () => setFilters(initialState);

    const handleAutocompleteSelect = (name, item) => {
        if (name === "cliente") {
            setFilters(prev => ({ ...prev, clienteId: item?.id || "", clienteNome: item?.nome || "" }));
        } else if (name === "sacado") {
            setFilters(prev => ({ ...prev, sacado: item?.nome || "" }));
        }
    };

    // --- LÓGICA DE GERAÇÃO DE RELATÓRIOS ---
    const handleGenerateReport = async () => {
        setIsGenerating(true);
        const params = new URLSearchParams();
        const endpointMap = {
            fluxoCaixa: 'fluxo-caixa',
            duplicatas: 'duplicatas',
            totalOperado: 'total-operado'
        };
        const endpoint = endpointMap[reportType];

        Object.entries(filters).forEach(([key, value]) => {
            if(value && key !== 'clienteNome') params.append(key, value);
        });

        try {
            const response = await fetch(`/api/relatorios/${endpoint}?${params.toString()}`, {
                headers: getAuthHeader()
            });
            if (!response.ok) throw new Error('Não foi possível buscar os dados para o relatório.');
            const data = await response.json();

            if (format === 'pdf') {
                generatePdf(data, reportType, filters);
            } else {
                generateExcel(data, reportType);
            }
            onClose();

        } catch (error) {
          console.error('Erro ao gerar relatório:', error);
          alert('Erro ao gerar relatório. Verifique a consola para mais detalhes.');
        } finally {
            setIsGenerating(false);
        }
    };

    const generatePdf = (data, type, currentFilters) => {
        const doc = new jsPDF({ orientation: type === 'fluxoCaixa' || type === 'duplicatas' ? 'landscape' : 'portrait' });
        doc.setFontSize(18);
        doc.text(`Relatório de ${type.replace(/([A-Z])/g, ' $1').trim()}`, 14, 22);
        
        // Adicionar filtros ao PDF
        let filterText = 'Filtros: ';
        if (currentFilters.dataInicio || currentFilters.dataFim) {
            filterText += `Período de ${formatDate(currentFilters.dataInicio) || '...'} a ${formatDate(currentFilters.dataFim) || '...'}. `;
        }
        doc.setFontSize(8);
        doc.text(filterText, 14, 30);
        
        let head, body;
        switch (type) {
            case 'fluxoCaixa':
                head = [['Data', 'Descrição', 'Conta', 'Categoria', 'Valor']];
                body = data.map(row => [formatDate(row.data_movimento), row.descricao, row.conta_bancaria, row.categoria, formatBRLNumber(row.valor)]);
                break;
            case 'duplicatas':
                head = [['Data Op.', 'NF/CT-e', 'Cedente', 'Sacado', 'Venc.', 'Status', 'Valor']];
                body = data.map(row => [formatDate(row.data_operacao), row.nf_cte, row.empresa_cedente, row.cliente_sacado, formatDate(row.data_vencimento), row.status_recebimento, formatBRLNumber(row.valor_bruto)]);
                break;
            case 'totalOperado':
                doc.setFontSize(12);
                doc.text(`Total Operado no Período: ${formatBRLNumber(data.valorOperadoNoMes)}`, 14, 40);
                doc.autoTable({ startY: 50, head: [['Top 5 Cedentes', 'Valor Total']], body: data.topClientes.map(c => [c.nome, formatBRLNumber(c.valor_total)]) });
                doc.autoTable({ head: [['Top 5 Sacados', 'Valor Total']], body: data.topSacados.map(s => [s.nome, formatBRLNumber(s.valor_total)]) });
                doc.save('relatorio_total_operado.pdf');
                return;
        }
        doc.autoTable({ startY: 35, head, body });
        doc.save(`relatorio_${type}.pdf`);
    };

    const generateExcel = (data, type) => {
        let ws_data;
        switch (type) {
            case 'fluxoCaixa':
                ws_data = data.map(row => ({ Data: formatDate(row.data_movimento), Descricao: row.descricao, Conta: row.conta_bancaria, Categoria: row.categoria, Valor: row.valor }));
                break;
            case 'duplicatas':
                 ws_data = data.map(row => ({ 'Data Op.': formatDate(row.data_operacao), 'NF/CT-e': row.nf_cte, Cedente: row.empresa_cedente, Sacado: row.cliente_sacado, Vencimento: formatDate(row.data_vencimento), Status: row.status_recebimento, Valor: row.valor_bruto }));
                break;
            case 'totalOperado':
                const combinedData = [
                    { Categoria: 'Total Operado', Valor: data.valorOperadoNoMes },
                    ...data.topClientes.map(c => ({ Categoria: `Cedente: ${c.nome}`, Valor: c.valor_total })),
                    ...data.topSacados.map(s => ({ Categoria: `Sacado: ${s.nome}`, Valor: s.valor_total }))
                ];
                ws_data = combinedData;
                break;
        }
        const ws = XLSX.utils.json_to_sheet(ws_data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Relatorio');
        XLSX.writeFile(wb, `relatorio_${type}.xlsx`);
    };

    if (!isOpen) return null;
    // ... (O seu JSX continua aqui, sem alterações)
    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4">
            <div className="bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-2xl text-white">
                <h2 className="text-xl font-bold mb-4">Gerar Relatório</h2>
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-300">Tipo de Relatório</label>
                            <select
                                value={reportType}
                                onChange={(e) => setReportType(e.target.value)}
                                className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm p-2 text-sm"
                            >
                                <option value="fluxoCaixa">Fluxo de Caixa</option>
                                <option value="duplicatas">Consulta de Duplicatas</option>
                                <option value="totalOperado">Total Operado</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-300">Formato</label>
                            <select
                                value={format}
                                onChange={(e) => setFormat(e.target.value)}
                                className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm p-2 text-sm"
                            >
                                <option value="pdf">PDF</option>
                                <option value="excel">Excel (XLSX)</option>
                            </select>
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-gray-700 pt-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-300">Data Início</label>
                            <input type="date" name="dataInicio" value={filters.dataInicio} onChange={handleFilterChange} className="mt-1 w-full bg-gray-700 border-gray-600 rounded-md p-1.5 text-sm"/>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-300">Data Fim</label>
                            <input type="date" name="dataFim" value={filters.dataFim} onChange={handleFilterChange} className="mt-1 w-full bg-gray-700 border-gray-600 rounded-md p-1.5 text-sm"/>
                        </div>

                        {reportType !== 'fluxoCaixa' && (
                            <>
                                <div>
                                    <label className="block text-sm font-medium text-gray-300">Tipo de Operação</label>
                                    <select name="tipoOperacaoId" value={filters.tipoOperacaoId} onChange={handleFilterChange} className="mt-1 w-full bg-gray-700 border-gray-600 rounded-md p-1.5 text-sm">
                                        <option value="">Todos</option>
                                        {tiposOperacao.map(op => <option key={op.id} value={op.id}>{op.nome}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-300">Cedente</label>
                                    <AutocompleteSearch name="clienteNome" value={filters.clienteNome} onChange={handleFilterChange} onSelect={(c) => handleAutocompleteSelect('cliente', c)} fetchSuggestions={fetchClientes} placeholder="Todos"/>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-300">Sacado</label>
                                    <AutocompleteSearch name="sacado" value={filters.sacado} onChange={handleFilterChange} onSelect={(s) => handleAutocompleteSelect('sacado', s)} fetchSuggestions={fetchSacados} placeholder="Todos"/>
                                </div>
                            </>
                        )}

                        {reportType === 'fluxoCaixa' && (
                            <>
                                <div>
                                    <label className="block text-sm font-medium text-gray-300">Conta</label>
                                    <select name="conta" value={filters.conta} onChange={handleFilterChange} className="mt-1 w-full bg-gray-700 border-gray-600 rounded-md p-1.5 text-sm">
                                        <option value="">Todas</option>
                                        {contas.map(conta => <option key={conta} value={conta}>{conta}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-300">Categoria</label>
                                    <select name="categoria" value={filters.categoria} onChange={handleFilterChange} className="mt-1 w-full bg-gray-700 border-gray-600 rounded-md p-1.5 text-sm">
                                        <option value="Todos">Todas</option>
                                        <option value="Recebimento">Recebimento</option>
                                        <option value="Pagamento de Borderô">Pagamento de Borderô</option>
                                        <option value="Receita Avulsa">Receita Avulsa</option>
                                        <option value="Despesa Avulsa">Despesa Avulsa</option>
                                        <option value="Transferencia Enviada">Transferência Enviada</option>
                                        <option value="Transferencia Recebida">Transferência Recebida</option>
                                    </select>
                                </div>
                                 <div>
                                    <label className="block text-sm font-medium text-gray-300">Tipo</label>
                                    <select name="tipoValor" value={filters.tipoValor} onChange={handleFilterChange} className="mt-1 w-full bg-gray-700 border-gray-600 rounded-md p-1.5 text-sm">
                                        <option value="Todos">Todos</option>
                                        <option value="credito">Crédito</option>
                                        <option value="debito">Débito</option>
                                    </select>
                                </div>
                            </>
                        )}

                        {reportType === 'duplicatas' && (
                            <div>
                                <label className="block text-sm font-medium text-gray-300">Status</label>
                                <select name="status" value={filters.status} onChange={handleFilterChange} className="mt-1 w-full bg-gray-700 border-gray-600 rounded-md p-1.5 text-sm">
                                    <option value="Todos">Todos</option>
                                    <option value="Pendente">Pendente</option>
                                    <option value="Recebido">Recebido</option>
                                </select>
                            </div>
                        )}
                    </div>
                </div>
                <div className="mt-6 flex justify-between items-center">
                    <button
                        onClick={clearFilters}
                        className="bg-gray-600 text-gray-100 font-semibold py-2 px-4 rounded-md hover:bg-gray-500 transition text-sm"
                    >
                        Limpar
                    </button>
                    <div className="flex gap-2">
                        <button onClick={onClose} className="bg-gray-600 text-gray-100 font-semibold py-2 px-4 rounded-md hover:bg-gray-500 transition text-sm">Cancelar</button>
                        <button onClick={handleGenerateReport} disabled={isGenerating} className="bg-orange-500 text-white font-semibold py-2 px-4 rounded-md hover:bg-orange-600 transition text-sm disabled:bg-orange-400">
                            {isGenerating ? 'Gerando...' : 'Gerar'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}