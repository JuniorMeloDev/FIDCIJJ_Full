'use client';

import { useState, useEffect } from 'react';
import AutocompleteSearch from './AutoCompleteSearch';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { formatBRLNumber, formatDate } from '@/app/utils/formatters';
import Logo from '../../../public/Logo.png';

// Função para processar os dados para a Curva ABC
const processAbcData = (data) => {
    if (!data || data.length === 0) return [];
    
    const total = data.reduce((sum, item) => sum + (item.valor_total || 0), 0);
    let cumulative = 0;

    return data.map(item => {
        cumulative += (item.valor_total || 0);
        const acumulado = total > 0 ? (cumulative / total) * 100 : 0;
        let classe = 'C';
        if (acumulado <= 80) classe = 'A';
        else if (acumulado <= 95) classe = 'B';
        
        return {
            name: item.nome,
            valor: item.valor_total,
            acumulado: acumulado,
            classe: classe
        };
    });
};

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
            if(value && value !== 'Todos' && key !== 'clienteNome') params.append(key, value);
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
                if (type === 'totalOperado') return responseData && (responseData.clientes?.length > 0 || responseData.sacados?.length > 0);
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
        doc.text(`Relatório de ${type === 'totalOperado' ? 'Análise ABC' : type.replace(/([A-Z])/g, ' $1').trim()}`, pageWidth - 14, 22, { align: 'right' });
        
        let filterText = 'Filtros: ';
        if (currentFilters.dataInicio || currentFilters.dataFim) {
            filterText += `Período de ${formatDate(currentFilters.dataInicio) || '...'} a ${formatDate(currentFilters.dataFim) || '...'}. `;
        }
        if (currentFilters.clienteNome) filterText += `Cedente: ${currentFilters.clienteNome}. `;
        if (currentFilters.sacado) filterText += `Sacado: ${currentFilters.sacado}. `;
        doc.setFontSize(8);
        doc.text(filterText, 14, 30);

        let head, body;
        switch (type) {
            case 'fluxoCaixa':
                head = [['Data', 'Descrição', 'Conta', 'Categoria', 'Valor']];
                body = data.map(row => [formatDate(row.data_movimento), row.descricao, row.conta_bancaria, row.categoria, formatBRLNumber(row.valor)]);
                autoTable(doc, { startY: 35, head, body });
                break;
            case 'duplicatas':
                // --- ALTERAÇÃO AQUI ---
                head = [['Data Op.', 'NF/CT-e', 'Cedente', 'Sacado', 'Venc.', 'Status', 'Juros Op.', 'Juros Mora', 'Valor Bruto']];
                body = data.map(row => [
                    formatDate(row.data_operacao), row.nf_cte, row.empresa_cedente, 
                    row.cliente_sacado, formatDate(row.data_vencimento), row.status_recebimento,
                    formatBRLNumber(row.valor_juros || 0), formatBRLNumber(row.juros_mora || 0), formatBRLNumber(row.valor_bruto)
                ]);

                const totalBruto = data.reduce((sum, row) => sum + (row.valor_bruto || 0), 0);
                const totalJurosOp = data.reduce((sum, row) => sum + (row.valor_juros || 0), 0);
                const totalJurosMora = data.reduce((sum, row) => sum + (row.juros_mora || 0), 0);
                const totalJuros = totalJurosOp + totalJurosMora;

                // Renderiza a tabela principal SEM o rodapé
                autoTable(doc, {
                    startY: 35,
                    head: head,
                    body: body,
                    // Remove o 'foot' para não repetir em todas as páginas
                });

                // Adiciona a linha de totais APENAS UMA VEZ no final da tabela
                autoTable(doc, {
                    startY: doc.lastAutoTable.finalY,
                    body: [
                        ['', '', '', '', '', 'TOTAIS:', formatBRLNumber(totalJurosOp), formatBRLNumber(totalJurosMora), formatBRLNumber(totalBruto)]
                    ],
                    theme: 'grid',
                    bodyStyles: { fontStyle: 'bold', fillColor: [41, 128, 185], textColor: 255 }
                });

                // Adiciona os cards de resumo no final
                const finalY = doc.lastAutoTable.finalY + 15;
                doc.setFontSize(12);
                doc.text('Resumo do Relatório', 14, finalY);

                // Card 1: Valor Total
                doc.setFillColor(241, 241, 241);
                doc.roundedRect(14, finalY + 5, 90, 25, 3, 3, 'F');
                doc.setTextColor(50, 50, 50);
                doc.setFontSize(10);
                doc.text('Valor Total das Duplicatas', 18, finalY + 12);
                doc.setFontSize(14);
                doc.setFont('helvetica', 'bold');
                doc.text(formatBRLNumber(totalBruto), 18, finalY + 20);

                // Card 2: Juros Totais
                doc.setFillColor(241, 241, 241);
                doc.roundedRect(110, finalY + 5, 90, 25, 3, 3, 'F');
                doc.setTextColor(50, 50, 50);
                doc.setFontSize(10);
                doc.setFont('helvetica', 'normal');
                doc.text('Valor Total dos Juros (Op. + Mora)', 114, finalY + 12);
                doc.setFontSize(14);
                doc.setFont('helvetica', 'bold');
                doc.text(formatBRLNumber(totalJuros), 114, finalY + 20);
                break;
                // --- FIM DA ALTERAÇÃO ---
            case 'totalOperado':
                const processedCedentes = processAbcData(data.clientes);
                const processedSacados = processAbcData(data.sacados);

                doc.setFontSize(12);
                doc.text(`Total Operado no Período: ${formatBRLNumber(data.valorOperadoNoMes)}`, 14, 40);
                doc.text(`Total de Juros: ${formatBRLNumber(data.totalJuros)}`, 14, 45);
                doc.text(`Total de Despesas: ${formatBRLNumber(data.totalDespesas)}`, 14, 50);
                doc.text(`Lucro Líquido: ${formatBRLNumber(data.lucroLiquido)}`, 14, 55);
                
                if (processedCedentes.length > 0) {
                    autoTable(doc, {
                        startY: 65,
                        head: [['Classe', 'Cedente', 'Valor', '% Acumulado']],
                        body: processedCedentes.map(c => [c.classe, c.name, formatBRLNumber(c.valor), `${c.acumulado.toFixed(2)}%`])
                    });
                }
                
                if (processedSacados.length > 0) {
                    autoTable(doc, {
                        startY: doc.lastAutoTable.finalY + 10,
                        head: [['Classe', 'Sacado', 'Valor', '% Acumulado']],
                        body: processedSacados.map(s => [s.classe, s.name, formatBRLNumber(s.valor), `${s.acumulado.toFixed(2)}%`])
                    });
                }
                break;
        }
        doc.save(`relatorio_${type}.pdf`);
    };

    const generateExcel = (data, type, currentFilters) => {
        const wb = XLSX.utils.book_new();
        let ws_data;

        switch (type) {
            case 'fluxoCaixa':
                ws_data = data.map(row => ({ Data: formatDate(row.data_movimento), Descrição: row.descricao, Conta: row.conta_bancaria, Categoria: row.categoria, Valor: row.valor }));
                break;
            case 'duplicatas':
                ws_data = data.map(row => ({ 
                    'Data Op.': formatDate(row.data_operacao), 
                    'NF/CT-e': row.nf_cte, 
                    'Cedente': row.empresa_cedente, 
                    'Sacado': row.cliente_sacado,
                    'Vencimento': formatDate(row.data_vencimento), 
                    'Status': row.status_recebimento, 
                    'Juros Op.': row.valor_juros || 0,
                    'Juros Mora': row.juros_mora || 0,
                    'Valor Bruto': row.valor_bruto 
                }));
                break;
            case 'totalOperado':
                const summary = [ { Item: 'Total Operado no Período', Valor: data.valorOperadoNoMes }, { Item: 'Total de Juros', Valor: data.totalJuros }, { Item: 'Total de Despesas', Valor: data.totalDespesas }, { Item: 'Lucro Líquido', Valor: data.lucroLiquido }, ];
                const cedentesABC = processAbcData(data.clientes).map(c => ({ Classe: c.classe, Cedente: c.name, Valor: c.valor, '% Acumulado': c.acumulado / 100 }));
                const sacadosABC = processAbcData(data.sacados).map(s => ({ Classe: s.classe, Sacado: s.name, Valor: s.valor, '% Acumulado': s.acumulado / 100 }));
                
                const ws = XLSX.utils.json_to_sheet(summary);
                XLSX.utils.sheet_add_json(ws, cedentesABC, { origin: 'A7', header: ['Classe', 'Cedente', 'Valor', '% Acumulado'] });
                XLSX.utils.sheet_add_json(ws, sacadosABC, { origin: -1, header: ['Classe', 'Sacado', 'Valor', '% Acumulado'] });
                
                ws['!cols'] = [{ wch: 25 }, { wch: 15 }];
                cedentesABC.forEach((_, i) => {
                    const rowIndex = 7 + i + 1;
                    ws[`C${rowIndex}`].z = 'R$ #,##0.00';
                    ws[`D${rowIndex}`].z = '0.00%';
                });
                 sacadosABC.forEach((_, i) => {
                    const rowIndex = 7 + cedentesABC.length + 2 + i + 1;
                    ws[`C${rowIndex}`].z = 'R$ #,##0.00';
                    ws[`D${rowIndex}`].z = '0.00%';
                });

                XLSX.utils.book_append_sheet(wb, ws, 'Análise ABC');
                XLSX.writeFile(wb, `relatorio_${type}.xlsx`);
                return;
        }
        
        const ws = XLSX.utils.json_to_sheet(ws_data);
        XLSX.utils.book_append_sheet(wb, ws, 'Relatório');
        XLSX.writeFile(wb, `relatorio_${type}.xlsx`);
    };

    if (!isOpen) return null;
    
    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4">
            <div className="bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-lg text-white">
                <h2 className="text-xl font-bold mb-4">Gerar Relatório</h2>
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-300">Tipo de Relatório</label>
                            <select value={reportType} onChange={(e) => setReportType(e.target.value)} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm p-2 text-sm">
                                <option value="fluxoCaixa">Fluxo de Caixa</option>
                                <option value="duplicatas">Consulta de Duplicatas</option>
                                <option value="totalOperado">Total Operado (ABC)</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-300">Formato</label>
                            <select value={format} onChange={(e) => setFormat(e.target.value)} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm p-2 text-sm">
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
                <div className="mt-6 flex justify-between items-center border-t border-gray-700 pt-4">
                    <button onClick={clearFilters} className="bg-gray-600 text-gray-100 font-semibold py-2 px-4 rounded-md hover:bg-gray-500 transition text-sm">Limpar Filtros</button>
                    <div className="flex gap-2">
                        <button onClick={onClose} className="bg-gray-600 text-gray-100 font-semibold py-2 px-4 rounded-md hover:bg-gray-500 transition text-sm">Fechar</button>
                        <button onClick={handleGenerateReport} disabled={isGenerating} className="bg-orange-500 text-white font-semibold py-2 px-4 rounded-md hover:bg-orange-600 transition text-sm disabled:bg-orange-400">
                            {isGenerating ? 'Gerando...' : 'Gerar Relatório'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}