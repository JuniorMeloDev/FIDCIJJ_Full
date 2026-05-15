'use client';

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
  refreshKey = 0,
  initialDataInicio = '',
  initialDataFim = '',
  apiDailyBalances = {}
}) {
  const [contaSelecionada, setContaSelecionada] = useState('');
  const [lancamentosSistema, setLancamentosSistema] = useState([]);
  const [saldoInicialLocal, setSaldoInicialLocal] = useState(0);
  const [loadingSistema, setLoadingSistema] = useState(false);
  const [matches, setMatches] = useState({});
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');

  useEffect(() => {
    if (isOpen) {
      setMatches({});
      if (initialDataInicio && initialDataFim) {
        setDataInicio(initialDataInicio);
        setDataFim(initialDataFim);
      } else {
        const hoje = new Date();
        const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
        const formatDateIso = (date) => date.toISOString().split('T')[0];
        setDataInicio(formatDateIso(primeiroDia));
        setDataFim(formatDateIso(hoje));
      }

      if (contas && contas.length === 1) {
        setContaSelecionada(contas[0].id);
      } else if (contas.length > 0 && !contaSelecionada) {
        setContaSelecionada(contas[0].id);
      }
    }
  }, [isOpen, contas, initialDataInicio, initialDataFim]);

  useEffect(() => {
    if (isOpen && dataInicio && dataFim && contaSelecionada) {
      carregarDadosSistema();
    }
  }, [contaSelecionada, dataInicio, dataFim, isOpen, refreshKey]);

  const carregarDadosSistema = async () => {
    setLoadingSistema(true);

    let nomeContaSelecionada = '';
    if (contaSelecionada) {
      const contaObj = contas.find((c) => String(c.id) === String(contaSelecionada));
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
        conta: nomeContaSelecionada,
        sort: 'data_movimento',
        direction: 'ASC'
      });

      const response = await fetch(`/api/movimentacoes-caixa?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setLancamentosSistema(data.data || []);
        setSaldoInicialLocal(data.saldoAnterior || 0);

        if (ofxData && ofxData.length > 0) {
          autoConciliar(ofxData, data.data || []);
        }
      }
    } catch (error) {
      console.error('Erro ao buscar dados para conciliação:', error);
    } finally {
      setLoadingSistema(false);
    }
  };

  const lancamentosProcessados = useMemo(() => {
    if (!lancamentosSistema) return [];

    const sorted = [...lancamentosSistema].sort((a, b) => {
      const dateA = new Date(a.dataMovimento || a.data);
      const dateB = new Date(b.dataMovimento || b.data);
      return dateA - dateB;
    });

    const groupedByDate = {};
    sorted.forEach((item) => {
      const rawDate = item.dataMovimento || item.data;
      const date = rawDate.split('T')[0];
      if (!groupedByDate[date]) groupedByDate[date] = [];
      groupedByDate[date].push(item);
    });

    const finalIds = [];
    let runningBalance = saldoInicialLocal;

    Object.keys(groupedByDate).sort().forEach((date) => {
      const itemsDoDia = groupedByDate[date];
      itemsDoDia.forEach((item) => {
        runningBalance += parseFloat(item.valor);
        finalIds.push(item);
      });

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

    return finalIds.sort((a, b) => {
      const dateA = new Date(a.dataMovimento || a.data);
      const dateB = new Date(b.dataMovimento || b.data);

      if (dateA - dateB !== 0) return dateB - dateA;
      if (a.isBalanceRow) return -1;
      if (b.isBalanceRow) return 1;
      return 0;
    });
  }, [lancamentosSistema, saldoInicialLocal]);

  const ofxProcessado = useMemo(() => {
    if (!Array.isArray(ofxData) || ofxData.length === 0) return [];

    const groupedByDate = {};

    [...ofxData]
      .sort((a, b) => new Date(a.data || 0) - new Date(b.data || 0))
      .forEach((item) => {
        const date = (item.data || '').split('T')[0];
        if (!date) return;
        if (!groupedByDate[date]) groupedByDate[date] = [];
        groupedByDate[date].push(item);
      });

    const finalItems = [];

    Object.keys(groupedByDate)
      .sort()
      .forEach((date) => {
        groupedByDate[date].forEach((item) => finalItems.push(item));

        const dailyBalance = Number(apiDailyBalances?.[date]);
        if (Number.isFinite(dailyBalance)) {
          finalItems.push({
            id: `ofx-saldo-${date}`,
            isBalanceRow: true,
            data: date,
            descricao: 'Saldo Final do Dia',
            valor: dailyBalance,
          });
        }
      });

    return finalItems.sort((a, b) => {
      const dateA = new Date(a.dataMovimento || a.data || 0);
      const dateB = new Date(b.dataMovimento || b.data || 0);

      if (dateA - dateB !== 0) return dateB - dateA;
      if (a.isBalanceRow) return -1;
      if (b.isBalanceRow) return 1;
      return 0;
    });
  }, [apiDailyBalances, ofxData]);

  const autoConciliar = (ofxItems, sysItems) => {
    const newMatches = {};
    const sysItemsUsed = new Set();

    ofxItems.forEach((ofx) => {
      const match = sysItems.find((sys) =>
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
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-gray-900 text-white sm:items-center sm:p-4">
      <div className="flex h-[100vh] w-full flex-col overflow-hidden bg-gray-900 sm:h-[92vh] sm:rounded-2xl">
        <div className="border-b border-gray-700 bg-gray-800 px-4 py-4 shadow-md sm:px-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-bold text-orange-500">Conciliação Bancária (OFX)</h2>
              <p className="text-sm text-gray-400">Compare o extrato com seu sistema</p>
            </div>

            <div className="flex flex-col gap-3 rounded-lg border border-gray-600 bg-gray-700/50 p-3 sm:flex-row sm:flex-wrap sm:items-end">
              <div className="flex flex-col">
                <label className="mb-1 text-xs font-bold uppercase text-gray-400">Conta Bancária (Filtro)</label>
                <select
                  value={contaSelecionada}
                  onChange={(e) => setContaSelecionada(e.target.value)}
                  className="h-11 w-full rounded border border-gray-500 bg-gray-800 p-2 text-sm text-white focus:ring-orange-500 sm:w-64"
                >
                  <option value="">-- Selecione uma Conta --</option>
                  {contas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.banco} - Ag: {c.agencia} ({c.descricao || c.contaCorrente})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-3">
                <div className="flex flex-col">
                  <label className="mb-1 text-xs font-bold uppercase text-gray-400">De</label>
                  <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="h-11 rounded border border-gray-500 bg-gray-800 p-2 text-sm text-white focus:ring-orange-500" />
                </div>
                <div className="flex flex-col">
                  <label className="mb-1 text-xs font-bold uppercase text-gray-400">Até</label>
                  <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="h-11 rounded border border-gray-500 bg-gray-800 p-2 text-sm text-white focus:ring-orange-500" />
                </div>
              </div>

              <button onClick={onClose} className="h-11 rounded bg-red-600 px-4 font-bold text-white transition hover:bg-red-700">
                Fechar
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-hidden">
          <div className="grid h-full grid-cols-1 gap-4 overflow-hidden p-4 xl:grid-cols-2">
            <div className="flex min-h-0 flex-col overflow-hidden rounded-md border border-gray-700 bg-gray-800/50">
              <div className="sticky top-0 border-b border-gray-600 bg-gray-700 p-3 text-center font-bold">
                EXTRATO BANCÁRIO (OFX)
                <span className="block text-xs font-normal text-gray-400">{ofxData?.length || 0} registros importados</span>
              </div>
              <div className="flex-grow overflow-y-auto p-2 space-y-2">
                {ofxProcessado && ofxProcessado.map((item) => {
                  if (item.isBalanceRow) {
                    return (
                      <div key={item.id} className="flex items-center justify-between border-y border-gray-600 bg-gray-900/80 p-3">
                        <div className="flex items-center gap-2 text-sm font-bold uppercase text-orange-400">
                          <FaWallet /> {item.descricao} ({formatDate(item.data)})
                        </div>
                        <div className={`text-sm font-bold ${item.valor >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
                          {formatBRLNumber(item.valor)}
                        </div>
                      </div>
                    );
                  }

                  const isMatched = !!matches[item.id];
                  return (
                    <div key={item.id} className={`flex items-center justify-between rounded border p-3 ${isMatched ? 'border-green-600 bg-green-900/20' : 'border-gray-600 bg-gray-800'}`}>
                      <div className="mr-2 min-w-0 flex-grow overflow-hidden">
                        <div className="text-xs text-gray-400">{formatDate(item.data)}</div>
                        <div className="truncate text-sm font-semibold" title={item.descricao}>{item.descricao}</div>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <div className={`font-bold ${item.valor < 0 ? 'text-red-400' : 'text-green-400'}`}>{formatBRLNumber(item.valor)}</div>
                        {!isMatched ? (
                          <button
                            onClick={() => handleCriarNovo(item)}
                            className="mt-1 rounded bg-blue-600 px-2 py-1 text-xs text-white transition-colors hover:bg-blue-500"
                          >
                            + Criar
                          </button>
                        ) : (
                          <span className="mt-1 flex items-center justify-end gap-1 text-xs font-bold text-green-500">✓ Conciliado</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex min-h-0 flex-col overflow-hidden rounded-md border border-gray-700 bg-gray-900 xl:col-span-1">
              <div className="sticky top-0 border-b border-gray-600 bg-gray-700 p-3 text-center font-bold">
                SISTEMA (FLUXO DE CAIXA)
                <span className="block text-xs font-normal text-gray-400">{loadingSistema ? 'Carregando...' : `${lancamentosProcessados.length} registros visíveis`}</span>
              </div>
              <div className="flex-grow overflow-y-auto p-2 space-y-2">
                {!loadingSistema && lancamentosProcessados.length === 0 && (
                  <div className="flex h-full flex-col items-center justify-center p-6 text-center text-gray-500">
                    <p>Nenhum lançamento encontrado.</p>
                    {!contaSelecionada && <p className="mt-2 text-yellow-400">Selecione uma conta para ver os dados.</p>}
                  </div>
                )}

                {lancamentosProcessados.map((sysItem) => {
                  if (sysItem.isBalanceRow) {
                    return (
                      <div key={sysItem.id} className="flex items-center justify-between border-y border-gray-600 bg-gray-900/80 p-3">
                        <div className="flex items-center gap-2 text-sm font-bold uppercase text-orange-400">
                          <FaWallet /> {sysItem.descricao} ({formatDate(sysItem.dataMovimento)})
                        </div>
                        <div className={`text-sm font-bold ${sysItem.valor >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
                          {formatBRLNumber(sysItem.valor)}
                        </div>
                      </div>
                    );
                  }

                  const matchedOfxId = Object.keys(matches).find((key) => matches[key] === sysItem.id);
                  const isMatched = !!matchedOfxId;

                  return (
                    <div key={sysItem.id} className={`rounded border p-3 ${isMatched ? 'border-green-600 bg-green-900/20 opacity-80' : 'border-gray-600 bg-gray-800'}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-grow overflow-hidden">
                          <div className="text-xs text-gray-400">{formatDate(sysItem.dataMovimento || sysItem.data)}</div>
                          <div className="truncate text-sm font-semibold" title={sysItem.descricao}>{sysItem.descricao}</div>
                          <div className="truncate text-xs text-gray-500">{sysItem.categoria}</div>
                        </div>
                        <div className="flex-shrink-0 text-right">
                          <div className={`font-bold ${sysItem.valor < 0 ? 'text-red-400' : 'text-green-400'}`}>{formatBRLNumber(sysItem.valor)}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
