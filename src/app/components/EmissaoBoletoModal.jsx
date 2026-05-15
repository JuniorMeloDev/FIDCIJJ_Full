'use client';

import { useState, useEffect } from 'react';
import { formatBRLNumber, formatDate, formatBRLInput, parseBRL } from '@/app/utils/formatters';

const AbatimentoQuestionModal = ({ isOpen, onClose, onConfirmYes, onConfirmNo }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/80 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-t-3xl bg-gray-700 p-6 text-white shadow-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-4 text-center text-lg font-semibold">Aplicar Abatimento?</h3>
        <p className="mb-6 text-center text-sm text-gray-300">Deseja inserir um valor de abatimento que será subtraído de cada boleto?</p>
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button onClick={onConfirmNo} className="w-full rounded-md bg-gray-600 px-6 py-3 font-semibold transition hover:bg-gray-500 sm:w-auto">Não</button>
          <button onClick={onConfirmYes} className="w-full rounded-md bg-orange-500 px-6 py-3 font-semibold transition hover:bg-orange-600 sm:w-auto">Sim</button>
        </div>
      </div>
    </div>
  );
};

const AbatimentoInputModal = ({ isOpen, onClose, onConfirm }) => {
  const [valor, setValor] = useState('');
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/80 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-t-3xl bg-gray-700 p-6 text-white shadow-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-4 text-lg font-semibold">Valor do Abatimento</h3>
        <p className="mb-4 text-sm text-gray-300">Digite o valor a ser abatido de CADA parcela.</p>
        <input
          type="text"
          value={valor}
          onChange={(e) => setValor(formatBRLInput(e.target.value))}
          placeholder="R$ 0,00"
          className="w-full rounded-md border border-gray-500 bg-gray-600 p-3 text-center text-lg shadow-sm"
        />
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button onClick={onClose} className="w-full rounded-md bg-gray-500 px-4 py-3 font-semibold transition hover:bg-gray-400 sm:w-auto">Cancelar</button>
          <button onClick={() => onConfirm(parseBRL(valor))} className="w-full rounded-md bg-orange-500 px-4 py-3 font-semibold transition hover:bg-orange-600 sm:w-auto">Confirmar Valor</button>
        </div>
      </div>
    </div>
  );
};

