'use client';

import { useState, useEffect } from 'react';
import { formatBRLInput, parseBRL, formatDisplayConta } from '@/app/utils/formatters';

export default function EditLancamentoModal({ isOpen, onClose, onSave, lancamento, contasMaster }) {
  const [formData, setFormData] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen && lancamento) {
      setFormData({
        ...lancamento,
        data_movimento: lancamento.dataMovimento ? new Date(lancamento.dataMovimento).toISOString().split('T')[0] : '',
        valor: formatBRLInput(String(Math.abs(lancamento.valor) * 100)),
        conta_bancaria: lancamento.contaBancaria || '',
        natureza: lancamento.natureza || 'Despesas Administrativas'
      });
    }
  }, [isOpen, lancamento]);

  if (!isOpen || !lancamento) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleValorChange = (e) => {
    setFormData((prev) => ({ ...prev, valor: formatBRLInput(e.target.value) }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsSaving(true);

    const valorNumerico = parseBRL(formData.valor);
    const valorFinal = lancamento.valor < 0 ? -Math.abs(valorNumerico) : Math.abs(valorNumerico);

    const payload = {
      id: formData.id,
      data_movimento: formData.data_movimento,
      descricao: formData.descricao,
      valor: valorFinal,
      conta_bancaria: formData.conta_bancaria,
      categoria: lancamento.valor < 0 ? 'Movimentação Avulsa' : lancamento.categoria,
      natureza: lancamento.valor < 0 ? formData.natureza : null
    };

    const success = await onSave(payload);
    if (success) {
      onClose();
    } else {
      setError('Falha ao atualizar o lançamento.');
    }
    setIsSaving(false);
  };

  const isReadOnly = ['Pagamento de Borderô', 'Recebimento', 'Transferencia Enviada', 'Transferencia Recebida'].includes(lancamento.categoria);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl bg-gray-800 text-white shadow-2xl sm:max-w-lg sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-gray-700 px-5 py-4 sm:px-6">
          <h2 className="text-lg font-bold sm:text-xl">Editar Lançamento</h2>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-6">
          {isReadOnly ? (
            <div className="space-y-4">
              <p className="text-yellow-400">
                Este lançamento foi gerado automaticamente por uma operação e não pode ser editado.
              </p>
              <div className="border-t border-gray-700 pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full rounded-md bg-gray-600 px-4 py-3 font-semibold text-gray-100 transition hover:bg-gray-500"
                >
                  Fechar
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label htmlFor="data_movimento" className="block text-sm font-medium text-gray-300">Data</label>
                  <input type="date" id="data_movimento" name="data_movimento" value={formData.data_movimento || ''} onChange={handleChange} required className="mt-1 block w-full rounded-md border border-gray-600 bg-gray-700 p-3 shadow-sm" />
                </div>
                <div>
                  <label htmlFor="valor" className="block text-sm font-medium text-gray-300">Valor</label>
                  <input type="text" id="valor" value={formData.valor || ''} onChange={handleValorChange} required className="mt-1 block w-full rounded-md border border-gray-600 bg-gray-700 p-3 shadow-sm" />
                </div>
              </div>

              <div>
                <label htmlFor="descricao" className="block text-sm font-medium text-gray-300">Descrição</label>
                <input type="text" id="descricao" name="descricao" value={formData.descricao || ''} onChange={handleChange} required className="mt-1 block w-full rounded-md border border-gray-600 bg-gray-700 p-3 shadow-sm" />
              </div>

              <div>
                <label htmlFor="conta_bancaria" className="block text-sm font-medium text-gray-300">Conta</label>
                <select id="conta_bancaria" name="conta_bancaria" value={formData.conta_bancaria || ''} onChange={handleChange} required className="mt-1 block w-full rounded-md border border-gray-600 bg-gray-700 p-3 shadow-sm">
                  <option value="">Selecione...</option>
                  {Array.isArray(contasMaster) && contasMaster.map((c) => (
                    <option key={c.contaBancaria} value={c.contaBancaria}>
                      {formatDisplayConta(c.contaBancaria)}
                    </option>
                  ))}
                </select>
              </div>

              {lancamento.valor < 0 && (
                <div className="mt-2">
                  <label className="mb-1 block text-sm font-medium text-orange-400">Natureza (Classificação DRE)</label>
                  <select name="natureza" value={formData.natureza} onChange={handleChange} className="w-full rounded-md border border-gray-600 bg-gray-700 p-3 text-white">
                    <option value="Despesas Administrativas">Despesas Administrativas</option>
                    <option value="Despesas Financeiras">Despesas Financeiras</option>
                    <option value="Despesas Tributárias">Despesas Tributárias</option>
                    <option value="Serviços de Terceiros (FIDC)">Serviços de Terceiros</option>
                    <option value="Aquisição de Direitos Creditórios">Aquisição de Direitos Creditórios</option>
                    <option value="Distribuição de Lucros / Amortização">Distribuição de Lucros / Amortização</option>
                    <option value="Transferência Entre Contas">Transferência Entre Contas</option>
                    <option value="Empréstimos / Mútuos">Empréstimos / Mútuos</option>
                    <option value="Outras Despesas">Outras Despesas</option>
                  </select>
                </div>
              )}

              {error && <p className="mt-2 text-sm text-red-400">{error}</p>}

              <div className="sticky bottom-0 flex gap-3 border-t border-gray-700 bg-gray-800 pt-4">
                <button type="button" onClick={onClose} className="flex-1 rounded-md bg-gray-600 px-4 py-3 font-semibold text-gray-100 transition hover:bg-gray-500">Cancelar</button>
                <button type="submit" disabled={isSaving} className="flex-1 rounded-md bg-orange-500 px-4 py-3 font-semibold text-white transition hover:bg-orange-600 disabled:bg-orange-400">
                  {isSaving ? 'Salvando...' : 'Salvar Alterações'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
