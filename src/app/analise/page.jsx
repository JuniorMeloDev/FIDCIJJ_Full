'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { formatBRLNumber, formatDate } from '../utils/formatters';
import Notification from '@/app/components/Notification';
import AprovacaoOperacaoModal from '@/app/components/AprovacaoOperacaoModal';
import EmailModal from '@/app/components/EmailModal';
import DescontoModal from '@/app/components/DescontoModal';
import PartialDebitModal from '@/app/components/PartialDebitModal';
import RecompraModal from '@/app/components/RecompraModal';

export default function AnalisePage() {
    const [operacoes, setOperacoes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [notification, setNotification] = useState({ message: '', type: '' });
    
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [operacaoSelecionada, setOperacaoSelecionada] = useState(null);
    const [contasMaster, setContasMaster] = useState([]);

    const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
    const [operacaoParaEmail, setOperacaoParaEmail] = useState(null);
    const [isSendingEmail, setIsSendingEmail] = useState(false);

    const [isDescontoModalOpen, setIsDescontoModalOpen] = useState(false);
    const [descontosAdicionais, setDescontosAdicionais] = useState([]);
    
    const [isSaving, setIsSaving] = useState(false);
    const [isPartialDebitModalOpen, setIsPartialDebitModalOpen] = useState(false);
    const [approvalPayload, setApprovalPayload] = useState(null);

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

            setDescontosAdicionais(prev => [
                ...prev,
                {
                    id: `recompra-debito-${Date.now()}`,
                    descricao: `Débito Recompra NF ${data.descricao.split(' ').pop()}`,
                    valor: Math.abs(data.principal)
                },
                {
                    id: `recompra-credito-${Date.now() + 1}`,
                    descricao: `Crédito Juros Recompra NF ${data.descricao.split(' ').pop()}`,
                    valor: -Math.abs(data.credito)
                }
            ]);
            showNotification("Itens de recompra adicionados à operação.", "success");
        }
    };
    
    const handleSalvarAnalise = async (operacaoId, payload, partialData) => {
        setIsSaving(true);
        try {
            // --- CORREÇÃO AQUI: 'recompraData' é incluído no payload principal ---
            const finalPayload = { 
                ...payload, 
                descontos: descontosAdicionais,
                valor_debito_parcial: partialData?.valorDebito || null,
                data_debito_parcial: partialData?.dataDebito || null,
                recompraData: recompraData
            };

            const response = await fetch(`/api/operacoes/${operacaoId}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
                body: JSON.stringify(finalPayload),
            });
            
            const result = await response.json();
            if (!response.ok) {
                 throw new Error(result.message || "Falha ao atualizar operação.");
            }
            // --- FIM DA CORREÇÃO ---

            showNotification("Operação analisada com sucesso!", "success");
            fetchPendentes();
            
            setIsModalOpen(false);
            setIsPartialDebitModalOpen(false);

            if (payload.status === 'Aprovada' && !payload.efetuar_pix) {
                setOperacaoParaEmail({
                    id: operacaoId,
                    clienteId: operacaoSelecionada?.cliente?.id
                });
                setIsEmailModalOpen(true);
            }
        } catch (err) {
            showNotification(err.message, "error");
        } finally {
            setIsSaving(false);
            setRecompraData(null);
        }
    };

    const handleApprovalConfirmation = (payload) => {
        if (payload.status === 'Aprovada' && payload.isPartialDebit) {
            setApprovalPayload(payload);
            setIsPartialDebitModalOpen(true);
        } else {
            handleSalvarAnalise(operacaoSelecionada.id, payload, null);
        }
    };

    const handleSendEmail = async (destinatarios) => {
        if (!operacaoParaEmail) return;
        setIsSendingEmail(true);
        try {
            const response = await fetch(
                `/api/operacoes/${operacaoParaEmail.id}/enviar-email`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json", ...getAuthHeader() },
                    body: JSON.stringify({ destinatarios }),
                }
            );
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
            setOperacaoParaEmail(null);
        }
    };

    const valorLiquidoFinalParaModalParcial = 
        (operacaoSelecionada?.valor_liquido || 0) - 
        (descontosAdicionais.reduce((acc, d) => acc + d.valor, 0));

    return (
        <main className="h-full p-6 bg-gradient-to-br from-gray-900 to-gray-800 text-white flex flex-col">
            <Notification message={notification.message} type={notification.type} onClose={() => setNotification({ message: '', type: '' })} />
            
            <RecompraModal 
                isOpen={isRecompraModalOpen}
                onClose={() => setIsRecompraModalOpen(false)}
                onConfirm={handleConfirmRecompra}
                dataNovaOperacao={operacaoSelecionada?.data_operacao}
            />

            <AprovacaoOperacaoModal 
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onConfirm={handleApprovalConfirmation}
                isSaving={isSaving}
                operacao={operacaoSelecionada}
                contasBancarias={contasMaster}
                onAddDesconto={() => setIsDescontoModalOpen(true)}
                onRecompraClick={() => setIsRecompraModalOpen(true)}
                descontosAdicionais={descontosAdicionais}
                setDescontosAdicionais={setDescontosAdicionais}
            />

            <PartialDebitModal
                isOpen={isPartialDebitModalOpen}
                onClose={() => setIsPartialDebitModalOpen(false)}
                onConfirm={(valorDebito, dataDebito) => {
                    handleSalvarAnalise(operacaoSelecionada.id, approvalPayload, { valorDebito, dataDebito });
                }}
                totalValue={valorLiquidoFinalParaModalParcial}
            />

            <EmailModal
                isOpen={isEmailModalOpen}
                onClose={() => {
                    setIsEmailModalOpen(false);
                    setOperacaoParaEmail(null);
                }}
                onSend={handleSendEmail}
                isSending={isSendingEmail}
                clienteId={operacaoParaEmail?.clienteId}
            />

            <DescontoModal
                isOpen={isDescontoModalOpen}
                onClose={() => setIsDescontoModalOpen(false)}
                onSave={(novoDesconto) => {
                    setDescontosAdicionais([...descontosAdicionais, novoDesconto]);
                    setIsDescontoModalOpen(false);
                }}
            />

            <motion.header 
                className="mb-6 border-b-2 border-orange-500 pb-4"
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
            >
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
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Data Envio</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Cliente (Cedente)</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase">Valor Líquido</th>
                                <th className="px-6 py-3 text-center text-xs font-medium text-gray-300 uppercase">Duplicatas</th>
                                <th className="px-6 py-3 text-center text-xs font-medium text-gray-300 uppercase">Ação</th>
                            </tr>
                        </thead>
                        <tbody className="bg-gray-800 divide-y divide-gray-700">
                            {operacoes.map((op) => (
                                <tr key={op.id} className="hover:bg-gray-700">
                                    <td className="px-6 py-4 whitespace-nowrap">{formatDate(op.data_operacao)}</td>
                                    <td className="px-6 py-4 whitespace-nowrap">{op.cliente.nome}</td>
                                    <td className="px-6 py-4 text-right">{formatBRLNumber(op.valor_liquido)}</td>
                                    <td className="px-6 py-4 text-center">{op.duplicatas.length}</td>
                                    <td className="px-6 py-4 text-center">
                                        <button onClick={() => handleAnalisarClick(op)} className="bg-orange-500 text-white font-semibold py-1 px-3 rounded-md text-sm hover:bg-orange-600">
                                            Analisar
                                        </button>
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