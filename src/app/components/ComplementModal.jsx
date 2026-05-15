'use client';

import { useState, useEffect, useMemo } from 'react';
import { formatBRLInput, parseBRL } from '@/app/utils/formatters';
import PixConfirmationModal from './PixConfirmationModal';

export default function ComplementModal({ isOpen, onClose, onSave, lancamentoOriginal, contasMaster }) {
  const [valorComplemento, setValorComplemento] = useState('');
  const [dataComplemento, setDataComplemento] = useState(new Date().toISOString().split('T')[0]);
  const [contaBancaria, setContaBancaria] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const [isPagarComPix, setIsPagarComPix] = useState(false);
  const [pixData, setPixData] = useState({ tipo_chave_pix: 'CPF/CNPJ', chave: '' });
  const [isPixConfirmOpen, setIsPixConfirmOpen] = useState(false);
  const [pixPayload, setPixPayload] = useState(null);

  const isContaInter = useMemo(
    () =>
      contaBancaria &&
      String(contasMaster.find((c) => c.contaBancaria === contaBancaria)?.banco || '').toLowerCase().includes('inter'),
    [contaBancaria, contasMaster]
  );

  useEffect(() => {
    if (isOpen) {
      setValorComplemento('');
      setDataComplemento(new Date().toISOString().split('T')[0]);
      setContaBancaria(lancamentoOriginal?.contaBancaria || '');
      setIsPagarComPix(false);
      setPixData({ tipo_chave_pix: 'CPF/CNPJ', chave: '' });
      setError('');
    }
  }, [isOpen, lancamentoOriginal]);

  if (!isOpen) return null;

  const handleConfirmAndSendPix = async () => {
    setIsSaving(true);
    setError('');
    try {
      const response = await fetch('/api/lancamentos/pix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionStorage.getItem('authToken')}` },
        body: JSON.stringify(pixPayload)
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Falha ao processar pagamento PIX.');

      await onSave();
      setIsPixConfirmOpen(false);
      onClose();
    } catch (err) {
      setError(err.message);
      setIsPixConfirmOpen(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveClick = async () => {
    setError('');
    if (!valorComplemento || parseBRL(valorComplemento) <= 0) {
      setError('O valor do complemento deve ser maior que zero.');
      return;
    }
    if (!contaBancaria) {
      setError('Selecione uma conta de origem.');
      return;
    }

    if (isPagarComPix) {
      if (!pixData.chave) {
        setError('A chave PIX é obrigatória.');
        return;
      }
      const contaOrigemObj = contasMaster.find((c) => c.contaBancaria === contaBancaria);
      if (!contaOrigemObj) {
        setError('Conta de origem não encontrada.');
        return;
      }

      const payload = {
        valor: parseBRL(valorComplemento),
        descricao: `Complemento Borderô #${lancamentoOriginal?.operacaoId}`,
        contaOrigem: contaOrigemObj.contaCorrente,
        empresaAssociada: lancamentoOriginal.empresaAssociada,
        operacao_id: lancamentoOriginal.operacaoId,
        destinatario: {
          tipo: pixData.tipo_chave_pix,
          chave: pixData.chave
        }
      };
      setPixPayload(payload);
      setIsPixConfirmOpen(true);
    } else {
      setIsSaving(true);
      const payload = {
        valor: parseBRL(valorComplemento),
        data: dataComplemento,
        operacao_id: lancamentoOriginal.operacaoId,
        conta_bancaria: contaBancaria,
        empresa_associada: lancamentoOriginal.empresaAssociada
      };
      const success = await onSave(payload);
      if (success) onClose();
      setIsSaving(false);
    }
  };

  let displayTitle = `Lançamento referente ao Borderô #${lancamentoOriginal?.operacaoId || ''}`;
  if (lancamentoOriginal?.descricao) {
    const nfMatch = lancamentoOriginal.descricao.match(/(NF|CTe) [0-9.]+/);
    if (nfMatch && nfMatch[0]) {
      displayTitle = `Lançamento referente ao Borderô ${nfMatch[0]}`;
    }
  }

  return (
    <>
      <PixConfirmationModal
        isOpen={isPixConfirmOpen}
        onClose={() => setIsPixConfirmOpen(false)}
        onConfirm={handleConfirmAndSendPix}
        data={pixPayload}
        isSending={isSaving}
      />

      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4">
        <div
          className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl bg-gray-800 text-white shadow-2xl sm:max-w-md sm:rounded-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="border-b border-gray-700 px-5 py-4 sm:px-6">
            <h2 className="text-lg font-bold sm:text-2xl">Adicionar Complemento de Pagamento</h2>
            <p className="mt-1 text-sm text-gray-400">{displayTitle}</p>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-6">
            <div className="space-y-4">
              <div>
                <label htmlFor="dataComplemento" className="block text-sm font-medium text-gray-300">Data do Pagamento</label>
                <input
                  type="date"
                  id="dataComplemento"
                  value={dataComplemento}
                  onChange={(e) => setDataComplemento(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-600 bg-gray-700 p-3 shadow-sm disabled:bg-gray-600"
                  disabled={isPagarComPix}
                />
              </div>

              <div>
                <label htmlFor="contaBancaria" className="block text-sm font-medium text-gray-300">Debitar da Conta</label>
                <select
                  id="contaBancaria"
                  value={contaBancaria}
                  onChange={(e) => setContaBancaria(e.target.value)}
                  required
                  className="mt-1 block w-full rounded-md border border-gray-600 bg-gray-700 p-3 shadow-sm"
                >
                  <option value="">Selecione uma conta...</option>
                  {Array.isArray(contasMaster) && contasMaster.map((c) => (
                    <option key={c.contaBancaria} value={c.contaBancaria}>{c.contaBancaria}</option>
                  ))}
                </select>
              </div>

              {isContaInter && (
                <div className="border-t border-gray-700 pt-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={isPagarComPix}
                      onChange={(e) => setIsPagarComPix(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-500 bg-gray-600 text-orange-500 focus:ring-orange-500"
                    />
                    <span className="text-sm font-semibold text-orange-300">Pagar com PIX</span>
                  </label>
                </div>
              )}

              {isPagarComPix && (
                <div className="space-y-4 border-t border-orange-500/50 pt-4">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium text-gray-300">Tipo da Chave</label>
                      <select value={pixData.tipo_chave_pix} onChange={(e) => setPixData((p) => ({ ...p, tipo_chave_pix: e.target.value }))} className="mt-1 block w-full rounded-md border border-gray-600 bg-gray-700 p-3">
                        <option value="CPF/CNPJ">CPF/CNPJ</option>
                        <option value="Email">Email</option>
                        <option value="Telefone">Telefone</option>
                        <option value="Aleatória">Aleatória</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300">Chave PIX</label>
                      <input type="text" value={pixData.chave} onChange={(e) => setPixData((p) => ({ ...p, chave: e.target.value }))} required className="mt-1 block w-full rounded-md border border-gray-600 bg-gray-700 p-3" />
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label htmlFor="valorComplemento" className="block text-sm font-medium text-gray-300">Valor</label>
                <input
                  type="text"
                  id="valorComplemento"
                  value={valorComplemento}
                  onChange={(e) => setValorComplemento(formatBRLInput(e.target.value))}
                  placeholder="R$ 0,00"
                  className="mt-1 block w-full rounded-md border border-gray-600 bg-gray-700 p-3 shadow-sm"
                />
              </div>

              {error && <p className="text-center text-sm text-red-400">{error}</p>}
            </div>
          </div>

          <div className="border-t border-gray-700 px-5 py-4 sm:px-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button onClick={onClose} className="w-full rounded-md bg-gray-600 px-4 py-3 font-semibold text-gray-100 transition hover:bg-gray-500 sm:w-auto">
                Cancelar
              </button>
              <button onClick={handleSaveClick} disabled={isSaving} className="w-full rounded-md bg-orange-500 px-4 py-3 font-semibold text-white transition hover:bg-orange-600 disabled:opacity-50 sm:w-auto">
                {isSaving ? 'Processando...' : (isPagarComPix ? 'Avançar' : 'Salvar Complemento')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
