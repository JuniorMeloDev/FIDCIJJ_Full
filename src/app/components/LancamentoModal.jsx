'use client';

import { useState, useEffect } from 'react';
import { formatBRLInput, parseBRL, formatDisplayConta } from '@/app/utils/formatters';

export default function LancamentoModal({
  isOpen,
  onClose,
  onSave,
  onPixSubmit,
  contasMaster,
  clienteMasterNome
}) {
  const [tipo, setTipo] = useState('DEBITO');
  const [data, setData] = useState(new Date().toISOString().split('T')[0]);
  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState('');
  const [contaOrigem, setContaOrigem] = useState('');
  const [contaDestino, setContaDestino] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [pixData, setPixData] = useState({ tipo_chave_pix: 'CPF/CNPJ', chave: '' });
  const [natureza, setNatureza] = useState('Despesas Administrativas');

  const contasPix = Array.isArray(contasMaster)
    ? contasMaster.filter(
        (c) =>
          String(c?.banco || '').toLowerCase().includes('inter') ||
          String(c?.banco || '').toLowerCase().includes('itaú') ||
          String(c?.banco || '').toLowerCase().includes('itau')
      )
    : [];

  useEffect(() => {
    if (isOpen) handleLimpar();
  }, [isOpen]);

  const handleLimpar = () => {
    setTipo('DEBITO');
    setData(new Date().toISOString().split('T')[0]);
    setDescricao('');
    setValor('');
    setContaOrigem('');
    setContaDestino('');
    setError('');
    setPixData({ tipo_chave_pix: 'CPF/CNPJ', chave: '' });
    setNatureza('Despesas Administrativas');
  };

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (tipo === 'TRANSFERENCIA' && contaOrigem === contaDestino) {
      setError('A conta de origem e destino não podem ser as mesmas.');
      return;
    }

    const contaNoDb = process.env.NEXT_PUBLIC_ITAU_CONTA_DB;
    const contaDisplay = process.env.NEXT_PUBLIC_ITAU_CONTA_DISPLAY;
    let contaOrigemParaSalvar = contaOrigem;
    let contaDestinoParaSalvar = contaDestino;

    if ((tipo === 'DEBITO' || tipo === 'CREDITO') && contaNoDb && contaDisplay && contaOrigem.endsWith(contaNoDb)) {
      contaOrigemParaSalvar =
        contasMaster.find((c) => c.contaBancaria.endsWith(contaNoDb))
          ?.contaBancaria.replace(contaNoDb, contaDisplay) || contaOrigem;
    } else if (tipo === 'TRANSFERENCIA' && contaNoDb && contaDisplay) {
      if (contaOrigem.endsWith(contaNoDb)) {
        contaOrigemParaSalvar =
          contasMaster.find((c) => c.contaBancaria.endsWith(contaNoDb))
            ?.contaBancaria.replace(contaNoDb, contaDisplay) || contaOrigem;
      }
      if (contaDestino.endsWith(contaNoDb)) {
        contaDestinoParaSalvar =
          contasMaster.find((c) => c.contaBancaria.endsWith(contaNoDb))
            ?.contaBancaria.replace(contaNoDb, contaDisplay) || contaDestino;
      }
    }

    if (tipo === 'PIX') {
      const payload = {
        valor: parseBRL(valor),
        descricao,
        contaOrigem,
        empresaAssociada: clienteMasterNome,
        pix: { tipo: pixData.tipo_chave_pix, chave: pixData.chave },
        chavePix: pixData.chave,
        tipoChave: pixData.tipo_chave_pix,
        natureza
      };
      onPixSubmit(payload);
      return;
    }

    setIsSaving(true);
    const payload = {
      tipo,
      data,
      descricao,
      valor: parseBRL(valor),
      contaOrigem: contaOrigemParaSalvar,
      empresaAssociada: clienteMasterNome,
      contaDestino: tipo === 'TRANSFERENCIA' ? contaDestinoParaSalvar : null,
      empresaDestino: tipo === 'TRANSFERENCIA' ? clienteMasterNome : null,
      isDespesa: false,
      natureza: tipo === 'DEBITO' ? natureza : null
    };

    const success = await onSave(payload);
    if (success) {
      onClose();
    } else {
      setError('Falha ao salvar o lançamento.');
    }
    setIsSaving(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl bg-gray-800 text-white shadow-2xl sm:max-w-lg sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-gray-700 px-5 py-4 sm:px-6">
          <h2 className="text-lg font-bold sm:text-xl">Novo Lançamento Manual</h2>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-6">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-300">Tipo de Lançamento</label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex items-center gap-3 rounded-xl border border-gray-700 bg-gray-750 px-3 py-3">
                <input
                  type="radio"
                  name="tipo"
                  value="DEBITO"
                  checked={tipo === 'DEBITO'}
                  onChange={(e) => setTipo(e.target.value)}
                  className="h-4 w-4 border-gray-600 text-orange-500"
                />
                <span className="text-sm">Saída (Débito)</span>
              </label>
              <label className="flex items-center gap-3 rounded-xl border border-gray-700 bg-gray-750 px-3 py-3">
                <input
                  type="radio"
                  name="tipo"
                  value="CREDITO"
                  checked={tipo === 'CREDITO'}
                  onChange={(e) => setTipo(e.target.value)}
                  className="h-4 w-4 border-gray-600 text-orange-500"
                />
                <span className="text-sm">Entrada (Crédito)</span>
              </label>
              <label className="flex items-center gap-3 rounded-xl border border-gray-700 bg-gray-750 px-3 py-3">
                <input
                  type="radio"
                  name="tipo"
                  value="TRANSFERENCIA"
                  checked={tipo === 'TRANSFERENCIA'}
                  onChange={(e) => setTipo(e.target.value)}
                  className="h-4 w-4 border-gray-600 text-orange-500"
                />
                <span className="text-sm">Transferência</span>
              </label>
              <label className="flex items-center gap-3 rounded-xl border border-orange-500/40 bg-orange-500/10 px-3 py-3">
                <input
                  type="radio"
                  name="tipo"
                  value="PIX"
                  checked={tipo === 'PIX'}
                  onChange={(e) => setTipo(e.target.value)}
                  className="h-4 w-4 border-gray-600 text-orange-500"
                />
                <span className="text-sm font-bold text-orange-300">Pagamento (PIX)</span>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="data" className="block text-sm font-medium text-gray-300">Data</label>
              <input
                type="date"
                id="data"
                value={data}
                onChange={(e) => setData(e.target.value)}
                required
                className="mt-1 block w-full rounded-md border border-gray-600 bg-gray-700 p-3 shadow-sm"
                disabled={tipo === 'PIX'}
              />
            </div>
            <div>
              <label htmlFor="valor" className="block text-sm font-medium text-gray-300">Valor</label>
              <input
                type="text"
                id="valor"
                value={valor}
                onChange={(e) => setValor(formatBRLInput(e.target.value))}
                required
                placeholder="R$ 0,00"
                className="mt-1 block w-full rounded-md border border-gray-600 bg-gray-700 p-3 shadow-sm"
              />
            </div>
          </div>

          <div>
            <label htmlFor="descricao" className="block text-sm font-medium text-gray-300">Descrição</label>
            <input
              type="text"
              id="descricao"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              required
              className="mt-1 block w-full rounded-md border border-gray-600 bg-gray-700 p-3 shadow-sm"
            />
          </div>

          {(tipo === 'DEBITO' || tipo === 'CREDITO') && (
            <div>
              <label htmlFor="contaOrigem" className="block text-sm font-medium text-gray-300">Conta</label>
              <select
                id="contaOrigem"
                name="contaOrigem"
                value={contaOrigem}
                onChange={(e) => setContaOrigem(e.target.value)}
                required
                className="mt-1 block w-full rounded-md border border-gray-600 bg-gray-700 p-3 shadow-sm"
              >
                <option value="">Selecione...</option>
                {Array.isArray(contasMaster) &&
                  contasMaster.map((c) => (
                    <option key={c.contaBancaria} value={c.contaBancaria}>
                      {formatDisplayConta(c.contaBancaria)}
                    </option>
                  ))}
              </select>
            </div>
          )}

          {tipo === 'TRANSFERENCIA' && (
            <div className="space-y-4 border-t border-gray-700 pt-4">
              <div>
                <label htmlFor="contaOrigemTransferencia" className="block text-sm font-medium text-gray-300">Conta de Origem</label>
                <select
                  id="contaOrigemTransferencia"
                  name="contaOrigem"
                  value={contaOrigem}
                  onChange={(e) => setContaOrigem(e.target.value)}
                  required
                  className="mt-1 block w-full rounded-md border border-gray-600 bg-gray-700 p-3 shadow-sm"
                >
                  <option value="">Selecione...</option>
                  {Array.isArray(contasMaster) &&
                    contasMaster.map((c) => (
                      <option key={c.contaBancaria + '-origem'} value={c.contaBancaria}>
                        {formatDisplayConta(c.contaBancaria)}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label htmlFor="contaDestino" className="block text-sm font-medium text-gray-300">Conta de Destino</label>
                <select
                  id="contaDestino"
                  name="contaDestino"
                  value={contaDestino}
                  onChange={(e) => setContaDestino(e.target.value)}
                  required
                  className="mt-1 block w-full rounded-md border border-gray-600 bg-gray-700 p-3 shadow-sm"
                >
                  <option value="">Selecione...</option>
                  {Array.isArray(contasMaster) &&
                    contasMaster.map((c) => (
                      <option key={c.contaBancaria + '-destino'} value={c.contaBancaria}>
                        {formatDisplayConta(c.contaBancaria)}
                      </option>
                    ))}
                </select>
              </div>
            </div>
          )}

          {tipo === 'PIX' && (
            <div className="space-y-4 border-t border-orange-500/50 pt-4">
              <div>
                <label htmlFor="contaOrigemPix" className="block text-sm font-medium text-gray-300">Selecione a conta</label>
                <select
                  id="contaOrigemPix"
                  name="contaOrigem"
                  value={contaOrigem}
                  onChange={(e) => setContaOrigem(e.target.value)}
                  required
                  className="mt-1 block w-full rounded-md border border-gray-600 bg-gray-700 p-3 shadow-sm"
                >
                  <option value="">Selecione uma conta</option>
                  {contasPix.map((c) => (
                    <option key={c.id} value={c.contaCorrente}>
                      {formatDisplayConta(c.contaBancaria)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-300">Tipo da Chave</label>
                  <select
                    value={pixData.tipo_chave_pix}
                    onChange={(e) => setPixData((p) => ({ ...p, tipo_chave_pix: e.target.value }))}
                    className="mt-1 block w-full rounded-md border border-gray-600 bg-gray-700 p-3"
                  >
                    <option value="CPF/CNPJ">CPF/CNPJ</option>
                    <option value="Email">Email</option>
                    <option value="Telefone">Telefone</option>
                    <option value="Aleatória">Aleatória</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300">Chave PIX</label>
                  <input
                    type="text"
                    value={pixData.chave}
                    onChange={(e) => setPixData((p) => ({ ...p, chave: e.target.value }))}
                    required
                    className="mt-1 block w-full rounded-md border border-gray-600 bg-gray-700 p-3"
                  />
                </div>
              </div>
            </div>
          )}

          {(tipo === 'DEBITO' || tipo === 'PIX') && (
            <div className="mt-2 border-t border-gray-700 pt-4">
              <label className="mb-1 block text-sm font-medium text-orange-400">Natureza (Classificação DRE)</label>
              <select
                value={natureza}
                onChange={(e) => setNatureza(e.target.value)}
                className="w-full rounded-md border border-gray-600 bg-gray-700 p-3 text-white"
              >
                <option value="Despesas Administrativas">Despesas Administrativas (Salários, Aluguel, etc)</option>
                <option value="Despesas Financeiras">Despesas Financeiras (Tarifas, Juros, PIX)</option>
                <option value="Despesas Tributárias">Despesas Tributárias (Impostos)</option>
                <option value="Serviços de Terceiros (FIDC)">Serviços de Terceiros (Consultoria, Serasa)</option>
                <option value="Aquisição de Direitos Creditórios">Aquisição de Direitos Creditórios (Compra de Carteira)</option>
                <option value="Distribuição de Lucros / Amortização">Distribuição de Lucros / Amortização</option>
                <option value="Transferência Entre Contas">Transferência Entre Contas</option>
                <option value="Empréstimos / Mútuos">Empréstimos / Mútuos</option>
                <option value="Outras Despesas">Outras Despesas</option>
              </select>
            </div>
          )}

          {error && <p className="mt-2 text-center text-sm text-red-400">{error}</p>}

          <div className="sticky bottom-0 flex gap-3 border-t border-gray-700 bg-gray-800 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-md bg-gray-600 px-4 py-3 font-semibold text-gray-100 transition hover:bg-gray-500"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex-1 rounded-md bg-orange-500 px-4 py-3 font-semibold text-white transition hover:bg-orange-600 disabled:bg-orange-400"
            >
              {isSaving ? 'Processando...' : (tipo === 'PIX' ? 'Avançar para Confirmação' : 'Salvar Lançamento')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
