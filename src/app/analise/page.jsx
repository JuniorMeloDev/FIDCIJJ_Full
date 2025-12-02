'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { formatBRLNumber, formatDate } from '../utils/formatters.jsx';
import Notification from '@/app/components/Notification';
import AprovacaoOperacaoModal from '@/app/components/AprovacaoOperacaoModal';
import EmailModal from '@/app/components/EmailModal';
import DescontoModal from '@/app/components/DescontoModal';
import PartialDebitModal from '@/app/components/PartialDebitModal';
import RecompraModal from '@/app/components/RecompraModal';
import PixReceiptModal from '@/app/components/PixReceiptModal';

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

    // 2. Estados para o Comprovante PIX
    const [isPixReceiptOpen, setIsPixReceiptOpen] = useState(false);
    const [pixReceiptData, setPixReceiptData] = useState(null);

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

            let descontosRecompra = [];

            if (data.principal > 0) {
                 descontosRecompra.push({
                    id: `recompra-debito-${Date.now()}`,
                    descricao: `Débito Recompra ${data.descricao}`,
                    valor: Math.abs(data.principal)
                });
            }

            if (data.credito > 0) {
                descontosRecompra.push({
                    id: `recompra-credito-${Date.now() + 1}`,
                    descricao: `Crédito Juros Recompra ${data.descricao}`,
                    valor: -Math.abs(data.credito)
                });
            }

            if (data.jurosAdicionais > 0) {
                descontosRecompra.push({
                    id: `recompra-juros-${Date.now() + 2}`,
                    descricao: `Juros/Taxas Recompra ${data.descricao}`,
                    valor: Math.abs(data.jurosAdicionais)
                });
            }
            
            if (data.abatimentos > 0) {
                descontosRecompra.push({
                    id: `recompra-abatimento-${Date.now() + 3}`,
                    descricao: `Abatimento Recompra ${data.descricao}`,
                    valor: -Math.abs(data.abatimentos)
                });
            }
            
            setDescontosAdicionais(prev => [ ...prev, ...descontosRecompra ]);
            showNotification("Itens de recompra adicionados à operação.", "success");
        }
    };

    // 3. Função: Fecha o Pix e abre o Email
    const handleClosePixReceipt = () => {
        setIsPixReceiptOpen(false);
        setTimeout(() => {
            // Se houver uma operação configurada para email, abre o modal
            if (operacaoParaEmail) {
                setIsEmailModalOpen(true);
            }
        }, 300);
    };
    
    const handleSalvarAnalise = async (operacaoId, payload, partialData) => {
        setIsSaving(true);
        try {
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

            showNotification("Operação analisada com sucesso!", "success");
            fetchPendentes();
            
            setIsModalOpen(false);
            setIsPartialDebitModalOpen(false);

            // 4. Lógica de Aprovação -> Pix -> Email
            if (payload.status === 'Aprovada') {
                // Prepara state para o futuro modal de email
                setOperacaoParaEmail({
                    id: operacaoId,
                    clienteId: operacaoSelecionada?.cliente?.id
                });

                // Lógica de cálculo de valor (Débito parcial ou Líquido normal)
                const totalDescontos = descontosAdicionais.reduce((acc, d) => acc + d.valor, 0);
                let valorFinalPix = 0;

                if (partialData?.valorDebito) {
                     valorFinalPix = parseFloat(partialData.valorDebito);
                } else {
                     valorFinalPix = (operacaoSelecionada?.valor_liquido || 0) - totalDescontos;
                }

                // --- MONTAGEM DOS DADOS DO COMPROVANTE (IGUAL AO BORDERÔ) ---
                
                // A. Busca a conta pagadora (Sua Empresa)
                // Usamos String() para garantir que ids numéricos e strings batam
                const contaPagadoraObj = contasMaster.find(c => String(c.id) === String(payload.contaBancariaId)) || contasMaster[0];
                
                // Formata a string da conta como no Borderô: "BANCO - AG/CONTA"
                const contaPagadoraFormatada = contaPagadoraObj 
                    ? `${contaPagadoraObj.banco || ''} - ${contaPagadoraObj.agencia || ''}/${contaPagadoraObj.conta || contaPagadoraObj.conta_corrente || ''}`
                    : 'Conta não informada';

                // B. Busca dados do recebedor (Cliente)
                const cliente = operacaoSelecionada?.cliente || {};
                const chavePixUsada = cliente.chave_pix || cliente.chavePix || 'Chave não informada';
                
                // Tenta achar o banco do cliente para exibir bonito
                const nomeBancoRecebedor = cliente.banco || 'Banco do Cliente';

                // Monta o objeto completo
                const dadosComprovante = {
                    valor: valorFinalPix,
                    data: new Date(),
                    transactionId: result.transactionId || `OP-${operacaoId}-${Date.now()}`,
                    descricao: `Pagamento Operação #${operacaoId}`,
                    
                    pagador: {
                        nome: contaPagadoraObj?.descricao || 'Sua Empresa',
                        cnpj: contaPagadoraObj?.cnpj || '', // Certifique-se que o back retorna isso
                        conta: contaPagadoraFormatada 
                    },

                    recebedor: {
                        nome: cliente.razao_social || cliente.nome || 'Nome não informado',
                        cnpj: cliente.cnpj_cpf,
                        instituicao: nomeBancoRecebedor,
                        chavePix: chavePixUsada
                    }
                };

                setPixReceiptData(dadosComprovante);
                setIsPixReceiptOpen(true);
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
            
            {/* 5. Renderização do Modal de Pix */}
            <PixReceiptModal
                isOpen={isPixReceiptOpen}
                onClose={handleClosePixReceipt}
                receiptData={pixReceiptData}
            />

            <RecompraModal 
                isOpen={isRecompraModalOpen}
                onClose={() => setIsRecompraModalOpen(false)}
                onConfirm={handleConfirmRecompra}
                dataNovaOperacao={operacaoSelecionada?.data_operacao}
                clienteId={operacaoSelecionada?.cliente?.id}
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