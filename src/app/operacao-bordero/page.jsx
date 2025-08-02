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
import ConfirmacaoModal from '@/app/components/ConfirmacaoModal';
import EmailModal from '@/app/components/EmailModal';
import { formatBRLInput, parseBRL } from '@/app/utils/formatters';
import { API_URL } from '../apiConfig';

export default function OperacaoBorderoPage() {
    const [dataOperacao, setDataOperacao] = useState(new Date().toISOString().split('T')[0]);
    const [tipoOperacaoId, setTipoOperacaoId] = useState('');
    const [empresaCedente, setEmpresaCedente] = useState('');
    const [empresaCedenteId, setEmpresaCedenteId] = useState(null);
    const [novaNf, setNovaNf] = useState({ nfCte: '', dataNf: '', valorNf: '', clienteSacado: '', parcelas: '1', prazos: '', peso: '' });
    const [notasFiscais, setNotasFiscais] = useState([]);
    const [descontos, setDescontos] = useState([]);
    const [contasBancarias, setContasBancarias] = useState([]);
    const [contaBancariaId, setContaBancariaId] = useState('');
    const [isDescontoModalOpen, setIsDescontoModalOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [notification, setNotification] = useState({ message: '', type: '' });
    const fileInputRef = useRef(null);
    const [tiposOperacao, setTiposOperacao] = useState([]);
    const [clienteParaCriar, setClienteParaCriar] = useState(null);
    const [sacadoParaCriar, setSacadoParaCriar] = useState(null);
    const [xmlDataPendente, setXmlDataPendente] = useState(null);
    const [condicoesSacado, setCondicoesSacado] = useState([]);
    const [ignoreDespesasBancarias, setIgnoreDespesasBancarias] = useState(false);
    const [showEmailPrompt, setShowEmailPrompt] = useState(false);
    const [savedOperacaoInfo, setSavedOperacaoInfo] = useState(null);
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

    useEffect(() => {
        fetchTiposOperacao();
        fetchContasMaster();
    }, []);

    const fetchTiposOperacao = async () => {
        try {
            const res = await fetch(`${API_URL}/cadastros/tipos-operacao`, { headers: getAuthHeader() });
            const data = await res.json();
            setTiposOperacao(data);
        } catch (err) {
            showNotification('Erro ao carregar tipos de operação.', 'error');
        }
    };

    const fetchContasMaster = async () => {
        try {
            const res = await fetch(`${API_URL}/cadastros/contas/master`, { headers: getAuthHeader() });
            const data = await res.json();
            setContasBancarias(data);
            if (data.length > 0) setContaBancariaId(data[0].id);
        } catch (err) {
            showNotification('Erro ao carregar contas bancárias.', 'error');
        }
    };

    const fetchClientes = async (query) => {
        try {
            const res = await fetch(`${API_URL}/cadastros/clientes/search?nome=${query}`, { headers: getAuthHeader() });
            if (!res.ok) return [];
            return await res.json();
        } catch (error) {
            console.error("Erro ao buscar clientes:", error);
            return [];
        }
    };

    const fetchSacados = async (query) => {
        try {
            const res = await fetch(`${API_URL}/cadastros/sacados/search?nome=${query}`, { headers: getAuthHeader() });
            if (!res.ok) return [];
            return await res.json();
        } catch (error) {
            console.error("Erro ao buscar sacados:", error);
            return [];
        }
    };
    
    const handleXmlUpload = async (event) => {
        const file = event.target.files[0];
        if (!file) return;
        showNotification("A processar XML...", "info");
        const formData = new FormData();
        formData.append('file', file);
        try {
            const response = await fetch(`${API_URL}/upload/nfe-xml`, { 
                method: 'POST', 
                headers: { ...getAuthHeader() },
                body: formData 
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || 'Falha ao ler o ficheiro XML.');
            }
            const data = await response.json();
            setXmlDataPendente(data);
            if (!data.emitenteExiste) {
                setClienteParaCriar(data.emitente);
            } else if (!data.sacadoExiste) {
                setSacadoParaCriar(data.sacado);
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
        let valorFormatado = '';
        if (data.valorTotal) {
            const valorEmCentavosString = data.valorTotal.toFixed(2).replace('.', '');
            valorFormatado = formatBRLInput(valorEmCentavosString);
        }
        setNovaNf({
            nfCte: data.numeroNf || '',
            dataNf: data.dataEmissao ? data.dataEmissao.split('T')[0] : '',
            valorNf: valorFormatado,
            clienteSacado: data.sacado.nome || '',
            parcelas: data.parcelas ? String(data.parcelas.length) : '1',
            prazos: prazosString,
            peso: '',
        });
        setEmpresaCedente(data.emitente.nome || '');
        setEmpresaCedenteId(data.emitente.id || null);
        showNotification("Dados do XML preenchidos com sucesso!", "success");
        setXmlDataPendente(null);
    };

    const handleSaveNovoCliente = async (id, data) => {
        try {
            const response = await fetch(`${API_URL}/cadastros/clientes`, { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json', ...getAuthHeader() }, 
                body: JSON.stringify(data) 
            });
            if (!response.ok) throw new Error('Falha ao criar novo cliente.');
            
            const novoClienteCriado = await response.json();
            const updatedXmlData = {
                ...xmlDataPendente,
                emitente: { ...xmlDataPendente.emitente, id: novoClienteCriado.id },
                emitenteExiste: true
            };
            setXmlDataPendente(updatedXmlData);
            
            showNotification('Cliente criado com sucesso!', 'success');
            setClienteParaCriar(null);

            if (!updatedXmlData.sacadoExiste) {
                setSacadoParaCriar(updatedXmlData.sacado);
            } else {
                preencherFormularioComXml(updatedXmlData);
            }
        } catch (err) {
            showNotification(err.message, 'error');
        }
    };
    
    const handleSaveNovoSacado = async (id, data) => {
        try {
            const response = await fetch(`${API_URL}/cadastros/sacados`, { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json', ...getAuthHeader() }, 
                body: JSON.stringify(data) 
            });
            if (!response.ok) throw new Error('Falha ao criar novo sacado.');
            const novoSacadoCriado = await response.json();
            const updatedXmlData = {
                ...xmlDataPendente,
                sacado: { ...xmlDataPendente.sacado, id: novoSacadoCriado.id },
                sacadoExiste: true
            };
            showNotification('Sacado criado com sucesso!', 'success');
            setSacadoParaCriar(null);
            preencherFormularioComXml(updatedXmlData);
        } catch (err) {
            showNotification(err.message, 'error');
        }
    };

    const handleSelectCedente = (cliente) => {
        setEmpresaCedente(cliente.nome);
        setEmpresaCedenteId(cliente.id);
    };
    
    const handleCedenteChange = (newName) => {
        setEmpresaCedente(newName);
        setEmpresaCedenteId(null);
    };

    const handleSelectSacado = (sacado) => {
        setCondicoesSacado(sacado.condicoesPagamento || []);
        if (sacado.condicoesPagamento && sacado.condicoesPagamento.length > 0) {
            const condicaoPadrao = sacado.condicoesPagamento[0];
            setNovaNf(prev => ({ ...prev, clienteSacado: sacado.nome, prazos: condicaoPadrao.prazos, parcelas: String(condicaoPadrao.parcelas) }));
            showNotification('Prazos e parcelas preenchidos automaticamente.', 'success');
        } else {
            setNovaNf(prev => ({ ...prev, clienteSacado: sacado.nome, prazos: '', parcelas: '1' }));
            showNotification('Sacado selecionado. Nenhuma condição automática encontrada.', 'warning');
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
            dataOperacao, tipoOperacaoId: parseInt(tipoOperacaoId), clienteSacado: novaNf.clienteSacado, 
            dataNf: novaNf.dataNf, valorNf: valorNfFloat, parcelas: parseInt(novaNf.parcelas) || 1, 
            prazos: novaNf.prazos, peso: parseFloat(String(novaNf.peso).replace(',', '.')) || null
        };
        try {
            const response = await fetch(`${API_URL}/operacoes/calcular-juros`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeader() }, body: JSON.stringify(body) });
            if (!response.ok) throw new Error(await response.text() || 'Falha ao calcular os juros.');
            const calculoResult = await response.json();
            setNotasFiscais([...notasFiscais, { id: Date.now(), ...novaNf, valorNf: valorNfFloat, parcelas: parseInt(novaNf.parcelas) || 1, jurosCalculado: calculoResult.totalJuros, valorLiquidoCalculado: calculoResult.valorLiquido }]);
            setNovaNf({ nfCte: '', dataNf: '', valorNf: '', clienteSacado: '', parcelas: '1', prazos: '', peso: '' });
        } catch (error) {
            showNotification(error.message, 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSalvarOperacao = async () => {
        if (notasFiscais.length === 0 || !contaBancariaId) {
            showNotification('Adicione ao menos uma NF e selecione uma conta bancária.', 'error');
            return;
        }
        if (!empresaCedenteId) {
            showNotification('Selecione um cedente válido da lista antes de salvar.', 'error');
            return;
        }
        setIsSaving(true);
        const payload = {
            dataOperacao,
            tipoOperacaoId: parseInt(tipoOperacaoId),
            clienteId: empresaCedenteId,
            contaBancariaId: parseInt(contaBancariaId),
            descontos: todosOsDescontos.map(({ id, ...rest }) => rest),
            notasFiscais: notasFiscais.map(nf => ({ ...nf, jurosCalculado: undefined, valorLiquidoCalculado: undefined, peso: parseFloat(String(nf.peso).replace(',', '.')) || null }))
        };
        try {
            const response = await fetch(`${API_URL}/operacoes/salvar`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeader() }, body: JSON.stringify(payload) });
            if (!response.ok) throw new Error(await response.text() || 'Ocorreu um erro ao guardar a operação.');
            const operacaoId = await response.json();
            const tipoOp = tiposOperacao.find(op => op.id === parseInt(tipoOperacaoId));
            setSavedOperacaoInfo({ id: operacaoId, tipoOperacao: tipoOp?.nome, clienteId: empresaCedenteId });
            setShowEmailPrompt(true);
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
            const response = await fetch(`${API_URL}/operacoes/${savedOperacaoInfo.id}/enviar-email`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeader() }, body: JSON.stringify({ destinatarios }) });
            if (!response.ok) throw new Error("Falha ao enviar o e-mail.");
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
        setNotasFiscais([]);
        setDescontos([]);
        setNovaNf({ nfCte: '', dataNf: '', valorNf: '', clienteSacado: '', parcelas: '1', prazos: '', peso: '' });
        setCondicoesSacado([]);
        setIgnoreDespesasBancarias(false);
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

    const totais = useMemo(() => {
        const valorTotalBruto = notasFiscais.reduce((acc, nf) => acc + nf.valorNf, 0);
        const desagioTotal = notasFiscais.reduce((acc, nf) => acc + (nf.jurosCalculado || 0), 0);
        const totalOutrosDescontos = todosOsDescontos.reduce((acc, d) => acc + d.valor, 0);
        const selectedOperacao = tiposOperacao.find(op => op.id === parseInt(tipoOperacaoId));
        const isValorFixoType = selectedOperacao && selectedOperacao.valorFixo > 0;
        const liquidoOperacao = isValorFixoType ? valorTotalBruto - totalOutrosDescontos : valorTotalBruto - desagioTotal - totalOutrosDescontos;
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
            <EditClienteModal isOpen={!!clienteParaCriar} onClose={() => setClienteParaCriar(null)} cliente={clienteParaCriar} onSave={handleSaveNovoCliente} showNotification={showNotification} />
            <EditSacadoModal isOpen={!!sacadoParaCriar} onClose={() => setSacadoParaCriar(null)} sacado={sacadoParaCriar} onSave={handleSaveNovoSacado} showNotification={showNotification} />
            
            <ConfirmacaoModal 
                isOpen={showEmailPrompt}
                onClose={() => {
                    setShowEmailPrompt(false);
                    finalizarOperacao();
                }}
                onConfirm={() => {
                    setShowEmailPrompt(false);
                    setIsEmailModalOpen(true);
                }}
                title="Envio de E-mail"
                message="Deseja enviar o Borderô por email?"
            />
            
            <EmailModal 
                isOpen={isEmailModalOpen}
                onClose={handleCloseEmailModal}
                onSend={handleSendEmail}
                isSending={isSendingEmail}
                clienteId={savedOperacaoInfo?.clienteId}
            />

            <main className="min-h-screen pt-16 p-6 bg-gradient-to-br from-gray-900 to-gray-800 text-white">
                <motion.header className="mb-4 flex justify-between items-center border-b-2 border-orange-500 pb-4" initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
                    <div>
                        <h1 className="text-3xl font-bold">Criar Borderô</h1>
                        <p className="text-sm text-gray-300 mt-1">Preencha os dados abaixo ou importe um XML.</p>
                    </div>
                    <div>
                        <input type="file" accept=".xml" ref={fileInputRef} onChange={handleXmlUpload} style={{ display: 'none' }} id="xml-upload-input"/>
                        <button onClick={() => fileInputRef.current.click()} className="bg-gray-700 text-white font-semibold py-2 px-4 rounded-md shadow-sm hover:bg-gray-600 transition">Importar NF-e (XML)</button>
                    </div>
                </motion.header>

                <OperacaoHeader dataOperacao={dataOperacao} setDataOperacao={setDataOperacao} tipoOperacaoId={tipoOperacaoId} setTipoOperacaoId={setTipoOperacaoId} tiposOperacao={tiposOperacao} empresaCedente={empresaCedente} onCedenteChange={handleCedenteChange} onSelectCedente={handleSelectCedente} fetchClientes={fetchClientes} />
                <AdicionarNotaFiscalForm novaNf={novaNf} handleInputChange={handleInputChange} handleAddNotaFiscal={handleAddNotaFiscal} isLoading={isLoading} onSelectSacado={handleSelectSacado} fetchSacados={fetchSacados} condicoesSacado={condicoesSacado} setNovaNf={setNovaNf} />
                <OperacaoDetalhes notasFiscais={notasFiscais} descontos={todosOsDescontos} totais={totais} handleSalvarOperacao={handleSalvarOperacao} handleLimparTudo={handleLimparTudo} isSaving={isSaving} onAddDescontoClick={() => setIsDescontoModalOpen(true)} onRemoveDesconto={handleRemoveDesconto} contasBancarias={contasBancarias} contaBancariaId={contaBancariaId} setContaBancariaId={setContaBancariaId} />
            </main>
        </>
    );
}