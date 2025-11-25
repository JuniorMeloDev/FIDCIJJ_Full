"use client";

import { useState, useEffect, useMemo } from 'react';
import { formatBRLNumber, formatDate } from '../utils/formatters';
import { FaWallet } from 'react-icons/fa';

export default function ConciliacaoOFXModal({ 
    isOpen, 
    onClose, 
    ofxData, 
    onConciliar, 
    onCriarLancamento, 
    contas = [], 
    lancamentosDoGrid = [], 
    saldoInicial = 0,
    refreshKey = 0 
}) {
  const [contaSelecionada, setContaSelecionada] = useState('');
  const [lancamentosSistema, setLancamentosSistema] = useState([]);
  const [saldoInicialLocal, setSaldoInicialLocal] = useState(0);
  const [loadingSistema, setLoadingSistema] = useState(false);
  const [matches, setMatches] = useState({});

  // Filtros de Data
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');

  // Inicialização
  useEffect(() => {
    if (isOpen) {
      setMatches({});
      // Se já tivermos dados carregados e for apenas uma reabertura (ou refresh), 
      // mantemos as datas. Se for a primeira vez, definimos o padrão.
      if (!dataInicio) {
          const hoje = new Date();
          const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
          
          const formatDateIso = (date) => date.toISOString().split('T')[0];
          
          setDataInicio(formatDateIso(primeiroDia));
          setDataFim(formatDateIso(hoje));
      }

      // Tenta selecionar a primeira conta automaticamente se não houver seleção
      if (contas && contas.length === 1) {
          setContaSelecionada(contas[0].id);
      } else if (contas.length > 0 && !contaSelecionada) {
          setContaSelecionada(contas[0].id);
      }
    }
  }, [isOpen, contas]);

  // Carrega dados quando Conta, Data ou refreshKey mudam
  useEffect(() => {
    if (isOpen && dataInicio && dataFim && contaSelecionada) {
      carregarDadosSistema();
    }
  }, [contaSelecionada, dataInicio, dataFim, isOpen, refreshKey]);

  const carregarDadosSistema = async () => {
    setLoadingSistema(true);

    // Precisamos do nome da conta formatado (ex: "ITAÚ ...") para filtrar na API
    let nomeContaSelecionada = '';
    if (contaSelecionada) {
        const contaObj = contas.find(c => String(c.id) === String(contaSelecionada));
        if (contaObj) {
            nomeContaSelecionada = contaObj.contaBancaria; 
        }
    }

    if (!nomeContaSelecionada) {
        setLoadingSistema(false);
        return;
    }

    try {
        const token = sessionStorage.getItem('authToken');
        const params = new URLSearchParams({
            dataInicio,
            dataFim,
            conta: nomeContaSelecionada, // Filtra especificamente por esta conta
            sort: 'data_movimento',
            direction: 'ASC' // Trazemos ASC para facilitar cálculo, depois invertemos visualmente
        });

        const response = await fetch(`/api/movimentacoes-caixa?${params.toString()}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            
            // A API retorna { data: [...], saldoAnterior: number }
            // Isso garante que o saldoAnterior seja EXATO para esta conta antes da dataInicio
            setLancamentosSistema(data.data || []);
            setSaldoInicialLocal(data.saldoAnterior || 0); 

            // Roda a auto-conciliação (match simples por valor e data)
            if (ofxData && ofxData.length > 0) {
                autoConciliar(ofxData, data.data || []);
            }
        }
    } catch (error) {
        console.error("Erro ao buscar dados para conciliação:", error);
    } finally {
        setLoadingSistema(false);
    }
  };

  // Processa a lista para inserir as linhas de "Saldo Total Disponível"
  const lancamentosProcessados = useMemo(() => {
    if (!lancamentosSistema) return [];

    // 1. Garante ordenação por data CRESCENTE para o cálculo matemático
    const sorted = [...lancamentosSistema].sort((a, b) => {
        const dateA = new Date(a.dataMovimento || a.data);
        const dateB = new Date(b.dataMovimento || b.data);
        return dateA - dateB;
    });
    
    const groupedByDate = {};
    
    // 2. Agrupa por data
    sorted.forEach(item => {
        const rawDate = item.dataMovimento || item.data;
        const date = rawDate.split('T')[0];
        if (!groupedByDate[date]) groupedByDate[date] = [];
        groupedByDate[date].push(item);
    });

    const finalIds = [];
    
    // Começa com o saldo anterior específico da conta (vindo da API)
    let runningBalance = saldoInicialLocal; 

    // 3. Processa dia a dia
    Object.keys(groupedByDate).sort().forEach(date => {
        const itemsDoDia = groupedByDate[date];
        
        // Adiciona os itens do dia e atualiza o saldo
        itemsDoDia.forEach(item => {
            runningBalance += parseFloat(item.valor);
            finalIds.push(item);
        });

        // Adiciona a linha de saldo no final do dia
        finalIds.push({
            id: `saldo-${date}`,
            isBalanceRow: true,
            dataMovimento: date,
            descricao: 'Saldo Total Disponível',
            valor: runningBalance,
            contaBancaria: '',
            categoria: 'Saldo'
        });
    });

    // 4. Re-ordena por data DECRESCENTE para a visualização do usuário (mais recente no topo)
    return finalIds.sort((a, b) => {
        const dateA = new Date(a.dataMovimento || a.data);
        const dateB = new Date(b.dataMovimento || b.data);
        
        if (dateA - dateB !== 0) return dateB - dateA; // DESC
        
        // Se datas iguais, a linha de Saldo deve ficar no TOPO do dia na visualização DESC
        if (a.isBalanceRow) return -1; 
        if (b.isBalanceRow) return 1;
        
        return 0;
    });

  }, [lancamentosSistema, saldoInicialLocal]);

  const autoConciliar = (ofxItems, sysItems) => {
    const newMatches = {};
    const sysItemsUsed = new Set();

    ofxItems.forEach(ofx => {
      const match = sysItems.find(sys => 
        !sysItemsUsed.has(sys.id) && 
        Math.abs(parseFloat(sys.valor)) === Math.abs(parseFloat(ofx.valor)) &&
        (sys.dataMovimento || sys.data || '').split('T')[0] === (ofx.data || '').split('T')[0]
      );

      if (match) {
        newMatches[ofx.id] = match.id;
        sysItemsUsed.add(match.id);
      }
    });
    setMatches(newMatches);
  };

  const handleCriarNovo = (ofxItem) => {
      onCriarLancamento(ofxItem, contaSelecionada || null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-gray-900 text-white">
      {/* Header */}
      <div className="bg-gray-800 p-4 border-b border-gray-700 flex flex-col md:flex-row justify-between items-center shadow-md gap-4">
        <div>
            <h2 className="text-xl font-bold text-orange-500">Conciliação Bancária (OFX)</h2>
            <p className="text-sm text-gray-400">Compare o extrato com seu sistema</p>
        </div>
        
        <div className="flex flex-wrap items-end gap-4 bg-gray-700/50 p-2 rounded-lg border border-gray-600">
            {/* Seletor de Conta */}
            <div className="flex flex-col">
                <label className="text-xs text-gray-400 uppercase font-bold mb-1">Conta Bancária (Filtro)</label>
                <select 
                    value={contaSelecionada} 
                    onChange={e => setContaSelecionada(e.target.value)}
                    className="bg-gray-800 border border-gray-500 rounded p-1 text-sm w-64 focus:ring-orange-500 text-white h-9"
                >
                    <option value="">-- Selecione uma Conta --</option>
                    {contas.map(c => (
                        <option key={c.id} value={c.id}>
                             {c.banco} - Ag: {c.agencia} ({c.descricao || c.contaCorrente})
                        </option>
                    ))}
                </select>
            </div>

            {/* Seletor de Datas */}
            <div className="flex flex-col">
                <label className="text-xs text-gray-400 uppercase font-bold mb-1">De</label>
                <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} className="bg-gray-800 border border-gray-500 rounded p-1 text-sm w-36 focus:ring-orange-500 text-white h-9" />
            </div>
            <div className="flex flex-col">
                <label className="text-xs text-gray-400 uppercase font-bold mb-1">Até</label>
                <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className="bg-gray-800 border border-gray-500 rounded p-1 text-sm w-36 focus:ring-orange-500 text-white h-9" />
            </div>

            <button onClick={onClose} className="bg-red-600 hover:bg-red-700 text-white px-4 py-1 rounded font-bold h-9 ml-2">Fechar</button>
        </div>
      </div>

      {/* Corpo: Duas Colunas */}
      <div className="flex-grow flex overflow-hidden">
        {/* Lado Esquerdo: OFX */}
        <div className="w-1/2 border-r border-gray-700 flex flex-col bg-gray-800/50">
            <div className="p-3 bg-gray-700 font-bold text-center border-b border-gray-600 sticky top-0">
                EXTRATO BANCÁRIO (OFX)
                <span className="block text-xs text-gray-400 font-normal">{ofxData?.length || 0} registros importados</span>
            </div>
            <div className="flex-grow overflow-y-auto p-2 space-y-2">
                {ofxData && ofxData.map((item) => {
                    const isMatched = !!matches[item.id];
                    return (
                        <div key={item.id} className={`p-3 rounded border flex justify-between items-center ${isMatched ? 'bg-green-900/20 border-green-600' : 'bg-gray-800 border-gray-600'}`}>
                            <div className="flex-grow mr-2 overflow-hidden">
                                <div className="text-xs text-gray-400">{formatDate(item.data)}</div>
                                <div className="font-semibold text-sm truncate" title={item.descricao}>{item.descricao}</div>
                            </div>
                            <div className="text-right flex-shrink-0">
                                <div className={`font-bold ${item.valor < 0 ? 'text-red-400' : 'text-green-400'}`}>{formatBRLNumber(item.valor)}</div>
                                {!isMatched ? (
                                    <button 
                                        onClick={() => handleCriarNovo(item)} 
                                        className="text-xs px-2 py-1 rounded mt-1 transition-colors bg-blue-600 hover:bg-blue-500 text-white"
                                    >
                                        + Criar
                                    </button>
                                ) : <span className="text-xs text-green-500 font-bold flex items-center justify-end gap-1 mt-1">✓ Conciliado</span>}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>

        {/* Lado Direito: Sistema (Com Saldo Corrigido e Refresh) */}
        <div className="w-1/2 flex flex-col bg-gray-900">
            <div className="p-3 bg-gray-700 font-bold text-center border-b border-gray-600 sticky top-0">
                SISTEMA (FLUXO DE CAIXA)
                <span className="block text-xs text-gray-400 font-normal">{loadingSistema ? 'Carregando...' : `${lancamentosProcessados.length} registros visíveis`}</span>
            </div>
            <div className="flex-grow overflow-y-auto p-2 space-y-2">
                {!loadingSistema && lancamentosProcessados.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-gray-500 p-6 text-center">
                        <p>Nenhum lançamento encontrado.</p>
                        {!contaSelecionada && <p className="text-yellow-400 mt-2">Selecione uma conta para ver os dados.</p>}
                    </div>
                )}
                
                {lancamentosProcessados.map((sysItem) => {
                    // Renderização Especial da Linha de Saldo
                    if (sysItem.isBalanceRow) {
                        return (
                            <div key={sysItem.id} className="bg-gray-900/80 border-t border-b border-gray-600 p-2 flex justify-between items-center">
                                <div className="flex items-center gap-2 text-orange-400 text-sm font-bold uppercase">
                                    <FaWallet /> {sysItem.descricao} ({formatDate(sysItem.dataMovimento)})
                                </div>
                                <div className={`font-bold text-sm ${sysItem.valor >= 0 ? "text-blue-400" : "text-red-400"}`}>
                                    {formatBRLNumber(sysItem.valor)}
                                </div>
                            </div>
                        );
                    }

                    const matchedOfxId = Object.keys(matches).find(key => matches[key] === sysItem.id);
                    const isMatched = !!matchedOfxId;
                    
                    return (
                        <div key={sysItem.id} className={`p-3 rounded border flex justify-between items-center ${isMatched ? 'bg-green-900/20 border-green-600 opacity-80' : 'bg-gray-800 border-gray-600'}`}>
                             <div className="flex-grow mr-2 overflow-hidden">
                                <div className="text-xs text-gray-400">{formatDate(sysItem.dataMovimento || sysItem.data)}</div>
                                <div className="font-semibold text-sm truncate" title={sysItem.descricao}>{sysItem.descricao}</div>
                                <div className="text-xs text-gray-500 truncate">{sysItem.categoria}</div>
                            </div>
                            <div className="text-right flex-shrink-0">
                                <div className={`font-bold ${sysItem.valor < 0 ? 'text-red-400' : 'text-green-400'}`}>{formatBRLNumber(sysItem.valor)}</div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
      </div>
    </div>
  );
}