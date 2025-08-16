'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import AdicionarNotaFiscalForm from '@/app/components/AdicionarNotaFiscalForm';
import OperacaoDetalhes from '@/app/components/OperacaoDetalhes';
import OperacaoHeader from '@/app/components/OperacaoHeader';
import Notification from '@/app/components/Notification';
import DescontoModal from '@/app/components/DescontoModal';
import EditClienteModal from '@/app/components/EditClienteModal';
import EditSacadoModal from '@/app/components/EditSacadoModal';
import EmailModal from '@/app/components/EmailModal';
import PartialDebitModal from '@/app/components/PartialDebitModal'; // Importar
import { formatBRLInput, parseBRL } from '@/app/utils/formatters';

export default function OperacaoBorderoPage() {
    const [dataOperacao, setDataOperacao] = useState(new Date().toISOString().split('T')[0]);
    const [tipoOperacaoId, setTipoOperacaoId] = useState('');
    const [empresaCedente, setEmpresaCedente] = useState('');
    const [empresaCedenteId, setEmpresaCedenteId] = useState(null);
    const [cedenteRamo, setCedenteRamo] = useState('');
    const [novaNf, setNovaNf] = useState({ nfCte: '', dataNf: '', valorNf: '', clienteSacado: '', parcelas: '1', prazos: '', peso: '' });
    const [notasFiscais, setNotasFiscais] = useState([]);
    const [descontos, setDescontos] = useState([]);
    const [contasBancarias, setContasBancarias] = useState([]);
    const [contaBancariaId, setContaBancariaId] = useState('');
    const [isDescontoModalOpen, setIsDescontoModalOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [notification, setNotification] = useState({ message: '', type: '' });
    const [tiposOperacao, setTiposOperacao] = useState([]);
    const [condicoesSacado, setCondicoesSacado] = useState([]);
    const [ignoreDespesasBancarias, setIgnoreDespesasBancarias] = useState(false);
    const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
    const [savedOperacaoInfo, setSavedOperacaoInfo] = useState(null);
    const [isSendingEmail, setIsSendingEmail] = useState(false);

    // Novos estados para o débito parcial
    const [isPartialDebit, setIsPartialDebit] = useState(false);
    const [isPartialDebitModalOpen, setIsPartialDebitModalOpen] = useState(false);

    const fileInputRef = useRef(null);
    const cteFileInputRef = useRef(null);
    const [xmlDataPendente, setXmlDataPendente] = useState(null);
    const [isClienteModalOpen, setIsClienteModalOpen] = useState(false);
    const [isSacadoModalOpen, setIsSacadoModalOpen] = useState(false);
    const [clienteParaCriar, setClienteParaCriar] = useState(null);
    const [sacadoParaCriar, setSacadoParaCriar] = useState(null);

    const getAuthHeader = () => {
        const token = sessionStorage.getItem('authToken');
        return token ? { 'Authorization': `Bearer ${token}` } : {};
    };

    const showNotification = (message, type) => {
        setNotification({ message, type });
        setTimeout(() => setNotification({ message: '', type: '' }), 5000);
    };

    const fetchApiData = async (url) => {
        try {
            const res = await fetch(url, { headers: getAuthHeader() });
            if (!res.ok) return [];
            return await res.json();
        } catch { return []; }
    };
    
    useEffect(() => {
        const fetchInitialData = async () => {
            const [tiposData, contasData] = await Promise.all([
                fetchApiData(`/api/cadastros/tipos-operacao`),
                fetchApiData(`/api/cadastros/contas/master`),
            ]);
             const formattedTipos = tiposData.map(t => ({...t, taxaJuros: t.taxa_juros, valorFixo: t.valor_fixo, despesasBancarias: t.despesas_bancarias, usarPrazoSacado: t.usar_prazo_sacado, usarPesoNoValorFixo: t.usar_peso_no_valor_fixo}));
            const formattedContas = contasData.map(c => ({...c, contaCorrente: c.conta_corrente}));

            setTiposOperacao(formattedTipos);
            setContasBancarias(formattedContas);
            if (formattedContas.length > 0) setContaBancariaId(formattedContas[0].id);
        };
        fetchInitialData();
    }, []);

    const fetchClientes = (query) => fetchApiData(`/api/cadastros/clientes/search?nome=${query}`);
    const fetchSacados = (query) => fetchApiData(`/api/cadastros/sacados/search?nome=${query}`);
    
    // ... (as outras funções como handleXmlUpload, etc, permanecem as mesmas)
    const handleCtePdfUpload = async (event) => {
        const file = event.target.files[0];
        if (!file) return;
        showNotification("A processar CT-e PDF...", "info");
        const formData = new FormData();
        formData.append('file', file);
        try {
            const response = await fetch(`/api/upload/cte-pdf`, { 
                method: 'POST', 
                headers: { ...getAuthHeader() },
                body: formData 
            });
            if (!response.ok) {
                const errorText = await response.json();
                throw new Error(errorText.message || 'Falha ao ler o ficheiro PDF.');
            }
            const data = await response.json();
            
            setXmlDataPendente(data);
            if (!data.emitenteExiste) {
                setClienteParaCriar(data.emitente);
                setIsClienteModalOpen(true);
            } else if (!data.sacadoExiste) {
                setSacadoParaCriar(data.sacado);
                setIsSacadoModalOpen(true);
            } else {
                preencherFormularioComXml(data);
            }

        } catch (error) {
            showNotification(error.message, 'error');
        } finally {
            if (cteFileInputRef.current) cteFileInputRef.current.value = '';
        }
    };
    
    const handleXmlUpload = async (event) => {
        const file = event.target.files[0];
        if (!file) return;
        showNotification("A processar XML...", "info");
        const formData = new FormData();
        formData.append('file', file);
        try {
            const response = await fetch(`/api/upload/nfe-xml`, { 
                method: 'POST', 
                headers: { ...getAuthHeader() },
                body: formData 
            });
            if (!response.ok) {
                const errorText = await response.json();
                throw new Error(errorText.message || 'Falha ao ler o ficheiro XML.');
            }
            const data = await response.json();
            setXmlDataPendente(data);
            if (!data.emitenteExiste) {
                setClienteParaCriar(data.emitente);
                setIsClienteModalOpen(true);
            } else if (!data.sacadoExiste) {
                setSacadoParaCriar(data.sacado);
                setIsSacadoModalOpen(true);
            } else {
                preencherFormularioComXml(data);
            }
        } catch (error) {
            showNotification(error.message, 'error');
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const preencherFormularioComXml = (data) => {
        const prazosArray = data.parcelas ? data.parcelas.map(p => {
            const d1 = new Date(data.dataEmissao);
            const d2 = new Date(p.dataVencimento);
            return Math.ceil(Math.abs(d2 - d1) / (1000 * 60 * 60 * 24));
        }) : [];
        const prazosString = prazosArray.join('/');
        const valorFormatado = data.valorTotal ? formatBRLInput(String(data.valorTotal * 100)) : '';

        setNovaNf({
            nfCte: data.numeroNf || data.numeroCte || '',
            dataNf: data.dataEmissao ? data.dataEmissao.split('T')[0] : '',
            valorNf: valorFormatado,
            clienteSacado: data.sacado.nome || '',
            parcelas: data.parcelas && data.parcelas.length > 0 ? String(data.parcelas.length) : '1',
            prazos: prazosString,
            peso: '',
        });
        setEmpresaCedente(data.emitente.nome || '');
        setEmpresaCedenteId(data.emitente.id || null);
        setCedenteRamo(data.emitente.ramo_de_atividade || '');
        showNotification("Dados do ficheiro preenchidos com sucesso!", "success");
        setXmlDataPendente(null);
    };
    
    const handleSaveNovoCliente = async (id, data) => {
        try {
            const response = await fetch(`/api/cadastros/clientes`, { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json', ...getAuthHeader() }, 
                body: JSON.stringify(data) 
            });
            if (!response.ok) {
                const errorText = await response.json();
                throw new Error(errorText.message || 'Falha ao criar novo cliente.');
            }
            
            const novoClienteCriado = await response.json();
            const updatedXmlData = {
                ...xmlDataPendente,
                emitente: { ...xmlDataPendente.emitente, id: novoClienteCriado.id, ramo_de_atividade: data.ramoDeAtividade },
                emitenteExiste: true
            };
            setXmlDataPendente(updatedXmlData);
            
            showNotification('Cliente criado com sucesso!', 'success');
            setIsClienteModalOpen(false);

            if (!updatedXmlData.sacadoExiste) {
                setSacadoParaCriar(updatedXmlData.sacado);
                setIsSacadoModalOpen(true);
            } else {
                preencherFormularioComXml(updatedXmlData);
            }
             return { success: true };
        } catch (err) {
            showNotification(err.message, 'error');
            return { success: false, message: err.message };
        }
    };
    
    const handleSaveNovoSacado = async (id, data) => {
        try {
            const response = await fetch(`/api/cadastros/sacados`, { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json', ...getAuthHeader() }, 
                body: JSON.stringify(data) 
            });
            if (!response.ok) {
                const errorText = await response.json();
                throw new Error(errorText.message || 'Falha ao criar novo sacado.');
            }
            const novoSacadoCriado = await response.json();
            const updatedXmlData = {
                ...xmlDataPendente,
                sacado: { ...xmlDataPendente.sacado, id: novoSacadoCriado.id },
                sacadoExiste: true
            };
            showNotification('Sacado criado com sucesso!', 'success');
            setIsSacadoModalOpen(false);
            preencherFormularioComXml(updatedXmlData);
            return { success: true };
        } catch (err) {
            showNotification(err.message, 'error');
            return { success: false, message: err.message };
        }
    };

    const handleSelectCedente = (cliente) => {
        setEmpresaCedente(cliente.nome);
        setEmpresaCedenteId(cliente.id);
        setCedenteRamo(cliente.ramo_de_atividade || '');
    };

    const handleCedenteChange = (newName) => {
        setEmpresaCedente(newName);
        setEmpresaCedenteId(null);
        setCedenteRamo('');
    };

    const handleSelectSacado = (sacado) => {
        const condicoes = sacado.condicoes_pagamento || sacado.condicoesPagamento || [];
        setCondicoesSacado(condicoes);
        if (condicoes.length > 0) {
            const condicaoPadrao = condicoes[0];
            setNovaNf(prev => ({ ...prev, clienteSacado: sacado.nome, prazos: condicaoPadrao.prazos, parcelas: String(condicaoPadrao.parcelas) }));
        } else {
            setNovaNf(prev => ({ ...prev, clienteSacado: sacado.nome, prazos: '', parcelas: '1' }));
        }
    };
    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setNovaNf(prevState => ({ ...prevState, [name]: name === 'valorNf' ? formatBRLInput(value) : value }));
    };
    const handleAddNotaFiscal = async (e) => {
        e.preventDefault();
        if (!tipoOperacaoId || !dataOperacao || !novaNf.clienteSacado) {
            showNotification('Preencha os Dados da Operação e o Sacado primeiro.', 'error');
            return;
        }
        setIsLoading(true);
        const valorNfFloat = parseBRL(novaNf.valorNf);
        const body = { 
            dataOperacao, tipoOperacaoId: parseInt(tipoOperacaoId), 
            dataNf: novaNf.dataNf, valorNf: valorNfFloat, parcelas: parseInt(novaNf.parcelas) || 1, 
            prazos: novaNf.prazos, peso: parseFloat(String(novaNf.peso).replace(',', '.')) || null
        };
        try {
            const response = await fetch(`/api/operacoes/calcular-juros`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeader() }, body: JSON.stringify(body) });
            if (!response.ok) throw new Error(await response.text() || 'Falha ao calcular os juros.');
            const calculoResult = await response.json();
            setNotasFiscais([...notasFiscais, { 
                id: Date.now(), ...novaNf, valorNf: valorNfFloat, 
                parcelas: parseInt(novaNf.parcelas) || 1, 
                jurosCalculado: calculoResult.totalJuros, 
                valorLiquidoCalculado: calculoResult.valorLiquido,
                parcelasCalculadas: calculoResult.parcelasCalculadas
            }]);
            setNovaNf({ nfCte: '', dataNf: '', valorNf: '', clienteSacado: '', parcelas: '1', prazos: '', peso: '' });
        } catch (error) {
            showNotification(error.message, 'error');
        } finally {
            setIsLoading(false);
        }
    };
    
    // Função principal que decide o fluxo de salvamento
    const handleSalvarOperacao = () => {
        if (notasFiscais.length === 0 || !contaBancariaId) {
            showNotification('Adicione ao menos uma NF e selecione uma conta bancária.', 'error');
            return;
        }
        if (!empresaCedenteId) {
            showNotification('Selecione um cedente válido da lista antes de salvar.', 'error');
            return;
        }

        if (isPartialDebit) {
            setIsPartialDebitModalOpen(true);
        } else {
            // Chama com valor null para indicar débito total
            confirmarSalvamento(null, null);
        }
    };

    // Função que efetivamente envia para a API
    const confirmarSalvamento = async (valorDebito, dataDebito) => {
        setIsPartialDebitModalOpen(false);
        setIsSaving(true);
        
        const payload = {
            dataOperacao,
            tipoOperacaoId: parseInt(tipoOperacaoId),
            clienteId: empresaCedenteId,
            contaBancariaId: parseInt(contaBancariaId),
            descontos: todosOsDescontos.map(({ id, ...rest }) => rest),
            notasFiscais: notasFiscais.map(nf => ({ ...nf, peso: parseFloat(String(nf.peso).replace(',', '.')) || null })),
            cedenteRamo,
            valorDebito: valorDebito, // Pode ser null para débito total
            dataDebito: dataDebito, // Pode ser null
        };

        try {
            const response = await fetch(`/api/operacoes/salvar`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeader() }, body: JSON.stringify(payload) });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Ocorreu um erro ao guardar a operação.');
            }
            const operacaoId = await response.json();
            setSavedOperacaoInfo({ id: operacaoId, clienteId: empresaCedenteId });
            setIsEmailModalOpen(true);
        } catch (error) {
            showNotification(error.message, 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const finalizarOperacao = () => {
        if (savedOperacaoInfo) {
            showNotification(`Operação salva com sucesso!`, 'success');
        }
        handleLimparTudo(false);
    };
    const handleSendEmail = async (destinatarios) => {
        if (!savedOperacaoInfo) return;
        setIsSendingEmail(true);
        try {
            const response = await fetch(`/api/operacoes/${savedOperacaoInfo.id}/enviar-email`, { 
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
            finalizarOperacao();
        }
    };
    const handleCloseEmailModal = () => {
        setIsEmailModalOpen(false);
        finalizarOperacao();
    };
    const handleLimparTudo = (showMsg = true) => {
        setDataOperacao(new Date().toISOString().split('T')[0]);
        setTipoOperacaoId('');
        setEmpresaCedente('');
        setEmpresaCedenteId(null);
        setCedenteRamo('');
        setNotasFiscais([]);
        setDescontos([]);
        setNovaNf({ nfCte: '', dataNf: '', valorNf: '', clienteSacado: '', parcelas: '1', prazos: '', peso: '' });
        setCondicoesSacado([]);
        setIgnoreDespesasBancarias(false);
        setIsPartialDebit(false); // Reseta o checkbox de débito parcial
        if (showMsg) showNotification('Formulário limpo.', 'success');
    };
    const todosOsDescontos = useMemo(() => {
        const selectedOperacao = tiposOperacao.find(op => op.id === parseInt(tipoOperacaoId));
        const despesasBancarias = selectedOperacao?.despesasBancarias || 0;
        const combined = [...descontos];
        if (despesasBancarias > 0 && !ignoreDespesasBancarias) {
            combined.push({ id: 'despesas-bancarias', descricao: 'Despesas Bancárias', valor: despesasBancarias });
        }
        return combined;
    }, [descontos, tipoOperacaoId, tiposOperacao, ignoreDespesasBancarias]);
    
    const showPeso = useMemo(() => {
        const selectedOperacao = tiposOperacao.find(op => op.id === parseInt(tipoOperacaoId));
        return selectedOperacao?.usarPesoNoValorFixo || false;
    }, [tipoOperacaoId, tiposOperacao]);

    const totais = useMemo(() => {
        const valorTotalBruto = notasFiscais.reduce((acc, nf) => acc + nf.valorNf, 0);
        const desagioTotal = notasFiscais.reduce((acc, nf) => acc + (nf.jurosCalculado || 0), 0);
        const totalOutrosDescontos = todosOsDescontos.reduce((acc, d) => acc + d.valor, 0);
        
        const selectedOperacao = tiposOperacao.find(op => op.id === parseInt(tipoOperacaoId));
        const isOperacaoAVista = selectedOperacao && selectedOperacao.nome.toLowerCase().includes('a vista');

        const liquidoOperacao = isOperacaoAVista
            ? valorTotalBruto - totalOutrosDescontos
            : valorTotalBruto - desagioTotal - totalOutrosDescontos;

        return { valorTotalBruto, desagioTotal, totalOutrosDescontos, liquidoOperacao };
    }, [notasFiscais, todosOsDescontos, tipoOperacaoId, tiposOperacao]);

    const handleRemoveDesconto = (idToRemove) => {
        if (idToRemove === 'despesas-bancarias') {
            setIgnoreDespesasBancarias(true);
        } else {
            setDescontos(descontos.filter(d => d.id !== idToRemove));
        }
    };

    return (
        <>
            <Notification message={notification.message} type={notification.type} onClose={() => setNotification({ message: '', type: '' })} />
            <DescontoModal isOpen={isDescontoModalOpen} onClose={() => setIsDescontoModalOpen(false)} onSave={(d) => setDescontos([...descontos, d])} />
            
            <EditClienteModal isOpen={isClienteModalOpen} onClose={() => setClienteParaCriar(null)} onSave={handleSaveNovoCliente} cliente={clienteParaCriar} />
            <EditSacadoModal isOpen={isSacadoModalOpen} onClose={() => setSacadoParaCriar(null)} onSave={handleSaveNovoSacado} sacado={sacadoParaCriar} />

            <EmailModal 
                isOpen={isEmailModalOpen}
                onClose={handleCloseEmailModal}
                onSend={handleSendEmail}
                isSending={isSendingEmail}
                clienteId={savedOperacaoInfo?.clienteId}
            />

            <PartialDebitModal
                isOpen={isPartialDebitModalOpen}
                onClose={() => setIsPartialDebitModalOpen(false)}
                onConfirm={confirmarSalvamento}
                totalValue={totais.liquidoOperacao}
            />

            <main className="min-h-screen pt-16 p-6 bg-gradient-to-br from-gray-900 to-gray-800 text-white">
                <motion.header className="mb-4 flex justify-between items-center border-b-2 border-orange-500 pb-4" initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
                    <div>
                        <h1 className="text-3xl font-bold">Criar Borderô</h1>
                        <p className="text-sm text-gray-300 mt-1">Preencha os dados abaixo ou importe um XML/PDF</p>
                    </div>
                    <div className="flex gap-2">
                        <input type="file" accept=".xml" ref={fileInputRef} onChange={handleXmlUpload} style={{ display: 'none' }} />
                        <button onClick={() => fileInputRef.current.click()} className="bg-gray-700 text-white font-semibold py-2 px-4 rounded-md shadow-sm hover:bg-gray-600 transition">Importar NF-e (XML)</button>
                        
                        <input type="file" accept=".pdf" ref={cteFileInputRef} onChange={handleCtePdfUpload} style={{ display: 'none' }} />
                        <button onClick={() => cteFileInputRef.current.click()} className="bg-blue-600 text-white font-semibold py-2 px-4 rounded-md shadow-sm hover:bg-blue-700 transition">Importar CT-e (PDF)</button>
                    </div>
                </motion.header>

                <OperacaoHeader 
                    dataOperacao={dataOperacao} setDataOperacao={setDataOperacao} 
                    tipoOperacaoId={tipoOperacaoId} setTipoOperacaoId={setTipoOperacaoId} 
                    tiposOperacao={tiposOperacao} empresaCedente={empresaCedente} 
                    onCedenteChange={handleCedenteChange} onSelectCedente={handleSelectCedente} 
                    fetchClientes={fetchClientes} 
                />
                <AdicionarNotaFiscalForm 
                    novaNf={novaNf} handleInputChange={handleInputChange} 
                    handleAddNotaFiscal={handleAddNotaFiscal} isLoading={isLoading} 
                    onSelectSacado={handleSelectSacado} fetchSacados={fetchSacados} 
                    condicoesSacado={condicoesSacado} setNovaNf={setNovaNf}
                    cedenteRamo={cedenteRamo}
                    showPeso={showPeso}
                />
                <OperacaoDetalhes 
                    notasFiscais={notasFiscais} descontos={todosOsDescontos} totais={totais} 
                    handleSalvarOperacao={handleSalvarOperacao} handleLimparTudo={handleLimparTudo} 
                    isSaving={isSaving} onAddDescontoClick={() => setIsDescontoModalOpen(true)} 
                    onRemoveDesconto={handleRemoveDesconto} contasBancarias={contasBancarias} 
                    contaBancariaId={contaBancariaId} setContaBancariaId={setContaBancariaId}
                    cedenteRamo={cedenteRamo}
                    isPartialDebit={isPartialDebit} 
                    setIsPartialDebit={setIsPartialDebit} 
                />
            </main>
        </>
    );
}