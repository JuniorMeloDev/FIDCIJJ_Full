'use client'

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { jwtDecode } from "jwt-decode";
import { formatBRLNumber, formatDate } from "@/app/utils/formatters";
import { FaChevronRight } from "react-icons/fa";

const getStatusTag = (status) => {
    switch (status) {
        case 'Pendente':
            return <span className="inline-block px-2 py-1 text-xs font-semibold rounded-full bg-yellow-500 text-white">Pendente</span>;
        case 'Aprovada':
            return <span className="inline-block px-2 py-1 text-xs font-semibold rounded-full bg-green-500 text-white">Aprovada</span>;
        case 'Rejeitada':
            return <span className="inline-block px-2 py-1 text-xs font-semibold rounded-full bg-red-500 text-white">Rejeitada</span>;
        default:
            return <span>{status}</span>;
    }
};

export default function ClientDashboardPage() {
    const [operacoes, setOperacoes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [expandedRow, setExpandedRow] = useState(null);
    const [clienteNome, setClienteNome] = useState('');

    const getAuthHeader = () => {
        const token = sessionStorage.getItem('authToken');
        return token ? { 'Authorization': `Bearer ${token}` } : {};
    };

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                // Pega o nome do cliente do token para a mensagem de boas-vindas
                const token = sessionStorage.getItem('authToken');
                if (token) {
                    const decodedToken = jwtDecode(token);
                    setClienteNome(decodedToken.cliente_nome || '');
                }

                const response = await fetch('/api/portal/operacoes', { headers: getAuthHeader() });
                if (!response.ok) {
                    throw new Error('Falha ao buscar suas operações.');
                }
                const data = await response.json();
                setOperacoes(data);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const toggleRow = (id) => {
        setExpandedRow(expandedRow === id ? null : id);
    };

    return (
        <div className="text-gray-200">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                
                {/* --- NOVA SEÇÃO DE CABEÇALHO E AÇÃO --- */}
                <div className="flex flex-col md:flex-row justify-between md:items-center mb-8 gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-white">
                            Bem-vindo, {clienteNome}!
                        </h1>
                        <p className="text-gray-400 mt-1">Acompanhe suas operações ou envie uma nova para análise.</p>
                    </div>
                    <Link 
                        href="/portal/enviar-operacao"
                        className="bg-orange-500 text-white font-semibold py-3 px-6 rounded-md hover:bg-orange-600 transition text-center"
                    >
                        Enviar Nova Operação
                    </Link>
                </div>
                {/* --- FIM DA NOVA SEÇÃO --- */}

                 {/* Tabela de Histórico de Operações */}
                <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
                    <h2 className="text-xl font-semibold mb-4 text-white">Histórico de Operações</h2>
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-700">
                            <thead className="bg-gray-700/50">
                                <tr>
                                    <th className="w-12"></th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">ID Operação</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Data de Envio</th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">Valor Bruto</th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">Valor Líquido</th>
                                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-300 uppercase tracking-wider">Status</th>
                                </tr>
                            </thead>
                            <tbody className="bg-gray-800 divide-y divide-gray-700">
                                {loading ? (
                                    <tr><td colSpan="6" className="text-center py-8 text-gray-400">Carregando operações...</td></tr>
                                ) : error ? (
                                    <tr><td colSpan="6" className="text-center py-8 text-red-400">{error}</td></tr>
                                ) : operacoes.length === 0 ? (
                                    <tr><td colSpan="6" className="text-center py-8 text-gray-400">Nenhuma operação encontrada.</td></tr>
                                ) : operacoes.map(op => (
                                    <React.Fragment key={op.id}>
                                        <tr onClick={() => toggleRow(op.id)} className={`cursor-pointer hover:bg-gray-700/50 transition-colors`}>
                                            <td className="px-4 py-4"><FaChevronRight className={`transform transition-transform duration-300 ${expandedRow === op.id ? 'rotate-90' : ''} text-gray-500`}/></td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">#{op.id}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{formatDate(op.data_operacao)}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300 text-right">{formatBRLNumber(op.valor_total_bruto)}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300 text-right">{formatBRLNumber(op.valor_liquido)}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-center">{getStatusTag(op.status)}</td>
                                        </tr>
                                        {expandedRow === op.id && (
                                            <tr className="bg-gray-900/50">
                                                <td colSpan="6" className="p-0">
                                                    <motion.div 
                                                        initial={{ height: 0, opacity: 0 }}
                                                        animate={{ height: 'auto', opacity: 1 }}
                                                        exit={{ height: 0, opacity: 0 }}
                                                        className="overflow-hidden"
                                                    >
                                                        <div className="p-4">
                                                            <h4 className="font-semibold text-sm mb-2 text-orange-400">Detalhes da Operação #{op.id}</h4>
                                                            <table className="min-w-full text-xs">
                                                                <thead className="bg-gray-700/30"><tr><th className="px-3 py-1 text-left">NF/CT-e</th><th className="px-3 py-1 text-left">Sacado</th><th className="px-3 py-1 text-right">Valor</th></tr></thead>
                                                                <tbody>
                                                                    {op.duplicatas.map(dup => (
                                                                        <tr key={dup.id}>
                                                                            <td className="px-3 py-1">{dup.nf_cte}</td>
                                                                            <td className="px-3 py-1">{dup.cliente_sacado}</td>
                                                                            <td className="px-3 py-1 text-right">{formatBRLNumber(dup.valor_bruto)}</td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                            {/* Futuramente, o botão de baixar borderô pode chamar uma API */}
                                                            <div className="text-right mt-2">
                                                              <button className="text-xs bg-blue-600 hover:bg-blue-700 text-white py-1 px-3 rounded-md">
                                                                Baixar Borderô
                                                              </button>
                                                            </div>
                                                        </div>
                                                    </motion.div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}