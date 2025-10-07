'use client';

import { useState, useEffect } from 'react';
import { formatBRLNumber, formatDate } from '@/app/utils/formatters';

export default function InterTestPage() {
    const [contasMaster, setContasMaster] = useState([]);
    const [contaSelecionada, setContaSelecionada] = useState('');
    const [saldo, setSaldo] = useState(null);
    const [extrato, setExtrato] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [dataInicio, setDataInicio] = useState(new Date().toISOString().split('T')[0]);
    const [dataFim, setDataFim] = useState(new Date().toISOString().split('T')[0]);

    const getAuthHeader = () => {
        const token = sessionStorage.getItem('authToken');
        return token ? { 'Authorization': `Bearer ${token}` } : {};
    };

    useEffect(() => {
        const fetchContas = async () => {
            try {
                const res = await fetch('/api/cadastros/contas/master', { headers: getAuthHeader() });
                if (!res.ok) throw new Error('Falha ao carregar contas master.');
                const data = await res.json();
                const contasInter = data.filter(c => c.banco.toLowerCase().includes('inter')).map(c => c.conta_corrente);
                setContasMaster(contasInter);
                if (contasInter.length > 0) {
                    setContaSelecionada(contasInter[0]);
                }
            } catch (err) {
                setError('Erro ao carregar contas: ' + err.message);
            }
        };
        fetchContas();
    }, []);

    const handleConsultarSaldo = async () => {
        if (!contaSelecionada) return;
        setLoading(true);
        setError('');
        setSaldo(null);
        try {
            const response = await fetch(`/api/inter/saldo?contaCorrente=${contaSelecionada}`);
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Erro ao buscar saldo.');
            setSaldo(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleConsultarExtrato = async () => {
        if (!contaSelecionada) return;
        setLoading(true);
        setError('');
        setExtrato(null);
        try {
            const response = await fetch(`/api/inter/extrato?contaCorrente=${contaSelecionada}&dataInicio=${dataInicio}&dataFim=${dataFim}`);
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Erro ao buscar extrato.');
            setExtrato(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className="h-full p-6 bg-gray-900 text-white">
            <h1 className="text-2xl font-bold mb-4">Página de Teste - API Banco Inter</h1>
            <div className="bg-gray-800 p-4 rounded-lg shadow-md space-y-4 max-w-4xl mx-auto">
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                    <div className="md:col-span-2">
                        <label htmlFor="conta" className="block text-sm font-medium text-gray-300">Selecione a Conta do Inter</label>
                        <select id="conta" value={contaSelecionada} onChange={e => setContaSelecionada(e.target.value)} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md p-2">
                            {contasMaster.length > 0 ? (
                                contasMaster.map(conta => <option key={conta} value={conta}>{conta}</option>)
                            ) : (
                                <option>Nenhuma conta do Inter encontrada</option>
                            )}
                        </select>
                    </div>
                    <button onClick={handleConsultarSaldo} disabled={loading || !contaSelecionada} className="bg-blue-600 font-semibold py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 h-10">
                        {loading ? 'Buscando...' : 'Consultar Saldo'}
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end border-t border-gray-700 pt-4">
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                             <label htmlFor="dataInicio" className="block text-sm font-medium text-gray-300">Data Início</label>
                             <input type="date" id="dataInicio" value={dataInicio} onChange={e => setDataInicio(e.target.value)} className="mt-1 w-full bg-gray-700 p-2 rounded" />
                        </div>
                         <div>
                             <label htmlFor="dataFim" className="block text-sm font-medium text-gray-300">Data Fim</label>
                             <input type="date" id="dataFim" value={dataFim} onChange={e => setDataFim(e.target.value)} className="mt-1 w-full bg-gray-700 p-2 rounded" />
                        </div>
                    </div>
                    <div></div>
                    <button onClick={handleConsultarExtrato} disabled={loading || !contaSelecionada} className="bg-green-600 font-semibold py-2 px-4 rounded-md hover:bg-green-700 disabled:opacity-50 h-10">
                        {loading ? 'Buscando...' : 'Consultar Extrato'}
                    </button>
                </div>

                {error && <p className="text-red-400 text-center mt-4">{error}</p>}

                {saldo && (
                    <div className="mt-6 p-4 bg-gray-700 rounded-lg">
                        <h2 className="font-bold text-lg">Saldo</h2>
                        <p>Disponível: {formatBRLNumber(saldo.disponivel)}</p>
                        <p>Bloqueado: {formatBRLNumber(saldo.bloqueado)}</p>
                    </div>
                )}

                {extrato && (
                    <div className="mt-6 p-4 bg-gray-700 rounded-lg max-h-96 overflow-y-auto">
                        <h2 className="font-bold text-lg mb-2">Extrato ({extrato.transacoes?.length || 0} transações)</h2>
                        <ul className="divide-y divide-gray-600">
                            {extrato.transacoes.map(t => (
                                <li key={t.idTransacao} className="py-2 flex justify-between items-center text-sm">
                                    <div>
                                        <p className={`font-semibold ${t.tipo === 'C' ? 'text-green-400' : 'text-red-400'}`}>{t.descricao}</p>
                                        <p className="text-gray-400 text-xs">{formatDate(t.dataEntrada)} - {t.titulo}</p>
                                    </div>
                                    <span className={`font-bold ${t.tipo === 'C' ? 'text-green-400' : 'text-red-400'}`}>
                                        {t.tipo === 'D' ? '-' : '+'}{formatBRLNumber(t.valor)}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        </main>
    );
}