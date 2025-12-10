'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { formatBRLNumber, formatDate, formatDisplayConta } from '../utils/formatters.jsx';
import Notification from '@/app/components/Notification';
import AprovacaoOperacaoModal from '@/app/components/AprovacaoOperacaoModal';
import EmailModal from '@/app/components/EmailModal';
import DescontoModal from '@/app/components/DescontoModal';
import PartialDebitModal from '@/app/components/PartialDebitModal';
import RecompraModal from '@/app/components/RecompraModal';
import PixReceiptModal from '@/app/components/PixReceiptModal';
import PixConfirmationModal from '@/app/components/PixConfirmationModal';

export default function AnalisePage() {
    const [operacoes, setOperacoes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [notification, setNotification] = useState({ message: '', type: '' });
    
    // Modais e Seleção
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [operacaoSelecionada, setOperacaoSelecionada] = useState(null);
    const [contasMaster, setContasMaster] = useState([]);

    // Email
    const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
    const [operacaoParaEmail, setOperacaoParaEmail] = useState(null);
    const [isSendingEmail, setIsSendingEmail] = useState(false);

    // PIX e Comprovante
    const [isPixConfirmOpen, setIsPixConfirmOpen] = useState(false);
    const [pixConfirmData, setPixConfirmData] = useState(null);
    const [isPixReceiptOpen, setIsPixReceiptOpen] = useState(false);
    const [pixReceiptData, setPixReceiptData] = useState(null);
    
    // Estados de Controle de Fluxo e Dados Temporários
    const [isPreparingPix, setIsPreparingPix] = useState(false); // NOVO: Controla o loading da transição
    const [pendingApprovalPayload, setPendingApprovalPayload] = useState(null);
    const [pendingPartialData, setPendingPartialData] = useState(null);
    
    // Dados cacheados para o Recibo
    const [cachedClientData, setCachedClientData] = useState(null); 
    const [cachedContaMasterData, setCachedContaMasterData] = useState(null);

    // Modais Auxiliares
    const [isDescontoModalOpen, setIsDescontoModalOpen] = useState(false);
    const [descontosAdicionais, setDescontosAdicionais] = useState([]);
    const [isSaving, setIsSaving] = useState(false);
    const [isPartialDebitModalOpen, setIsPartialDebitModalOpen] = useState(false);
    const [isRecompraModalOpen, setIsRecompraModalOpen] = useState(false);
    const [recompraData, setRecompraData] = useState(null);

    const getAuthHeader = () => {
        const token = sessionStorage.getItem('authToken');
        return token ? { 'Authorization': `Bearer ${token}` } : {};
    };

    const showNotification = (message, type) => {
        setNotification({ message, type });
        setTimeout(() => setNotification({ message: '', type: '' }), 5000);
    };

    const fetchPendentes = async () => {
        setLoading(true);
        try {
            const response = await fetch('/api/operacoes/pendentes', { headers: getAuthHeader() });
            if (!response.ok) throw new Error('Falha ao carregar operações pendentes.');
            const data = await response.json();
            setOperacoes(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };
    
    useEffect(() => {
        const fetchContas = async () => {
            try {
                const res = await fetch('/api/cadastros/contas/master', { headers: getAuthHeader() });
                if (res.ok) setContasMaster(await res.json());
            } catch (e) { console.error("Falha ao buscar contas master"); }
        };
        fetchContas();
        fetchPendentes();
    }, []);

    const handleAnalisarClick = (operacao) => {
        setOperacaoSelecionada(operacao);
        setDescontosAdicionais([]);
        setRecompraData(null);
        setIsModalOpen(true);
    };
    
    const handleConfirmRecompra = (data) => {
        if (data && data.credito !== null && data.principal !== null) {
            setRecompraData({ 
                ids: data.duplicataIds, 
                dataLiquidacao: operacaoSelecionada.data_operacao 
            });

            let descontosRecompra = [];
            // Adiciona descontos visuais
            if (data.principal > 0) descontosRecompra.push({ id: `rec-deb-${Date.now()}`, descricao: `Débito Recompra`, valor: Math.abs(data.principal) });
            if (data.credito > 0) descontosRecompra.push({ id: `rec-cred-${Date.now()}`, descricao: `Crédito Juros Recompra`, valor: -Math.abs(data.credito) });
            if (data.jurosAdicionais > 0) descontosRecompra.push({ id: `rec-juros-${Date.now()}`, descricao: `Juros Recompra`, valor: Math.abs(data.jurosAdicionais) });
            if (data.abatimentos > 0) descontosRecompra.push({ id: `rec-abat-${Date.now()}`, descricao: `Abatimento Recompra`, valor: -Math.abs(data.abatimentos) });
            
            setDescontosAdicionais(prev => [ ...prev, ...descontosRecompra ]);
            showNotification("Itens de recompra adicionados.", "success");
        }
    };

    const handleClosePixReceipt = () => {
        setIsPixReceiptOpen(false);
        setTimeout(() => {
            if (operacaoParaEmail) setIsEmailModalOpen(true);
        }, 300);
    };

    // --- LÓGICA CORE: PREPARAÇÃO DOS DADOS (CORRIGIDA) ---
    
    const prepareAndOpenPixConfirm = async (payload, partialData) => {
        // Ativa loading VISUAL (mantendo o modal de aprovação aberto)
        setIsPreparingPix(true); 
        
        try {
            setPendingApprovalPayload(payload);
            setPendingPartialData(partialData);

            // 1. DADOS DO RECEBEDOR (Cliente)
            // Busca dados completos para garantir que temos CNPJ e Chave Pix
            let clienteFull = operacaoSelecionada?.cliente || {};
            if (clienteFull.id) {
                try {
                    const resCli = await fetch(`/api/cadastros/clientes/${clienteFull.id}`, { headers: getAuthHeader() });
                    if (resCli.ok) clienteFull = await resCli.json();
                } catch (e) { console.error("Erro buscar cliente", e); }
            }
            setCachedClientData(clienteFull);

            // 2. DADOS DO PAGADOR (Sua Empresa/Conta Master)
            // Precisamos dos detalhes da conta para pegar o CNPJ do titular
            let contaMasterFull = contasMaster.find(c => String(c.id) === String(payload.conta_bancaria_id));
            
            // Tenta buscar detalhes mais profundos se a conta estiver incompleta
            // (Assumindo que talvez exista um endpoint ou que o objeto conta tenha campos aninhados)
            const dadosPagador = {
                nome: contaMasterFull?.titular || contaMasterFull?.descricao || 'Sua Empresa',
                // Tenta pegar CNPJ de vários lugares possíveis no objeto conta
                cnpj: contaMasterFull?.cnpj || contaMasterFull?.cpf_cnpj || contaMasterFull?.cnpj_cpf || contaMasterFull?.empresa?.cnpj || 'CNPJ não informado',
                banco: contaMasterFull?.banco || 'Banco',
                agencia: contaMasterFull?.agencia || '',
                conta: contaMasterFull?.conta || contaMasterFull?.conta_corrente || ''
            };
            setCachedContaMasterData(dadosPagador);

            // 3. CÁLCULO DE VALORES
            const totalDescontos = descontosAdicionais.reduce((acc, d) => acc + d.valor, 0);
            const valorFinal = partialData?.valorDebito 
                ? parseFloat(partialData.valorDebito)
                : (operacaoSelecionada?.valor_liquido || 0) - totalDescontos;

            // 4. PREPARA DADOS PARA O MODAL (Visualização)
            // Lógica melhorada para conta origem
            let contaOrigemDisplay = 'Sua Empresa';
            if (dadosPagador.banco) {
                contaOrigemDisplay = formatDisplayConta(`${dadosPagador.banco} - ${dadosPagador.agencia}/${dadosPagador.conta}`);
            } else if (dadosPagador.nome) {
                contaOrigemDisplay = dadosPagador.nome;
            }

            // Lógica melhorada para chave pix
            // Tenta achar a chave e o tipo correspondente na lista de contas do cliente se não tiver explícito
            let chavePix = clienteFull.chave_pix || clienteFull.chavePix;
            // Tenta achar nas contas
            const contaComPix = clienteFull.contasBancarias?.find(c => c.chave_pix);
            if (!chavePix && contaComPix) {
                chavePix = contaComPix.chave_pix;
            }

            let tipoChavePix = clienteFull.tipo_chave_pix;
            
            // Se achou uma conta com PIX mas não tinha tipo definido no cliente, pega da conta
            if (contaComPix && (!tipoChavePix || tipoChavePix === 'CPF/CNPJ')) {
                 if (contaComPix.tipo_chave_pix) tipoChavePix = contaComPix.tipo_chave_pix;
            }
            if (!tipoChavePix) tipoChavePix = 'CPF/CNPJ'; // Fallback final

            const pixData = {
                valor: valorFinal,
                contaOrigem: contaOrigemDisplay, 
                favorecido: clienteFull.razao_social || clienteFull.nome, 
                chave: chavePix || 'Chave não cadastrada',
                tipo_chave_pix: tipoChavePix
            };

            setPixConfirmData(pixData);

            // 5. TROCA DE MODAIS (Sem piscar a tela de fundo)
            // Aqui fechamos o modal de parcial explicitamente quando tudo estiver pronto
            setIsPartialDebitModalOpen(false); 
            setIsModalOpen(false); // Garante que o de aprovação também esteja fechado
            setIsPixConfirmOpen(true); // Abre Confirmação PIX

        } catch (error) {
            console.error("Erro ao preparar Pix:", error);
            showNotification("Erro ao preparar dados do pagamento.", "error");
        } finally {
            setIsPreparingPix(false);
        }
    };

    const handleApprovalConfirmation = async (payload) => {
        if (payload.status === 'Aprovada') {
            if (payload.isPartialDebit) {
                // Se parcial, fecha aprovação e abre modal de parcial
                setIsModalOpen(false);
                setPendingApprovalPayload(payload);
                setIsPartialDebitModalOpen(true);
            } else {
                // Se total, chama a função que busca dados (mantendo o loading no botão)
                await prepareAndOpenPixConfirm(payload, null);
            }
        } else {
            handleSalvarImediato(operacaoSelecionada.id, payload);
        }
    };

    const handleSalvarAnalise = async () => {
        if (!pendingApprovalPayload) return;

        setIsSaving(true);
        // Não fechamos o modal do Pix aqui ainda para evitar flicker se der erro, 
        // ou fechamos se quisermos mostrar loading geral. Vamos manter aberto com loading.

        try {
            const finalPayload = { 
                ...pendingApprovalPayload, 
                descontos: descontosAdicionais,
                valor_debito_parcial: pendingPartialData?.valorDebito || null,
                data_debito_parcial: pendingPartialData?.dataDebito || null,
                recompraData: recompraData
            };

            const response = await fetch(`/api/operacoes/${operacaoSelecionada.id}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
                body: JSON.stringify(finalPayload),
            });
            
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || "Erro ao salvar operação.");

            showNotification("Operação finalizada com sucesso!", "success");
            fetchPendentes();
            setIsPixConfirmOpen(false); // Agora sim fecha o modal de confirmação
            
            // --- GERAÇÃO DO COMPROVANTE (RECIBO) ---
            if (pendingApprovalPayload.status === 'Aprovada') {
                setOperacaoParaEmail({
                    id: operacaoSelecionada.id,
                    clienteId: operacaoSelecionada?.cliente?.id
                });

                // Recupera os dados cacheados (que já buscamos antes)
                const cliente = cachedClientData || {};
                const pagador = cachedContaMasterData || {};

                // Valor Final
                const valorFinal = pendingPartialData?.valorDebito 
                    ? parseFloat(pendingPartialData.valorDebito)
                    : (operacaoSelecionada?.valor_liquido || 0) - descontosAdicionais.reduce((acc, d) => acc + d.valor, 0);
                
                // Normalização CNPJ Recebedor (Evitar ".")
                const cnpjRecebedor = cliente.cnpj_cpf || cliente.cpf_cnpj || cliente.cnpj || 'Não informado';
                const chavePixFinal = cliente.chave_pix || cliente.chavePix || (cliente.contasBancarias?.[0]?.chave_pix) || 'Chave não informada';

                // Dados do Recibo
                const dadosComprovante = {
                    valor: valorFinal,
                    data: new Date(),
                    transactionId: result.transactionId || `OP-${operacaoSelecionada.id}-${Date.now()}`,
                    descricao: result.descricao || `Pagamento Operação #${operacaoSelecionada.id}`, // Usa a descrição vinda da API (ex: Borderô CTe 123, 456)
                    
                    pagador: {
                        nome: pagador.nome, 
                        cnpj: pagador.cnpj, 
                        conta: formatDisplayConta(`${pagador.banco} - ${pagador.agencia}/${pagador.conta}`)
                    },

                    recebedor: {
                        nome: cliente.razao_social || cliente.nome || 'Nome não informado',
                        cnpj: cnpjRecebedor,
                        instituicao: cliente.banco || (cliente.contasBancarias?.[0]?.banco) || 'Banco Destino',
                        chavePix: chavePixFinal
                    }
                };

                setPixReceiptData(dadosComprovante);
                setIsPixReceiptOpen(true);
            }

        } catch (err) {
            showNotification(err.message, "error");
            setIsPixConfirmOpen(false);
        } finally {
            setIsSaving(false);
            setRecompraData(null);
            setPendingApprovalPayload(null);
            setPendingPartialData(null);
        }
    };
    
    // Função para salvar REPROVAÇÕES (sem Pix)
    const handleSalvarImediato = async (operacaoId, payload) => {
        setIsSaving(true);
        try {
            const finalPayload = { ...payload, descontos: descontosAdicionais, recompraData: recompraData };
            const response = await fetch(`/api/operacoes/${operacaoId}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
                body: JSON.stringify(finalPayload),
            });
            if (!response.ok) throw new Error("Erro ao atualizar.");
            
            showNotification("Status atualizado!", "success");
            fetchPendentes();
            setIsModalOpen(false);
        } catch(e) { showNotification(e.message, "error"); } finally { setIsSaving(false); }
    };

    const handleSendEmail = async (destinatarios) => {
        if (!operacaoParaEmail) return;
        setIsSendingEmail(true);
        try {
            const response = await fetch(`/api/operacoes/${operacaoParaEmail.id}/enviar-email`, {
                method: "POST",
                headers: { "Content-Type": "application/json", ...getAuthHeader() },
                body: JSON.stringify({ destinatarios }),
            });
            if (!response.ok) throw new Error("Erro envio email.");
            showNotification("E-mail enviado!", "success");
        } catch (err) { showNotification(err.message, "error"); } finally {
            setIsSendingEmail(false); setIsEmailModalOpen(false); setOperacaoParaEmail(null);
        }
    };

    const valorLiq = (operacaoSelecionada?.valor_liquido || 0) - (descontosAdicionais.reduce((acc, d) => acc + d.valor, 0));

    return (
        <main className="h-full p-6 bg-gradient-to-br from-gray-900 to-gray-800 text-white flex flex-col">
            <Notification message={notification.message} type={notification.type} onClose={() => setNotification({ message: '', type: '' })} />
            
            {/* Modal de Confirmação do Pix */}
            <PixConfirmationModal 
                isOpen={isPixConfirmOpen} 
                onClose={() => setIsPixConfirmOpen(false)} 
                onConfirm={handleSalvarAnalise} 
                data={pixConfirmData} 
                isSending={isSaving} 
            />
            
            {/* Modal de Recibo */}
            <PixReceiptModal 
                isOpen={isPixReceiptOpen} 
                onClose={handleClosePixReceipt} 
                receiptData={pixReceiptData} 
            />

            <RecompraModal isOpen={isRecompraModalOpen} onClose={() => setIsRecompraModalOpen(false)} onConfirm={handleConfirmRecompra} dataNovaOperacao={operacaoSelecionada?.data_operacao} clienteId={operacaoSelecionada?.cliente?.id} />
            
            {/* Modal de Aprovação (Principal) */}
            <AprovacaoOperacaoModal 
                isOpen={isModalOpen} 
                onClose={() => !isPreparingPix && setIsModalOpen(false)} // Impede fechar se estiver carregando Pix
                onConfirm={handleApprovalConfirmation} 
                isSaving={isSaving || isPreparingPix} // Mostra loading no botão confirmar
                operacao={operacaoSelecionada} 
                contasBancarias={contasMaster}
                onAddDesconto={() => setIsDescontoModalOpen(true)} 
                onRecompraClick={() => setIsRecompraModalOpen(true)}
                descontosAdicionais={descontosAdicionais} 
                setDescontosAdicionais={setDescontosAdicionais}
            />

            <PartialDebitModal isOpen={isPartialDebitModalOpen} onClose={() => !isPreparingPix && setIsPartialDebitModalOpen(false)} onConfirm={(valorDebito, dataDebito) => { prepareAndOpenPixConfirm(pendingApprovalPayload, { valorDebito, dataDebito }); }} totalValue={valorLiq} isLoading={isPreparingPix} />
            <EmailModal isOpen={isEmailModalOpen} onClose={() => { setIsEmailModalOpen(false); setOperacaoParaEmail(null); }} onSend={handleSendEmail} isSending={isSendingEmail} clienteId={operacaoParaEmail?.clienteId} />
            <DescontoModal isOpen={isDescontoModalOpen} onClose={() => setIsDescontoModalOpen(false)} onSave={(novoDesconto) => { setDescontosAdicionais([...descontosAdicionais, novoDesconto]); setIsDescontoModalOpen(false); }} />

            <motion.header className="mb-6 border-b-2 border-orange-500 pb-4" initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
                <h1 className="text-3xl font-bold">Análise de Operações</h1>
                <p className="text-sm text-gray-300">Aprove ou rejeite os borderôs enviados pelos clientes.</p>
            </motion.header>

            <div className="flex-grow bg-gray-800 p-4 rounded-lg shadow-md overflow-auto">
                {loading ? <p className="text-center py-10">Carregando...</p> : 
                 error ? <p className="text-red-400 text-center py-10">{error}</p> :
                 operacoes.length === 0 ? <p className="text-center py-10 text-gray-400">Nenhuma operação pendente de análise.</p> :
                (
                    <table className="min-w-full divide-y divide-gray-700">
                        <thead className="bg-gray-700">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Data</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Cliente</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase">Valor Líquido</th>
                                <th className="px-6 py-3 text-center text-xs font-medium text-gray-300 uppercase">Ação</th>
                            </tr>
                        </thead>
                        <tbody className="bg-gray-800 divide-y divide-gray-700">
                            {operacoes.map((op) => (
                                <tr key={op.id} className="hover:bg-gray-700">
                                    <td className="px-6 py-4">{formatDate(op.data_operacao)}</td>
                                    <td className="px-6 py-4">{op.cliente.nome}</td>
                                    <td className="px-6 py-4 text-right">{formatBRLNumber(op.valor_liquido)}</td>
                                    <td className="px-6 py-4 text-center">
                                        <button onClick={() => handleAnalisarClick(op)} className="bg-orange-500 text-white font-semibold py-1 px-3 rounded-md text-sm hover:bg-orange-600">Analisar</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </main>
    );
}