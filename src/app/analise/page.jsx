'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { formatBRLNumber, formatDate } from '../utils/formatters';
import Notification from '@/app/components/Notification';
import AprovacaoOperacaoModal from '@/app/components/AprovacaoOperacaoModal';
import EmailModal from '@/app/components/EmailModal';
import DescontoModal from '@/app/components/DescontoModal'; // Importar o modal de desconto

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

    // Estado para o novo modal de Desconto
    const [isDescontoModalOpen, setIsDescontoModalOpen] = useState(false);
    const [descontosAdicionais, setDescontosAdicionais] = useState([]);


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
        setDescontosAdicionais([]); // Limpa os descontos ao abrir o modal
        setIsModalOpen(true);
    };
    
    const handleSalvarAnalise = async (operacaoId, payload) => {
        try {
            // Adiciona os novos descontos ao payload que será enviado para a API
            const finalPayload = { ...payload, descontos: descontosAdicionais };

            const response = await fetch(`/api/operacoes/${operacaoId}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
                body: JSON.stringify(finalPayload),
            });
            if (!response.ok) {
                 const errorData = await response.json();
                 throw new Error(errorData.message || "Falha ao atualizar operação.");
            }
            showNotification("Operação analisada com sucesso!", "success");
            fetchPendentes();

            if (payload.status === 'Aprovada') {
                setOperacaoParaEmail({
                    id: operacaoId,
                    clienteId: operacaoSelecionada?.cliente?.id
                });
                setIsEmailModalOpen(true);
            }

            return true;
        } catch (err) {
            showNotification(err.message, "error");
            return false;
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


    return (
        <main className="h-full p-6 bg-gradient-to-br from-gray-900 to-gray-800 text-white flex flex-col">
            <Notification message={notification.message} type={notification.type} onClose={() => setNotification({ message: '', type: '' })} />
            
            <AprovacaoOperacaoModal 
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleSalvarAnalise}
                operacao={operacaoSelecionada}
                contasBancarias={contasMaster}
                onAddDesconto={() => setIsDescontoModalOpen(true)} // Passa a função para abrir o modal de desconto
                descontosAdicionais={descontosAdicionais} // Passa os descontos para exibição
                setDescontosAdicionais={setDescontosAdicionais} // Permite a remoção de descontos
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
                 error ? <p className="text-red-500 text-center py-10">{error}</p> :
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