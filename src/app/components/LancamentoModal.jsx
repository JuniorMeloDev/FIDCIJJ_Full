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

    const contasPix = Array.isArray(contasMaster) ? contasMaster.filter(
        c => c.banco.toLowerCase().includes('inter') || c.banco.toLowerCase().includes('itaú')
    ) : [];

    useEffect(() => {
        if (isOpen) {
            handleLimpar();
        }
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

        // ... (Lógica de formatação de conta Itau permanece igual) ...
        const contaNoDb = process.env.NEXT_PUBLIC_ITAU_CONTA_DB;
        const contaDisplay = process.env.NEXT_PUBLIC_ITAU_CONTA_DISPLAY;
        let contaOrigemParaSalvar = contaOrigem;
        let contaDestinoParaSalvar = contaDestino;
        
        if ((tipo === 'DEBITO' || tipo === 'CREDITO') && contaNoDb && contaDisplay && contaOrigem.endsWith(contaNoDb)) {
            contaOrigemParaSalvar = contasMaster.find(c => c.contaBancaria.endsWith(contaNoDb))?.contaBancaria.replace(contaNoDb, contaDisplay) || contaOrigem;
        }
        else if (tipo === 'TRANSFERENCIA' && contaNoDb && contaDisplay) {
            if (contaOrigem.endsWith(contaNoDb)) {
               contaOrigemParaSalvar = contasMaster.find(c => c.contaBancaria.endsWith(contaNoDb))?.contaBancaria.replace(contaNoDb, contaDisplay) || contaOrigem;
            }
            if (contaDestino.endsWith(contaNoDb)) {
                contaDestinoParaSalvar = contasMaster.find(c => c.contaBancaria.endsWith(contaNoDb))?.contaBancaria.replace(contaNoDb, contaDisplay) || contaDestino;
            }
        }

        if (tipo === 'PIX') {
            const payload = {
                valor: parseBRL(valor),
                descricao: descricao,
                contaOrigem: contaOrigem, 
                empresaAssociada: clienteMasterNome,
                pix: { tipo: pixData.tipo_chave_pix, chave: pixData.chave },
                chavePix: pixData.chave,
                tipoChave: pixData.tipo_chave_pix,
                natureza: natureza
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
            // ALTERAÇÃO: Removemos isDespesa. A categoria agora é fixa para saídas manuais.
            isDespesa: false, 
            natureza: (tipo === 'DEBITO') ? natureza : null
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
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50" onClick={onClose}>
            <div className="bg-gray-800 text-white p-6 rounded-lg shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
                <h2 className="text-xl font-bold mb-6">Novo Lançamento Manual</h2>
                
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">Tipo de Lançamento</label>
                        <div className="flex flex-wrap gap-4">
                            <label className="flex items-center"><input type="radio" name="tipo" value="DEBITO" checked={tipo === 'DEBITO'} onChange={(e) => setTipo(e.target.value)} className="h-4 w-4 text-orange-500 border-gray-600"/> <span className="ml-2 text-sm">Saída (Débito)</span></label>
                            <label className="flex items-center"><input type="radio" name="tipo" value="CREDITO" checked={tipo === 'CREDITO'} onChange={(e) => setTipo(e.target.value)} className="h-4 w-4 text-orange-500 border-gray-600"/> <span className="ml-2 text-sm">Entrada (Crédito)</span></label>
                            <label className="flex items-center"><input type="radio" name="tipo" value="TRANSFERENCIA" checked={tipo === 'TRANSFERENCIA'} onChange={(e) => setTipo(e.target.value)} className="h-4 w-4 text-orange-500 border-gray-600"/> <span className="ml-2 text-sm">Transferência</span></label>
                            <label className="flex items-center"><input type="radio" name="tipo" value="PIX" checked={tipo === 'PIX'} onChange={(e) => setTipo(e.target.value)} className="h-4 w-4 text-orange-500 border-gray-600"/> <span className="ml-2 text-sm font-bold text-orange-300">Pagamento (PIX)</span></label>
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="data" className="block text-sm font-medium text-gray-300">Data</label>
                            <input type="date" id="data" value={data} onChange={e => setData(e.target.value)} required className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm p-2" disabled={tipo === 'PIX'}/>
                        </div>
                        <div>
                            <label htmlFor="valor" className="block text-sm font-medium text-gray-300">Valor</label>
                            <input type="text" id="valor" value={valor} onChange={e => setValor(formatBRLInput(e.target.value))} required placeholder="R$ 0,00" className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm p-2"/>
                        </div>
                    </div>
                    
                    <div>
                        <label htmlFor="descricao" className="block text-sm font-medium text-gray-300">Descrição</label>
                        <input type="text" id="descricao" value={descricao} onChange={e => setDescricao(e.target.value)} required className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm p-2"/>
                    </div>

                    { (tipo === 'DEBITO' || tipo === 'CREDITO') && (
                         <div>
                           <label htmlFor="contaOrigem" className="block text-sm font-medium text-gray-300">Conta</label>
                           <select id="contaOrigem" name="contaOrigem" value={contaOrigem} onChange={e => setContaOrigem(e.target.value)} required className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm p-2">
                                <option value="">Selecione...</option>
                                {Array.isArray(contasMaster) && contasMaster.map(c =>
                                    <option key={c.contaBancaria} value={c.contaBancaria}>{formatDisplayConta(c.contaBancaria)}</option>
                                )}
                           </select>
                        </div>
                    )}

                    {tipo === 'TRANSFERENCIA' && (
                        <div className="space-y-4 border-t border-gray-700 pt-4">
                             {/* ... Campos de transferencia mantidos ... */}
                             <div>
                                <label htmlFor="contaOrigem" className="block text-sm font-medium text-gray-300">Conta de Origem</label>
                                <select id="contaOrigem" name="contaOrigem" value={contaOrigem} onChange={e => setContaOrigem(e.target.value)} required className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm p-2">
                                    <option value="">Selecione...</option>
                                    {Array.isArray(contasMaster) && contasMaster.map(c => <option key={c.contaBancaria + '-origem'} value={c.contaBancaria}>{formatDisplayConta(c.contaBancaria)}</option>)}
                                </select>
                             </div>
                             <div>
                                <label htmlFor="contaDestino" className="block text-sm font-medium text-gray-300">Conta de Destino</label>
                                <select id="contaDestino" name="contaDestino" value={contaDestino} onChange={e => setContaDestino(e.target.value)} required className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm p-2">
                                    <option value="">Selecione...</option>
                                    {Array.isArray(contasMaster) && contasMaster.map(c => <option key={c.contaBancaria + '-destino'} value={c.contaBancaria}>{formatDisplayConta(c.contaBancaria)}</option>)}
                                </select>
                            </div>
                        </div>
                    )}

                    {tipo === 'PIX' && (
                        <div className="space-y-4 border-t border-orange-500/50 pt-4">
                             {/* ... Campos PIX mantidos ... */}
                             <div>
                                <label htmlFor="contaOrigem" className="block text-sm font-medium text-gray-300">Selecione a conta</label>
                                <select id="contaOrigem" name="contaOrigem" value={contaOrigem} onChange={e => setContaOrigem(e.target.value)} required className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm p-2">
                                    <option value="">Selecione uma conta</option>
                                    {contasPix.map(c => <option key={c.id} value={c.contaCorrente}>{formatDisplayConta(c.contaBancaria)}</option>)}
                                </select>
                             </div>
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-300">Tipo da Chave</label>
                                    <select value={pixData.tipo_chave_pix} onChange={e => setPixData(p => ({...p, tipo_chave_pix: e.target.value}))} className="mt-1 block w-full bg-gray-700 p-2 rounded">
                                        <option value="CPF/CNPJ">CPF/CNPJ</option>
                                        <option value="Email">Email</option>
                                        <option value="Telefone">Telefone</option>
                                        <option value="Aleatória">Aleatória</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-300">Chave PIX</label>
                                    <input type="text" value={pixData.chave} onChange={e => setPixData(p => ({...p, chave: e.target.value}))} required className="mt-1 block w-full bg-gray-700 p-2 rounded"/>
                                </div>
                             </div>
                        </div>
                    )}

                    {/* SELEÇÃO DE NATUREZA */}
                    { (tipo === 'DEBITO' || tipo === 'PIX') && (
                        <div className="pt-2 mt-2 border-t border-gray-700">
                            <label className="block text-sm font-medium text-orange-400 mb-1">Natureza (Classificação DRE)</label>
                            <select 
                                value={natureza} 
                                onChange={(e) => setNatureza(e.target.value)}
                                className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-white"
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

                    {/* CHECKBOX "É UMA DESPESA" REMOVIDO AQUI */}

                    {error && <p className="text-sm text-red-400 mt-2 text-center">{error}</p>}
                    
                    <div className="flex justify-end gap-3 pt-4 border-t border-gray-700">
                        <button type="button" onClick={onClose} className="bg-gray-600 text-gray-100 font-semibold py-2 px-4 rounded-md hover:bg-gray-500 transition">Cancelar</button>
                        <button type="submit" disabled={isSaving} className="bg-orange-500 text-white font-semibold py-2 px-4 rounded-md hover:bg-orange-600 transition disabled:bg-orange-400">
                            {isSaving ? 'Processando...' : (tipo === 'PIX' ? 'Avançar para Confirmação' : 'Salvar Lançamento')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}