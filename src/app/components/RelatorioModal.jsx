'use client';

import { useState, useEffect } from 'react';
import AutocompleteSearch from './AutoCompleteSearch';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { formatBRLNumber, formatDate } from '@/app/utils/formatters';

// O Next.js permite importar imagens diretamente
import Logo from '../../../public/Logo.png';

export default function RelatorioModal({ isOpen, onClose, tiposOperacao, fetchClientes, fetchSacados }) {
    const initialState = {
        dataInicio: "", dataFim: "", tipoOperacaoId: "", clienteId: "", clienteNome: "", sacado: "", conta: "", status: "Todos", categoria: "Todos", tipoValor: "Todos"
    };
    const [reportType, setReportType] = useState('fluxoCaixa');
    const [filters, setFilters] = useState(initialState);
    const [isGenerating, setIsGenerating] = useState(false);
    const [contas, setContas] = useState([]);
    const [format, setFormat] = useState('pdf');
    const [logoBase64, setLogoBase64] = useState(null);

    // Converte a imagem do logo para Base64 quando o componente carrega
    useEffect(() => {
        const image = new Image();
        image.src = Logo.src;
        image.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = image.width;
            canvas.height = image.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(image, 0, 0);
            const dataURL = canvas.toDataURL('image/png');
            setLogoBase64(dataURL);
        };
    }, []);

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
            if (!response.ok) {
                 const errorData = await response.json();
                 throw new Error(errorData.message || 'Não foi possível buscar os dados para o relatório.');
            }
            const data = await response.json();
            
            const hasData = (type, responseData) => {
                if (type === 'totalOperado') return responseData && (responseData.valorOperadoNoMes > 0 || responseData.topClientes?.length > 0 || responseData.topSacados?.length > 0);
                return Array.isArray(responseData) && responseData.length > 0;
            };

            if (!hasData(reportType, data)) {
                 alert("Nenhum dado encontrado para os filtros selecionados.");
            } else {
                if (format === 'pdf') {
                    generatePdf(data, reportType, filters);
                } else {
                    generateExcel(data, reportType, filters);
                }
                onClose();
            }

        } catch (error) {
          console.error('Erro ao gerar relatório:', error);
          alert(`Erro ao gerar relatório: ${error.message}`);
        } finally {
            setIsGenerating(false);
        }
    };

    const generatePdf = (data, type, currentFilters) => {
        const doc = new jsPDF({ orientation: type === 'fluxoCaixa' || type === 'duplicatas' ? 'landscape' : 'portrait' });
        
        if (logoBase64) {
            const logoWidth = 40;
            const logoHeight = logoWidth / 2.3;
            doc.addImage(logoBase64, 'PNG', 14, 10, logoWidth, logoHeight);
        }
        const pageWidth = doc.internal.pageSize.getWidth();
        doc.setFontSize(18);
        doc.text(`Relatório de ${type.replace(/([A-Z])/g, ' $1').trim()}`, pageWidth - 14, 22, { align: 'right' });
        
        let filterText = 'Filtros: ';
        if (currentFilters.dataInicio || currentFilters.dataFim) {
            filterText += `Período de ${formatDate(currentFilters.dataInicio) || '...'} a ${formatDate(currentFilters.dataFim) || '...'}. `;
        }
        if (currentFilters.conta) {
            filterText += `Conta: ${currentFilters.conta}.`;
        }
        doc.setFontSize(8);
        doc.text(filterText, 14, 30);

        let head, body;
        switch (type) {
            case 'fluxoCaixa':
                head = [['Data', 'Descrição', 'Conta', 'Categoria', 'Valor']];
                body = data.map(row => [formatDate(row.data_movimento), row.descricao, row.conta_bancaria, row.categoria, formatBRLNumber(row.valor)]);
                
                // --- LÓGICA CORRIGIDA PARA OS TOTAIS E CARDS ---
                autoTable(doc, { startY: 35, head, body });

                let finalY = doc.lastAutoTable.finalY + 15;
                
                if (finalY > doc.internal.pageSize.getHeight() - 40) {
                    doc.addPage();
                    finalY = 20;
                }

                doc.setFontSize(12);
                doc.text("Resumo do Período", 14, finalY);
                finalY += 8;
                
                let startX = 14;
                const contasParaMostrar = currentFilters.conta ? [currentFilters.conta] : contas;
                
                contasParaMostrar.forEach(conta => {
                    const saldo = data.filter(d => d.conta_bancaria === conta).reduce((sum, row) => sum + row.valor, 0);
                    const cardColor = saldo >= 0 ? [34, 197, 94] : [239, 68, 68];
                    
                    doc.setFillColor(...cardColor);
                    doc.roundedRect(startX, finalY, 60, 20, 3, 3, 'F');
                    
                    doc.setTextColor(255, 255, 255);
                    doc.setFontSize(8);
                    doc.text(conta, startX + 5, finalY + 7, { maxWidth: 50 });
                    doc.setFontSize(12);
                    doc.setFont('helvetica', 'bold');
                    doc.text(formatBRLNumber(saldo), startX + 5, finalY + 15);
                    
                    startX += 65;
                    if (startX > pageWidth - 60) {
                        startX = 14;
                        finalY += 25;
                    }
                });

                if (!currentFilters.conta) {
                    const totalGeral = data.reduce((sum, row) => sum + row.valor, 0);
                    doc.setTextColor(0, 0, 0);
                    doc.setFontSize(10);
                    doc.text(`Total Geral do Período: ${formatBRLNumber(totalGeral)}`, 14, finalY + 30);
                }
                break;

            case 'duplicatas':
                const showTipoOperacao = !currentFilters.tipoOperacaoId;
                head = [['Data Op.', 'NF/CT-e', 'Cedente', 'Sacado', ...(showTipoOperacao ? ['Tipo Op.'] : []), 'Venc.', 'Status', 'Valor']];
                body = data.map(row => [
                    formatDate(row.data_operacao), row.nf_cte, row.empresa_cedente, 
                    row.cliente_sacado, ...(showTipoOperacao ? [row.tipo_operacao_nome] : []),
                    formatDate(row.data_vencimento), row.status_recebimento, formatBRLNumber(row.valor_bruto)
                ]);

                autoTable(doc, {
                    startY: 35, head, body,
                     // --- HOOK CORRIGIDO PARA ADICIONAR TOTAIS ---
                    didDrawPage: (hookData) => {
                        const totalBruto = data.reduce((sum, row) => sum + (row.valor_bruto || 0), 0);
                        doc.setFontSize(10);
                        doc.text(`Total Bruto das Duplicatas: ${formatBRLNumber(totalBruto)}`, 14, hookData.cursor.y + 10);
                    }
                });
                break;

            case 'totalOperado':
                doc.setFontSize(12);
                doc.text(`Total Operado no Período: ${formatBRLNumber(data.valorOperadoNoMes)}`, 14, 40);
                doc.text(`Total de Juros: ${formatBRLNumber(data.totalJuros)}`, 14, 45);
                doc.text(`Total de Despesas: ${formatBRLNumber(data.totalDespesas)}`, 14, 50);
                doc.text(`Lucro Líquido: ${formatBRLNumber(data.lucroLiquido)}`, 14, 55);
                
                autoTable(doc, { startY: 65, head: [['Top 5 Cedentes', 'Valor Total']], body: data.topClientes.map(c => [c.nome, formatBRLNumber(c.valor_total)]) });
                autoTable(doc, { head: [['Top 5 Sacados', 'Valor Total']], body: data.topSacados.map(s => [s.nome, formatBRLNumber(s.valor_total)]) });
                break;
        }
        doc.save(`relatorio_${type}.pdf`);
    };

    const generateExcel = (data, type, currentFilters) => {
        let ws_data;
        switch (type) {
            case 'fluxoCaixa':
                ws_data = data.map(row => ({ Data: formatDate(row.data_movimento), Descricao: row.descricao, Conta: row.conta_bancaria, Categoria: row.categoria, Valor: row.valor }));
                const totalGeral = data.reduce((sum, row) => sum + row.valor, 0);
                const totalsFluxo = [{ Categoria: 'Total do Período', Valor: totalGeral }];
                contas.forEach(conta => {
                    const saldo = data.filter(d => d.conta_bancaria === conta).reduce((sum, row) => sum + row.valor, 0);
                    totalsFluxo.push({ Categoria: `Saldo ${conta}`, Valor: saldo });
                });
                ws_data = [...ws_data, {}, ...totalsFluxo];
                break;
            case 'duplicatas':
                const showTipoOperacao = !currentFilters.tipoOperacaoId;
                ws_data = data.map(row => ({ 
                    'Data Op.': formatDate(row.data_operacao), 'NF/CT-e': row.nf_cte, 'Cedente': row.empresa_cedente, 
                    'Sacado': row.cliente_sacado, ...(showTipoOperacao && { 'Tipo Operação': row.tipo_operacao_nome }),
                    'Vencimento': formatDate(row.data_vencimento), 'Status': row.status_recebimento, 'Valor': row.valor_bruto 
                }));
                const totalBruto = data.reduce((sum, row) => sum + (row.valor_bruto || 0), 0);
                ws_data.push({});
                ws_data.push({ 'Cedente': 'Total Bruto', 'Valor': totalBruto });
                break;
            case 'totalOperado':
                ws_data = [
                    { Categoria: 'Total Operado', Valor: data.valorOperadoNoMes },
                    { Categoria: 'Total Juros', Valor: data.totalJuros },
                    { Categoria: 'Total Despesas', Valor: data.totalDespesas },
                    { Categoria: 'Lucro Líquido', Valor: data.lucroLiquido },
                    {}, 
                    { Categoria: 'Top 5 Cedentes' },
                    ...data.topClientes.map(c => ({ Categoria: c.nome, Valor: c.valor_total })),
                    {}, 
                    { Categoria: 'Top 5 Sacados' },
                    ...data.topSacados.map(s => ({ Categoria: s.nome, Valor: s.valor_total }))
                ];
                break;
        }
        const ws = XLSX.utils.json_to_sheet(ws_data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Relatorio');
        XLSX.writeFile(wb, `relatorio_${type}.xlsx`);
    };

    if (!isOpen) return null;
    
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
                                        <option value="Movimentação Avulsa">Movimentação Avulsa</option>
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