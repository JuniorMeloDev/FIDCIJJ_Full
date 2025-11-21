// app/components/ConciliacaoOFXModal.jsx
"use client";

import { useState, useEffect } from 'react';
import { formatBRLNumber, formatDate } from '../utils/formatters';

export default function ConciliacaoOFXModal({ isOpen, onClose, ofxData, onConciliar, onCriarLancamento, contas = [], lancamentosDoGrid = [] }) {
  const [contaSelecionada, setContaSelecionada] = useState('');
  const [lancamentosSistema, setLancamentosSistema] = useState([]);
  const [loadingSistema, setLoadingSistema] = useState(false);
  const [matches, setMatches] = useState({});

  // Filtros de Data
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');

  // Inicialização
  useEffect(() => {
    if (isOpen) {
      setMatches({});
      setLancamentosSistema([]);
      
      // Define datas padrão (Mês Atual)
      const hoje = new Date();
      const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
      
      // Ajuste para garantir formato YYYY-MM-DD correto
      const formatDateIso = (date) => date.toISOString().split('T')[0];
      
      setDataInicio(formatDateIso(primeiroDia));
      setDataFim(formatDateIso(hoje));

      // Se só tiver uma conta, seleciona ela. 
      // Se tiver lançamentos no grid, tenta pegar a conta do primeiro item para facilitar.
      if (contas && contas.length === 1) {
          setContaSelecionada(contas[0].id);
      } else if (contas.length > 0 && lancamentosDoGrid.length > 0) {
          const item = lancamentosDoGrid[0];
          // Tenta encontrar um ID, mas geralmente o grid só tem o nome. 
          // Nesse caso, deixamos o usuário selecionar ou mantemos vazio.
          const idContaGrid = item.contaBancariaId || item.conta_bancaria_id || item.conta_id;
          if (idContaGrid) setContaSelecionada(idContaGrid);
      }
    }
  }, [isOpen, contas, lancamentosDoGrid]);

  // Carrega dados quando Conta ou Data mudam
  useEffect(() => {
    if (dataInicio && dataFim) {
      carregarDadosSistema();
    }
  }, [contaSelecionada, dataInicio, dataFim, lancamentosDoGrid]);

  const carregarDadosSistema = async () => {
    setLoadingSistema(true);

    // --- CORREÇÃO: Prepara o nome da conta para filtragem ---
    // O dropdown retorna um ID, mas o grid muitas vezes exibe o nome formatado (ex: "Itaú - Ag...").
    // Precisamos encontrar o nome correspondente ao ID selecionado para filtrar corretamente.
    let nomeContaSelecionada = '';
    if (contaSelecionada) {
        const contaObj = contas.find(c => String(c.id) === String(contaSelecionada));
        if (contaObj) {
            // Usa a propriedade contaBancaria que já vem formatada ("Banco - Ag / CC")
            nomeContaSelecionada = contaObj.contaBancaria; 
        }
    }

    // Filtra os lançamentos que já estão carregados na tela (lancamentosDoGrid)
    const dadosLocaisFiltrados = lancamentosDoGrid.filter(item => {
        // Pega a data do item
        const rawDate = item.dataMovimento || item.data || item.data_movimento || '';
        if (!rawDate) return false;
        const dataItem = rawDate.split('T')[0];
        
        // Verifica Data
        const dateMatch = (dataItem >= dataInicio && dataItem <= dataFim);

        // Verifica Conta (SE houver conta selecionada)
        let accountMatch = true;
        if (contaSelecionada && nomeContaSelecionada) {
             // Compara a string salva no banco com a string da conta selecionada
             // Verifica ambas as chaves possíveis (camelCase e snake_case)
             const contaItem = item.contaBancaria || item.conta_bancaria;
             accountMatch = (contaItem === nomeContaSelecionada);
        }

        return dateMatch && accountMatch;
    });

    // Atualiza a lista e roda a auto-conciliação
    setLancamentosSistema(dadosLocaisFiltrados);
    if (ofxData && ofxData.length > 0) {
        autoConciliar(ofxData, dadosLocaisFiltrados);
    }
    setLoadingSistema(false);
  };

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
                    <option value="">-- Todas as Contas --</option>
                    {contas.map(c => (
                        <option key={c.id} value={c.id}>
                             {/* Exibe formatado: Banco - Ag: XXX (Descricao) */}
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

        {/* Lado Direito: Sistema */}
        <div className="w-1/2 flex flex-col bg-gray-900">
            <div className="p-3 bg-gray-700 font-bold text-center border-b border-gray-600 sticky top-0">
                SISTEMA (FLUXO DE CAIXA)
                <span className="block text-xs text-gray-400 font-normal">{loadingSistema ? 'Carregando...' : `${lancamentosSistema.length} registros visíveis`}</span>
            </div>
            <div className="flex-grow overflow-y-auto p-2 space-y-2">
                {/* Mensagens de estado vazio */}
                {!loadingSistema && lancamentosSistema.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-gray-500 p-6 text-center">
                        <p>Nenhum lançamento encontrado no sistema neste período.</p>
                        {contaSelecionada && <p className="text-xs mt-2 text-orange-400">(Filtrando pela conta selecionada)</p>}
                    </div>
                )}
                
                {lancamentosSistema.map((sysItem) => {
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