'use client';

import { useState, useEffect } from 'react';
import AutocompleteSearch from './AutoCompleteSearch';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { formatBRLNumber, formatDate } from '@/app/utils/formatters';
import Logo from '../../../public/Logo.png';

// Função auxiliar para processar dados da Curva ABC
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

    // Carrega o Logo para o PDF
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

    // Busca as contas para o filtro de Fluxo de Caixa
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
        
        // Mapeamento dos tipos de relatório para os endpoints da API
        const endpointMap = {
            fluxoCaixa: 'fluxo-caixa',
            duplicatas: 'duplicatas',
            totalOperado: 'total-operado',
            dre: 'dre'
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
            
            // Validação se existem dados antes de gerar
            const hasData = (type, responseData) => {
                if (type === 'totalOperado') return responseData && (responseData.clientes?.length > 0 || responseData.sacados?.length > 0);
                if (type === 'dre') return responseData && (responseData.totalReceitas !== 0 || responseData.totalDespesas !== 0);
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
        
        const titles = {
            fluxoCaixa: 'Fluxo de Caixa',
            duplicatas: 'Consulta de Duplicatas',
            totalOperado: 'Análise ABC',
            dre: 'DRE Gerencial'
        };

        doc.text(`Relatório de ${titles[type]}`, pageWidth - 14, 22, { align: 'right' });
        
        let filterText = 'Filtros: ';
        if (currentFilters.dataInicio || currentFilters.dataFim) {
            filterText += `Período de ${formatDate(currentFilters.dataInicio) || '...'} a ${formatDate(currentFilters.dataFim) || '...'}. `;
        }
        // Filtros extras apenas se não for DRE
        if (type !== 'dre') {
            if (currentFilters.clienteNome) filterText += `Cedente: ${currentFilters.clienteNome}. `;
            if (currentFilters.sacado) filterText += `Sacado: ${currentFilters.sacado}. `;
        }
        
        doc.setFontSize(8);
        doc.text(filterText, 14, 30);

        let head, body;
        switch (type) {
            case 'fluxoCaixa':
                head = [['Data', 'Descrição', 'Conta', 'Categoria', 'Valor']];
                body = data.map(row => [formatDate(row.data_movimento), row.descricao, row.conta_bancaria, row.categoria, formatBRLNumber(row.valor)]);
                autoTable(doc, { startY: 35, head, body });
                
                const totaisPorCategoria = data.reduce((acc, row) => {
                    const { categoria, valor } = row;
                    if (!acc[categoria]) acc[categoria] = 0;
                    acc[categoria] += valor;
                    return acc;
                }, {});
                
                let finalY = doc.lastAutoTable.finalY + 15;
                doc.setFontSize(12);
                doc.text('Resumo por Categoria', 14, finalY);
                let cardX = 14;
                const cardWidth = 65;
                const cardHeight = 25;
                const cardMargin = 5;
                Object.entries(totaisPorCategoria).forEach(([categoria, total]) => {
                    if (cardX + cardWidth > pageWidth - 14) {
                        cardX = 14;
                        finalY += cardHeight + cardMargin;
                    }
                    doc.setFillColor(241, 241, 241); 
                    doc.roundedRect(cardX, finalY + 5, cardWidth, cardHeight, 3, 3, 'F');
                    doc.setTextColor(50, 50, 50);
                    doc.setFontSize(10);
                    doc.text(categoria, cardX + 4, finalY + 12);
                    doc.setFontSize(14);
                    doc.setFont('helvetica', 'bold');
                    doc.text(formatBRLNumber(total), cardX + 4, finalY + 20);
                    cardX += cardWidth + cardMargin;
                });
                break;

            case 'duplicatas':
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
                
                autoTable(doc, { startY: 35, head: head, body: body });
                autoTable(doc, {
                    startY: doc.lastAutoTable.finalY,
                    body: [['', '', '', '', '', 'TOTAIS:', formatBRLNumber(totalJurosOp), formatBRLNumber(totalJurosMora), formatBRLNumber(totalBruto)]],
                    theme: 'grid', bodyStyles: { fontStyle: 'bold', fillColor: [41, 128, 185], textColor: 255 }
                });
                break;

            case 'totalOperado':
                const processedCedentes = processAbcData(data.clientes);
                const processedSacados = processAbcData(data.sacados);
                doc.setFontSize(12);
                doc.text(`Total Operado no Período: ${formatBRLNumber(data.valorOperadoNoMes)}`, 14, 40);
                doc.text(`Total de Juros: ${formatBRLNumber(data.totalJuros)}`, 14, 45);
                doc.text(`Total de Despesas: ${formatBRLNumber(data.totalDespesas)}`, 14, 50);
                doc.text(`Lucro Líquido: ${formatBRLNumber(data.lucroLiquido)}`, 14, 55);
                
                if (processedCedentes.length > 0) {
                    autoTable(doc, { startY: 65, head: [['Classe', 'Cedente', 'Valor', '% Acumulado']], body: processedCedentes.map(c => [c.classe, c.name, formatBRLNumber(c.valor), `${c.acumulado.toFixed(2)}%`]) });
                }
                if (processedSacados.length > 0) {
                    autoTable(doc, { startY: doc.lastAutoTable.finalY + 10, head: [['Classe', 'Sacado', 'Valor', '% Acumulado']], body: processedSacados.map(s => [s.classe, s.name, formatBRLNumber(s.valor), `${s.acumulado.toFixed(2)}%`]) });
                }
                break;

            case 'dre':
                // Configuração da tabela DRE
                autoTable(doc, {
                    startY: 35,
                    head: [['Descrição', 'Valor']],
                    body: [
                        [{ content: 'RECEITAS OPERACIONAIS', colSpan: 2, styles: { fillColor: [220, 220, 220], fontStyle: 'bold', textColor: [0,0,0] } }],
                        ...data.receitas.map(r => [r.descricao, formatBRLNumber(r.valor)]),
                        [{ content: 'TOTAL DE RECEITAS', styles: { fontStyle: 'bold' } }, { content: formatBRLNumber(data.totalReceitas), styles: { fontStyle: 'bold', textColor: [0, 100, 0] } }],
                        
                        [{ content: '', colSpan: 2, styles: { fillColor: [255, 255, 255] } }], // Espaço

                        [{ content: 'DESPESAS OPERACIONAIS', colSpan: 2, styles: { fillColor: [220, 220, 220], fontStyle: 'bold', textColor: [0,0,0] } }],
                        ...data.despesas.map(d => [d.descricao, `(${formatBRLNumber(d.valor)})`]),
                        [{ content: 'TOTAL DE DESPESAS', styles: { fontStyle: 'bold' } }, { content: `(${formatBRLNumber(data.totalDespesas)})`, styles: { fontStyle: 'bold', textColor: [200, 0, 0] } }],

                        [{ content: '', colSpan: 2, styles: { fillColor: [255, 255, 255] } }], // Espaço

                        [{ content: 'RESULTADO (LUCRO/PREJUÍZO)', styles: { fontStyle: 'bold', fontSize: 12 } }, { content: formatBRLNumber(data.lucroLiquido), styles: { fontStyle: 'bold', fontSize: 12, textColor: data.lucroLiquido >= 0 ? [0, 100, 0] : [200, 0, 0] } }]
                    ],
                    theme: 'grid',
                    columnStyles: {
                        1: { halign: 'right', cellWidth: 60 }
                    }
                });
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
                ws_data = data.map(row => ({ 'Data Op.': formatDate(row.data_operacao), 'NF/CT-e': row.nf_cte, 'Cedente': row.empresa_cedente, 'Sacado': row.cliente_sacado, 'Vencimento': formatDate(row.data_vencimento), 'Status': row.status_recebimento, 'Juros Op.': row.valor_juros || 0, 'Juros Mora': row.juros_mora || 0, 'Valor Bruto': row.valor_bruto }));
                break;
            case 'totalOperado':
                const summary = [ { Item: 'Total Operado no Período', Valor: data.valorOperadoNoMes }, { Item: 'Total de Juros', Valor: data.totalJuros }, { Item: 'Total de Despesas', Valor: data.totalDespesas }, { Item: 'Lucro Líquido', Valor: data.lucroLiquido } ];
                const cedentesABC = processAbcData(data.clientes).map(c => ({ Classe: c.classe, Cedente: c.name, Valor: c.valor, '% Acumulado': c.acumulado / 100 }));
                const sacadosABC = processAbcData(data.sacados).map(s => ({ Classe: s.classe, Sacado: s.name, Valor: s.valor, '% Acumulado': s.acumulado / 100 }));
                
                const ws = XLSX.utils.json_to_sheet(summary);
                XLSX.utils.sheet_add_json(ws, cedentesABC, { origin: 'A7', header: ['Classe', 'Cedente', 'Valor', '% Acumulado'] });
                XLSX.utils.sheet_add_json(ws, sacadosABC, { origin: -1, header: ['Classe', 'Sacado', 'Valor', '% Acumulado'] });
                XLSX.utils.book_append_sheet(wb, ws, 'Análise ABC');
                XLSX.writeFile(wb, `relatorio_${type}.xlsx`);
                return;
            
            case 'dre':
                ws_data = [
                    { Descrição: 'RECEITAS', Valor: '' },
                    ...data.receitas.map(r => ({ Descrição: r.descricao, Valor: r.valor })),
                    { Descrição: 'TOTAL DE RECEITAS', Valor: data.totalReceitas },
                    { Descrição: '', Valor: '' },
                    { Descrição: 'DESPESAS', Valor: '' },
                    ...data.despesas.map(d => ({ Descrição: d.descricao, Valor: d.valor * -1 })), 
                    { Descrição: 'TOTAL DE DESPESAS', Valor: data.totalDespesas * -1 },
                    { Descrição: '', Valor: '' },
                    { Descrição: 'RESULTADO LÍQUIDO', Valor: data.lucroLiquido }
                ];
                break;
        }
        
        if (ws_data) {
            const ws = XLSX.utils.json_to_sheet(ws_data);
            XLSX.utils.book_append_sheet(wb, ws, 'Relatório');
            XLSX.writeFile(wb, `relatorio_${type}.xlsx`);
        }
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
                                <option value="dre">DRE Gerencial</option>
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
                    
                    {/* Campos de Filtro */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-gray-700 pt-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-300">Data Início</label>
                            <input type="date" name="dataInicio" value={filters.dataInicio} onChange={handleFilterChange} className="mt-1 w-full bg-gray-700 border-gray-600 rounded-md p-1.5 text-sm"/>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-300">Data Fim</label>
                            <input type="date" name="dataFim" value={filters.dataFim} onChange={handleFilterChange} className="mt-1 w-full bg-gray-700 border-gray-600 rounded-md p-1.5 text-sm"/>
                        </div>

                        {/* Filtros Extras: Escondidos para DRE e Fluxo de Caixa tem seus próprios */}
                        {reportType !== 'fluxoCaixa' && reportType !== 'dre' && (
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