const AbatimentoConfirmationModal = ({ isOpen, onClose, onConfirm, duplicatas, abatimento, isLoading }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/80 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-gray-700 p-6 text-white shadow-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-2 text-lg font-semibold">Confirme os Novos Valores</h3>
        <p className="mb-4 text-sm text-gray-300">
          O valor de abatimento de <span className="font-bold text-orange-400">{formatBRLNumber(abatimento)}</span> será aplicado a cada parcela, resultando nos valores abaixo.
        </p>
        <div className="max-h-48 space-y-2 overflow-y-auto rounded bg-gray-800 p-3">
          {duplicatas.map((dup) => (
            <div key={dup.id} className="flex justify-between border-b border-gray-600 pb-1 text-sm">
              <span>{dup.nfCte}: <span className="text-gray-400 line-through">{formatBRLNumber(dup.valorBruto)}</span></span>
              <span className="font-bold text-green-400">{formatBRLNumber(dup.valorBruto - abatimento)}</span>
            </div>
          ))}
        </div>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button onClick={onClose} disabled={isLoading} className="w-full rounded-md bg-gray-500 px-4 py-3 font-semibold transition hover:bg-gray-400 disabled:opacity-50 sm:w-auto">Cancelar</button>
          <button onClick={onConfirm} disabled={isLoading} className="w-full rounded-md bg-green-600 px-4 py-3 font-semibold transition hover:bg-green-700 disabled:opacity-50 sm:w-auto">
            {isLoading ? 'Emitindo...' : 'Emitir com Abatimento'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default function EmissaoBoletoModal({ isOpen, onClose, duplicatas, showNotification, onSucesso }) {
  const [bancoSelecionado, setBancoSelecionado] = useState('itau');
  const [isLoading, setIsLoading] = useState(false);
  const [resultados, setResultados] = useState([]);
  const [jaEmitido, setJaEmitido] = useState(false);
  const [showAbatimentoQuestion, setShowAbatimentoQuestion] = useState(false);
  const [showAbatimentoInput, setShowAbatimentoInput] = useState(false);
  const [showAbatimentoConfirmation, setShowAbatimentoConfirmation] = useState(false);
  const [abatimento, setAbatimento] = useState(0);

  const operacaoId = duplicatas[0]?.operacaoId;

  useEffect(() => {
    if (isOpen && duplicatas.length > 0) {
      setResultados([]);
      setAbatimento(0);
      const todosEmitidos = duplicatas.every((d) => d.linha_digitavel && d.linha_digitavel !== 'N/A');
      setJaEmitido(todosEmitidos);
      if (todosEmitidos) {
        setResultados(duplicatas.map((d) => ({
          duplicataId: d.id,
          nfCte: d.nfCte,
          success: true,
          linhaDigitavel: d.linha_digitavel,
          banco: d.banco_emissor_boleto,
        })));
      }
    }
  }, [isOpen, duplicatas]);

  if (!isOpen) return null;

  const getAuthHeader = () => {
    const token = sessionStorage.getItem('authToken');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const handleDownloadJson = async (duplicataId) => {
    showNotification('Preparando JSON para download...', 'info');
    try {
      const res = await fetch(`/api/dados-boleto/safra/${duplicataId}?json=true`, { headers: getAuthHeader() });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Falha ao obter dados do boleto.');
      }
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `boleto_safra_duplicata_${duplicataId}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      showNotification(err.message, 'error');
    }
  };

  const handleImprimirTodos = async () => {
    if (!operacaoId) return showNotification('ID da operação não encontrado.', 'error');
    const bancoEmissor = resultados[0]?.banco || duplicatas[0]?.banco_emissor_boleto || bancoSelecionado;
    if (!bancoEmissor) return showNotification('Não foi possível identificar o banco emissor.', 'error');

    const ids = resultados.length > 0 ? resultados.map((r) => r.duplicataId) : duplicatas.map((d) => d.id);
    const endpoint = `/api/${bancoEmissor}/boleto-pdf/${operacaoId}?ids=${ids.join(',')}`;
    showNotification(`Gerando PDF do ${bancoEmissor.charAt(0).toUpperCase() + bancoEmissor.slice(1)}...`, 'info');

    try {
      const res = await fetch(endpoint, { headers: getAuthHeader() });
      if (!res.ok) throw new Error((await res.json()).message || 'Não foi possível gerar o PDF.');
      const contentDisposition = res.headers.get('content-disposition');
      let filename = `boletos_op_${operacaoId}.pdf`;
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="([^"]+)"/);
        if (filenameMatch?.[1]) filename = filenameMatch[1];
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      showNotification(err.message, 'error');
    }
  };

  const handleEmitirBoletos = async (valorAbatimento = 0) => {
    setIsLoading(true);
    setResultados([]);
    setShowAbatimentoQuestion(false);
    setShowAbatimentoInput(false);
    setShowAbatimentoConfirmation(false);

    showNotification(`Iniciando emissão de ${duplicatas.length} boleto(s)...`, 'info');
    const resultadosEmissao = [];
    for (const duplicata of duplicatas) {
      try {
        const response = await fetch('/api/boletos/emitir', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
          body: JSON.stringify({
            duplicataId: duplicata.id,
            banco: bancoSelecionado,
            abatimento: valorAbatimento
          }),
        });
        const resultado = await response.json();
        if (!response.ok || !resultado.success) {
          throw new Error(resultado.message || `Falha ao registrar boleto para a duplicata ${duplicata.nfCte}.`);
        }
        resultadosEmissao.push({
          duplicataId: duplicata.id,
          nfCte: duplicata.nfCte,
          success: true,
          linhaDigitavel: resultado.linhaDigitavel,
          banco: bancoSelecionado,
        });
      } catch (err) {
        resultadosEmissao.push({
          duplicataId: duplicata.id,
          nfCte: duplicata.nfCte,
          success: false,
          error: err.message,
        });
      }
    }
    setResultados(resultadosEmissao);
    setIsLoading(false);
    showNotification('Processo de emissão finalizado.', 'success');
    onSucesso();
  };

  const startEmissaoProcess = () => {
    if (['itau', 'safra', 'bradesco'].includes(bancoSelecionado)) {
      setShowAbatimentoQuestion(true);
    } else {
      handleEmitirBoletos(0);
    }
  };

  const cedente = duplicatas[0]?.empresaCedente;
  const sacado = duplicatas[0]?.clienteSacado;

  return (
    <>
      <AbatimentoQuestionModal
        isOpen={showAbatimentoQuestion}
        onClose={() => setShowAbatimentoQuestion(false)}
        onConfirmYes={() => { setShowAbatimentoQuestion(false); setShowAbatimentoInput(true); }}
        onConfirmNo={() => handleEmitirBoletos(0)}
      />
      <AbatimentoInputModal
        isOpen={showAbatimentoInput}
        onClose={() => setShowAbatimentoInput(false)}
        onConfirm={(valor) => {
          if (valor > 0) {
            setAbatimento(valor);
            setShowAbatimentoInput(false);
            setShowAbatimentoConfirmation(true);
          } else {
            handleEmitirBoletos(0);
          }
        }}
      />
      <AbatimentoConfirmationModal
        isOpen={showAbatimentoConfirmation}
        onClose={() => setShowAbatimentoConfirmation(false)}
        onConfirm={() => handleEmitirBoletos(abatimento)}
        duplicatas={duplicatas}
        abatimento={abatimento}
        isLoading={isLoading}
      />

      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" onClick={onClose}>
        <div
          className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl bg-gray-800 text-white shadow-2xl sm:max-w-2xl sm:rounded-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="border-b border-gray-700 px-5 py-4 sm:px-6">
            <h2 className="text-2xl font-bold">Emissão de Boletos - Operação #{operacaoId}</h2>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-6">
            {resultados.length === 0 && !jaEmitido ? (
              <>
                <div className="mb-6 space-y-3 rounded-md bg-gray-700 p-4">
                  <p><strong>Cedente:</strong> {cedente}</p>
                  <p><strong>Sacado:</strong> {sacado}</p>
                  <p><strong>Boletos a serem emitidos:</strong> {duplicatas.length}</p>
                  <ul className="list-inside list-disc pl-4 text-sm text-gray-300">
                    {duplicatas.map((dup) => (
                      <li key={dup.id}>
                        {dup.nfCte} - Venc: {formatDate(dup.dataVencimento)} - Valor: {formatBRLNumber(dup.valorBruto)}
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <label htmlFor="banco" className="mb-2 block text-sm font-medium text-gray-300">Selecione o banco para a emissão:</label>
                  <select
                    id="banco"
                    value={bancoSelecionado}
                    onChange={(e) => setBancoSelecionado(e.target.value)}
                    className="w-full rounded-md border border-gray-500 bg-gray-600 p-3 shadow-sm"
                  >
                    <option value="itau">Itaú</option>
                    <option value="safra">Safra</option>
                    <option value="bradesco">Bradesco</option>
                    <option value="inter">Inter</option>
                  </select>
                </div>
              </>
            ) : (
              <div>
                <h3 className="mb-4 text-lg font-semibold">{jaEmitido ? 'Boletos Já Emitidos:' : 'Resultados da Emissão:'}</h3>
                <div className="max-h-60 space-y-2 overflow-y-auto pr-2">
                  {resultados.map((res, index) => (
                    <div key={index} className={`rounded-md p-3 ${res.success ? 'bg-green-900/50' : 'bg-red-900/50'}`}>
                      <p className="font-bold">{res.nfCte}</p>
                      {res.success ? (
                        <div>
                          <p className="text-sm text-green-300">Sucesso! Linha Digitável: {res.linhaDigitavel}</p>
                          {res.banco === 'safra' && (
                            <button onClick={() => handleDownloadJson(res.duplicataId)} className="mt-1 text-xs text-blue-300 hover:underline">
                              Baixar JSON (Safra)
                            </button>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm text-red-300">Erro: {res.error}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-gray-700 px-5 py-4 sm:px-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
              {resultados.length === 0 && !jaEmitido ? (
                <>
                  <button onClick={onClose} disabled={isLoading} className="w-full rounded-md bg-gray-600 px-4 py-3 font-semibold text-gray-100 transition hover:bg-gray-500 disabled:opacity-50 sm:w-auto">
                    Cancelar
                  </button>
                  <button onClick={startEmissaoProcess} disabled={isLoading} className="w-full rounded-md bg-orange-500 px-4 py-3 font-semibold text-white transition hover:bg-orange-600 disabled:opacity-50 sm:w-auto">
                    {isLoading ? 'Aguarde...' : 'Confirmar Emissão'}
                  </button>
                </>
              ) : (
                <>
                  <button onClick={handleImprimirTodos} className="w-full rounded-md bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-700 sm:w-auto">
                    Imprimir Todos
                  </button>
                  <button onClick={onClose} className="w-full rounded-md bg-gray-600 px-4 py-3 font-semibold text-gray-100 transition hover:bg-gray-500 sm:w-auto">
                    Fechar
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
