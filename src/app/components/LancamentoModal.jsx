'use client';

import { useState, useEffect } from 'react';
// IMPORTA A NOVA FUNÇÃO DE FORMATAÇÃO
import { formatBRLInput, parseBRL, formatDisplayConta } from '@/app/utils/formatters';
// REMOVIDO: Imports dos modais de PIX que foram movidos para a página

export default function LancamentoModal({ 
    isOpen, 
    onClose, 
    onSave, 
    onPixSubmit, // <-- NOVA PROP
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
    const [isDespesa, setIsDespesa] = useState(true);
    const [pixData, setPixData] = useState({ tipo_chave_pix: 'CPF/CNPJ', chave: '' });

    // REMOVIDO: States dos modais de PIX (agora são gerenciados pela página)
    // const [isPixConfirmOpen, setIsPixConfirmOpen] = useState(false);
    // const [pixPayload, setPixPayload] = useState(null);
    // const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
    // const [receiptData, setReceiptData] = useState(null);

    const contasPix = Array.isArray(contasMaster) ? contasMaster.filter(
        c => c.banco.toLowerCase().includes('inter') || c.banco.toLowerCase().includes('itaú')
    ) : [];

    useEffect(() => {
        if (isOpen) {
            handleLimpar();
        }
    }, [isOpen]);

    // ATUALIZA A FUNÇÃO DE LIMPAR
    const handleLimpar = () => {
        setTipo('DEBITO');
        setData(new Date().toISOString().split('T')[0]);
        setDescricao('');
        setValor('');
        setContaOrigem('');
        setContaDestino('');
        setError('');
        setIsDespesa(true);
        setPixData({ tipo_chave_pix: 'CPF/CNPJ', chave: '' });
        // REMOVIDO: Resets dos states que foram movidos
    };

    if (!isOpen) return null;

    // REMOVIDO: handleConfirmAndSendPix (movido para a página)

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (tipo === 'TRANSFERENCIA' && contaOrigem === contaDestino) {
            setError('A conta de origem e destino não podem ser as mesmas.');
            return;
        }

        // --- Lógica de formatação de conta (permanece a mesma) ---
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
        // --- Fim da lógica de formatação ---


        if (tipo === 'PIX') {
            // --- CORREÇÃO AQUI ---
            // Em vez de abrir o modal, chama a nova prop 'onPixSubmit'
            // e passa o payload para a página pai gerenciar.
            const payload = {
                valor: parseBRL(valor),
                descricao: descricao,
                contaOrigem: contaOrigem, // Envia o número da conta sem formatação/banco
                empresaAssociada: clienteMasterNome,
                pix: {
                    tipo: pixData.tipo_chave_pix,
                    chave: pixData.chave
                },
                chavePix: pixData.chave,
                tipoChave: pixData.tipo_chave_pix
            };

            onPixSubmit(payload); // Chama a função da página pai
            return;
            // --- FIM DA CORREÇÃO ---
        }

        setIsSaving(true);
        // Payload para lançamentos normais (Débito, Crédito, Transferência)
        const payload = {
            tipo,
            data,
            descricao,
            valor: parseBRL(valor),
            contaOrigem: contaOrigemParaSalvar, 
            empresaAssociada: clienteMasterNome,
            contaDestino: tipo === 'TRANSFERENCIA' ? contaDestinoParaSalvar : null, 
            empresaDestino: tipo === 'TRANSFERENCIA' ? clienteMasterNome : null,
            isDespesa: tipo === 'DEBITO' ? isDespesa : null,
        };

        const success = await onSave(payload);
        if (success) {
            onClose();
        } else {
            setError('Falha ao salvar o lançamento. Verifique os dados e tente novamente.');
        }
        setIsSaving(false);
    };

    return (
         // REMOVIDO: O <React.Fragment> e os modais de PIX
         // O 'onClick' do backdrop agora é apenas 'onClose'
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50" onClick={onClose}>
            <div className="bg-gray-800 text-white p-6 rounded-lg shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
                <h2 className="text-xl font-bold mb-6">Novo Lançamento Manual</h2>
                
                {/* O formulário permanece o mesmo */}
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
                                    <option key={c.contaBancaria} value={c.contaBancaria}>
                                        {formatDisplayConta(c.contaBancaria)}
                                    </option>
                                )}
                           </select>
                        </div>
                    )}

                    {tipo === 'TRANSFERENCIA' && (
                        <div className="space-y-4 border-t border-gray-700 pt-4">
                             <div>
                                <label htmlFor="contaOrigem" className="block text-sm font-medium text-gray-300">Conta de Origem</label>
                                <select id="contaOrigem" name="contaOrigem" value={contaOrigem} onChange={e => setContaOrigem(e.target.value)} required className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm p-2">
                                    <option value="">Selecione...</option>
                                    {Array.isArray(contasMaster) && contasMaster.map(c =>
                                        <option key={c.contaBancaria + '-origem'} value={c.contaBancaria}>
                                            {formatDisplayConta(c.contaBancaria)}
                                        </option>
                                    )}
                                </select>
                             </div>
                             <div>
                                <label htmlFor="contaDestino" className="block text-sm font-medium text-gray-300">Conta de Destino</label>
                                <select id="contaDestino" name="contaDestino" value={contaDestino} onChange={e => setContaDestino(e.target.value)} required className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm p-2">
                                    <option value="">Selecione...</option>
                                    {Array.isArray(contasMaster) && contasMaster.map(c =>
                                        <option key={c.contaBancaria + '-destino'} value={c.contaBancaria}>
                                            {formatDisplayConta(c.contaBancaria)}
                                        </option>
                                    )}
                                </select>
                            </div>
                        </div>
                    )}

                    {tipo === 'PIX' && (
                        <div className="space-y-4 border-t border-orange-500/50 pt-4">
                             <div>
                                <label htmlFor="contaOrigem" className="block text-sm font-medium text-gray-300">Selecione a conta</label>
                                <select id="contaOrigem" name="contaOrigem" value={contaOrigem} onChange={e => setContaOrigem(e.target.value)} required className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm p-2">
                                    <option value="">Selecione uma conta</option>
                                    {contasPix.map(c =>
                                        <option key={c.id} value={c.contaCorrente}>
                                            {formatDisplayConta(c.contaBancaria)}
                                        </option>
                                    )}
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

                     {tipo === 'DEBITO' && (
                        <div className="pt-2">
                            <label className="flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={isDespesa}
                                    onChange={(e) => setIsDespesa(e.target.checked)}
                                    className="h-4 w-4 rounded text-orange-500 bg-gray-600 border-gray-500 focus:ring-orange-500"
                                />
                                <span className="ml-2 text-sm text-gray-200">É uma despesa? (Contabilizar no resumo)</span>
                            </label>
                        </div>
                     )}
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