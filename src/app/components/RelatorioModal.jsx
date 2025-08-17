'use client';

import { useState, useEffect } from 'react';
import AutocompleteSearch from './AutoCompleteSearch';
import AbcChart from './AbcChart'; // Importa o novo componente de gráfico
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
    const [abcData, setAbcData] = useState(null); // Estado para guardar os dados do gráfico

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
            setAbcData(null); // Limpa os dados do gráfico ao abrir
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

    useEffect(() => {
        setAbcData(null); // Limpa a pré-visualização ao mudar o tipo de relatório
    }, [reportType]);

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
        setAbcData(null);
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
                 setIsGenerating(false);
                 return;
            } 
            
            if (reportType === 'totalOperado') {
                const processedCedentes = processAbcData(data.clientes);
                const processedSacados = processAbcData(data.sacados);
                const fullData = { ...data, abc: { cedentes: processedCedentes, sacados: processedSacados }};
                setAbcData({ cedentes: processedCedentes, sacados: processedSacados });

                if (format === 'pdf') {
                    generatePdf(fullData, reportType, filters);
                } else {
                    generateExcel(fullData, reportType, filters);
                }
            } else {
                if (format === 'pdf') {
                    generatePdf(data, reportType, filters);
                } else {
                    generateExcel(data, reportType, filters);
                }
            }
            // onClose(); // Comentado para permitir a visualização do gráfico

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
                const showTipoOperacao = !currentFilters.tipoOperacaoId;
                head = [['Data Op.', 'NF/CT-e', 'Cedente', 'Sacado', ...(showTipoOperacao ? ['Tipo Op.'] : []), 'Venc.', 'Status', 'Valor']];
                body = data.map(row => [
                    formatDate(row.data_operacao), row.nf_cte, row.empresa_cedente, 
                    row.cliente_sacado, ...(showTipoOperacao ? [row.tipo_operacao_nome] : []),
                    formatDate(row.data_vencimento), row.status_recebimento, formatBRLNumber(row.valor_bruto)
                ]);
                autoTable(doc, { startY: 35, head, body });
                break;
            case 'totalOperado':
                doc.setFontSize(12);
                doc.text(`Total Operado no Período: ${formatBRLNumber(data.valorOperadoNoMes)}`, 14, 40);
                doc.text(`Total de Juros: ${formatBRLNumber(data.totalJuros)}`, 14, 45);
                doc.text(`Total de Despesas: ${formatBRLNumber(data.totalDespesas)}`, 14, 50);
                doc.text(`Lucro Líquido: ${formatBRLNumber(data.lucroLiquido)}`, 14, 55);
                
                if (data.abc.cedentes.length > 0) {
                    autoTable(doc, {
                        startY: 65,
                        head: [['Classe', 'Cedente', 'Valor', '% Acumulado']],
                        body: data.abc.cedentes.map(c => [c.classe, c.name, formatBRLNumber(c.valor), `${c.acumulado.toFixed(2)}%`])
                    });
                }
                
                if (data.abc.sacados.length > 0) {
                    autoTable(doc, {
                        startY: doc.lastAutoTable.finalY + 10,
                        head: [['Classe', 'Sacado', 'Valor', '% Acumulado']],
                        body: data.abc.sacados.map(s => [s.classe, s.name, formatBRLNumber(s.valor), `${s.acumulado.toFixed(2)}%`])
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
                const showTipoOperacao = !currentFilters.tipoOperacaoId;
                ws_data = data.map(row => ({ 
                    'Data Op.': formatDate(row.data_operacao), 'NF/CT-e': row.nf_cte, 'Cedente': row.empresa_cedente, 
                    'Sacado': row.cliente_sacado, ...(showTipoOperacao && { 'Tipo Operação': row.tipo_operacao_nome }),
                    'Vencimento': formatDate(row.data_vencimento), 'Status': row.status_recebimento, 'Valor Bruto': row.valor_bruto 
                }));
                break;
            case 'totalOperado':
                const summary = [ { Item: 'Total Operado no Período', Valor: data.valorOperadoNoMes }, { Item: 'Total de Juros', Valor: data.totalJuros }, { Item: 'Total de Despesas', Valor: data.totalDespesas }, { Item: 'Lucro Líquido', Valor: data.lucroLiquido }, ];
                const cedentesABC = data.abc.cedentes.map(c => ({ Classe: c.classe, Cedente: c.name, Valor: c.valor, '% Acumulado': c.acumulado }));
                const sacadosABC = data.abc.sacados.map(s => ({ Classe: s.classe, Sacado: s.name, Valor: s.valor, '% Acumulado': s.acumulado }));
                
                const ws = XLSX.utils.json_to_sheet(summary);
                XLSX.utils.sheet_add_json(ws, cedentesABC, { origin: 'A7', header: ['Classe', 'Cedente', 'Valor', '% Acumulado'] });
                XLSX.utils.sheet_add_json(ws, sacadosABC, { origin: -1, header: ['Classe', 'Sacado', 'Valor', '% Acumulado'] });
                
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
            <div className="bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-4xl text-white">
                <h2 className="text-xl font-bold mb-4">Gerar Relatório</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
                    {/* Coluna de Filtros */}
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

                    {/* Coluna do Gráfico (agora vazia por padrão) */}
                    <div className="border-t md:border-t-0 md:border-l border-gray-700 pt-4 md:pt-0 md:pl-8">
                        <h3 className="text-lg font-semibold mb-2 text-center">Análise ABC</h3>
                        {reportType === 'totalOperado' && abcData ? (
                            <>
                                <h4 className="text-md font-semibold mb-2 text-gray-300">Cedentes</h4>
                                <AbcChart data={abcData.cedentes} />
                                <h4 className="text-md font-semibold mt-4 mb-2 text-gray-300">Sacados</h4>
                                <AbcChart data={abcData.sacados} />
                            </>
                        ) : (
                            <div className="flex items-center justify-center h-full">
                                <p className="text-gray-500">{isGenerating ? 'A processar dados...' : 'Os gráficos da análise ABC aparecerão aqui após gerar o relatório.'}</p>
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
