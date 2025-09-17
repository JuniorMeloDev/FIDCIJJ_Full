'use client';

import { useState, useEffect } from 'react';
import { formatCnpjCpf, formatTelefone, formatCep } from '@/app/utils/formatters';

const TabButton = ({ label, isActive, onClick }) => (
    <button type="button" onClick={onClick} className={`px-4 py-2 text-sm font-medium whitespace-nowrap ${isActive ? "border-orange-500 text-orange-400 border-b-2" : "border-transparent text-gray-400 hover:text-gray-200"}`}>
        {label}
    </button>
);

// Componente para a aba Filiais
const FilialManager = ({ matriz, onSave, onEditFilial }) => {
    const initialState = { id: null, cnpj: '', nome: '', ie: '', fone: '', cep: '', endereco: '', bairro: '', municipio: '', uf: '' };
    const [filialData, setFilialData] = useState(initialState);
    const [status, setStatus] = useState('idle'); // idle, loading, found, notFound, error
    const [message, setMessage] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const getAuthHeader = () => ({ 'Authorization': `Bearer ${sessionStorage.getItem('authToken')}` });

    const handleCnpjBlur = async (e) => {
        const cleanCnpj = e.target.value.replace(/\D/g, '');
        if (cleanCnpj.length !== 14) return;

        setStatus('loading');
        setMessage('Buscando CNPJ...');
        
        try {
            const internalRes = await fetch(`/api/cadastros/sacados/by-cnpj/${cleanCnpj}`, { headers: getAuthHeader() });
            if (internalRes.ok) {
                const data = await internalRes.json();
                if (data.matriz_id) {
                    setStatus('error');
                    setMessage(`Este CNPJ já é uma filial da matriz #${data.matriz_id}.`);
                    return;
                }
                console.log("LOG: Filial encontrada no banco de dados.", data);
                setFilialData({ 
                    ...data, 
                    cnpj: formatCnpjCpf(data.cnpj), 
                    fone: formatTelefone(data.fone), 
                    cep: formatCep(data.cep) 
                });
                setStatus('found');
                setMessage('Sacado encontrado no sistema. Os dados foram preenchidos.');
                return;
            }

            if (internalRes.status === 404) {
                const externalRes = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleanCnpj}`);
                if (!externalRes.ok) throw new Error('CNPJ não encontrado em nenhuma base de dados.');
                const data = await externalRes.json();
                console.log("LOG: Filial encontrada na API externa.", data);
                setFilialData({
                    id: null,
                    nome: data.razao_social || '',
                    cnpj: formatCnpjCpf(cleanCnpj),
                    fone: data.ddd_telefone_1 ? formatTelefone(`${data.ddd_telefone_1}${data.telefone_1 || ''}`) : '',
                    cep: data.cep ? formatCep(data.cep) : '',
                    endereco: `${data.logradouro || ''}, ${data.numero || ''}`,
                    bairro: data.bairro || '',
                    municipio: data.municipio || '',
                    uf: data.uf || '',
                    ie: '',
                });
                setStatus('notFound');
                setMessage('CNPJ novo. Os dados foram preenchidos pela API externa.');
            }
        } catch (err) {
            setStatus('error');
            setMessage(err.message);
            console.error("LOG: Erro na busca de CNPJ da filial:", err);
        }
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        let formattedValue = value;
        if (name === 'fone') formattedValue = formatTelefone(value);
        if (name === 'cep') formattedValue = formatCep(value);
        if (name === 'cnpj') formattedValue = formatCnpjCpf(value);
        setFilialData(prev => ({ ...prev, [name]: formattedValue }));
    };

    const handleSaveClick = async () => {
        setIsSaving(true);
        const isUpdating = status === 'found';
        const filialIdToSave = isUpdating ? filialData.id : null;
        const dataToSave = { ...filialData, matriz_id: matriz.id };

        const result = await onSave(filialIdToSave, dataToSave);
        if (result.success) {
            setFilialData(initialState);
            setStatus('idle');
            setMessage('Filial salva/vinculada com sucesso!');
        } else {
            setMessage(result.message || 'Ocorreu um erro.');
            setStatus('error');
        }
        setIsSaving(false);
    };
    
    // CORREÇÃO DO ERRO 'map': Garante que matriz.filiais seja um array
    const filiaisCadastradas = Array.isArray(matriz?.filiais) ? matriz.filiais : [];
    console.log("LOG (FilialManager): Renderizando com filiais:", filiaisCadastradas);

    return (
        <div>
            <h3 className="text-md font-semibold text-gray-100 mb-2">Filiais Cadastradas</h3>
            {filiaisCadastradas.length > 0 ? (
                <div className="overflow-x-auto border border-gray-700 rounded-md mb-6">
                    <table className="min-w-full divide-y divide-gray-600 text-sm">
                        <tbody className="divide-y divide-gray-600">
                            {filiaisCadastradas.map(filial => (
                                <tr key={filial.id} onClick={() => onEditFilial(filial)} className="hover:bg-gray-700 cursor-pointer">
                                    <td className="px-4 py-2">{formatCnpjCpf(filial.cnpj)}</td>
                                    <td className="px-4 py-2">{filial.municipio} - {filial.uf}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : <p className="text-sm text-gray-400 italic mb-6">Nenhuma filial cadastrada.</p>}
            
            <div className="p-4 border border-gray-700 rounded-lg bg-gray-900/50 space-y-4">
                <h4 className="text-md font-semibold text-gray-200">Gerenciar Filial</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-3">
                        <label className="block text-xs font-bold text-gray-300">CNPJ da Filial</label>
                        <input type="text" name="cnpj" value={filialData.cnpj} onChange={handleChange} onBlur={handleCnpjBlur} placeholder="Digite o CNPJ e saia do campo para buscar" className="mt-1 block w-full bg-gray-700 p-1.5 text-sm"/>
                        {message && <p className={`text-xs mt-1 ${status === 'error' ? 'text-red-400' : 'text-green-400'}`}>{message}</p>}
                    </div>
                </div>
                {status === 'found' || status === 'notFound' ? (
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="md:col-span-3"><label className="block text-xs font-bold text-gray-300">Nome (Razão Social)</label><input type="text" name="nome" value={filialData.nome || ''} onChange={handleChange} className="mt-1 block w-full bg-gray-700 p-1.5 text-sm"/></div>
                            <div><label className="block text-xs font-bold text-gray-300">Inscrição Estadual</label><input type="text" name="ie" value={filialData.ie || ''} onChange={handleChange} className="mt-1 block w-full bg-gray-700 p-1.5 text-sm"/></div>
                            <div><label className="block text-xs font-bold text-gray-300">Telefone</label><input type="text" name="fone" value={filialData.fone || ''} onChange={handleChange} className="mt-1 block w-full bg-gray-700 p-1.5 text-sm"/></div>
                            <div><label className="block text-xs font-bold text-gray-300">CEP</label><input type="text" name="cep" value={filialData.cep || ''} onChange={handleChange} className="mt-1 block w-full bg-gray-700 p-1.5 text-sm"/></div>
                            <div className="md:col-span-2"><label className="block text-xs font-bold text-gray-300">Endereço</label><input type="text" name="endereco" value={filialData.endereco || ''} onChange={handleChange} className="mt-1 block w-full bg-gray-700 p-1.5 text-sm"/></div>
                            <div><label className="block text-xs font-bold text-gray-300">Bairro</label><input type="text" name="bairro" value={filialData.bairro || ''} onChange={handleChange} className="mt-1 block w-full bg-gray-700 p-1.5 text-sm"/></div>
                            <div className="md:col-span-1"><label className="block text-xs font-bold text-gray-300">Município</label><input type="text" name="municipio" value={filialData.municipio || ''} onChange={handleChange} className="mt-1 block w-full bg-gray-700 p-1.5 text-sm"/></div>
                            <div><label className="block text-xs font-bold text-gray-300">UF</label><input type="text" name="uf" value={filialData.uf || ''} onChange={handleChange} className="mt-1 block w-full bg-gray-700 p-1.5 text-sm"/></div>
                        </div>
                        <button onClick={handleSaveClick} disabled={isSaving} className="bg-orange-600 hover:bg-orange-700 text-white font-semibold py-2 px-4 rounded-md text-sm disabled:opacity-50">
                           {isSaving ? 'Salvando...' : (status === 'found' ? 'Vincular Filial' : 'Salvar Nova Filial')}
                        </button>
                    </div>
                ) : null}
            </div>
        </div>
    );
};


export default function EditSacadoModal({ isOpen, onClose, sacado, onSave, onDelete, onEditFilial }) {
    const initialState = {
        nome: '', cnpj: '', ie: '', cep: '', endereco: '', bairro: '', 
        municipio: '', uf: '', fone: '', condicoesPagamento: [],
        matriz_id: null
    };
    const [formData, setFormData] = useState(initialState);
    const [isSaving, setIsSaving] = useState(false);
    const [modalError, setModalError] = useState('');
    const [activeTab, setActiveTab] = useState('dadosCadastrais');

    useEffect(() => {
        console.log("LOG (Modal): Modal aberto/atualizado. Prop 'sacado' recebida:", sacado);
        if (isOpen) {
            setModalError('');
            setActiveTab('dadosCadastrais');
            if (sacado) {
                setFormData({
                    ...initialState, ...sacado,
                    cnpj: sacado.cnpj ? formatCnpjCpf(sacado.cnpj) : '',
                    fone: sacado.fone ? formatTelefone(sacado.fone) : '',
                    cep: sacado.cep ? formatCep(sacado.cep) : '',
                    condicoesPagamento: sacado.condicoes_pagamento || sacado.condicoesPagamento || []
                });
            } else {
                setFormData(initialState);
            }
        }
    }, [sacado, isOpen]);

    if (!isOpen) return null;
    
    const handleChange = (e) => {
        setModalError('');
        const { name, value } = e.target;
        let formattedValue = value;
        if (name === 'cnpj') formattedValue = formatCnpjCpf(value);
        if (name === 'fone') formattedValue = formatTelefone(value);
        if (name === 'cep') formattedValue = formatCep(value);
        setFormData(prev => ({ ...prev, [name]: formattedValue }));
    };

    const handleCondicaoChange = (index, e) => {
        const { name, value } = e.target;
        const condicoes = [...formData.condicoesPagamento];
        if (condicoes[index]) {
            condicoes[index][name] = value;
            setFormData(prev => ({ ...prev, condicoesPagamento: condicoes }));
        }
    };
    
    const addCondicao = () => setFormData(prev => ({ ...prev, condicoesPagamento: [...(prev.condicoesPagamento || []), { parcelas: '1', prazos: '' }] }));
    const removeCondicao = (index) => {
        const condicoes = [...formData.condicoesPagamento];
        condicoes.splice(index, 1);
        setFormData(prev => ({ ...prev, condicoesPagamento: condicoes }));
    };

    const handleSave = async () => {
        setModalError('');
        setIsSaving(true);
        const dataToSave = { 
            ...formData, 
            cnpj: formData.cnpj.replace(/\D/g, ''), 
            fone: formData.fone?.replace(/\D/g, ''), 
            cep: formData.cep?.replace(/\D/g, ''),
            condicoesPagamento: formData.condicoesPagamento.map(c => ({ ...c, parcelas: parseInt(c.parcelas, 10) || 1 })),
        }; 
        const result = await onSave(sacado?.id, dataToSave);
        setIsSaving(false);
        if (!result.success) setModalError(result.message);
    };

    const isEditMode = !!sacado?.id;
    const isMatriz = isEditMode && !formData.matriz_id;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4">
            <div className="bg-gray-800 text-white p-6 rounded-lg shadow-xl w-full max-w-4xl max-h-[95vh] flex flex-col">
                <h2 className="text-xl font-bold mb-4 flex-shrink-0">{isEditMode ? 'Editar Sacado' : 'Adicionar Novo Sacado'}</h2>
                
                <div className="border-b border-gray-700 flex-shrink-0">
                    <nav className="-mb-px flex space-x-6" aria-label="Tabs">
                        <TabButton label="Dados Cadastrais" isActive={activeTab === 'dadosCadastrais'} onClick={() => setActiveTab('dadosCadastrais')} />
                        <TabButton label="Condições Pag." isActive={activeTab === 'condicoes'} onClick={() => setActiveTab('condicoes')} />
                        {isMatriz && (
                            <TabButton label="Filiais" isActive={activeTab === 'filiais'} onClick={() => setActiveTab('filiais')} />
                        )}
                    </nav>
                </div>

                <div className="flex-grow overflow-y-auto py-4 pr-2">
                    {activeTab === 'dadosCadastrais' && (
                        <div className="space-y-3">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-300">CNPJ</label>
                                    <input type="text" name="cnpj" value={formData.cnpj} onChange={handleChange} className="mt-1 block w-full bg-gray-700 p-1.5 text-sm"/>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-300">Nome do Sacado</label>
                                    <input type="text" name="nome" value={formData.nome || ''} onChange={e => setFormData(prev => ({...prev, nome: e.target.value}))} className="mt-1 block w-full bg-gray-700 p-1.5 text-sm"/>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div><label className="block text-xs font-bold text-gray-300">Inscrição Estadual</label><input type="text" name="ie" value={formData.ie || ''} onChange={e => setFormData(prev => ({...prev, ie: e.target.value}))} className="mt-1 block w-full bg-gray-700 p-1.5 text-sm"/></div>
                                <div><label className="block text-xs font-bold text-gray-300">Telefone</label><input type="text" name="fone" value={formData.fone || ''} onChange={handleChange} className="mt-1 block w-full bg-gray-700 p-1.5 text-sm"/></div>
                                <div><label className="block text-xs font-bold text-gray-300">CEP</label><input type="text" name="cep" value={formData.cep || ''} onChange={handleChange} className="mt-1 block w-full bg-gray-700 p-1.5 text-sm"/></div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="md:col-span-2"><label className="block text-xs font-bold text-gray-300">Endereço</label><input type="text" name="endereco" value={formData.endereco || ''} onChange={e => setFormData(prev => ({...prev, endereco: e.target.value}))} className="mt-1 block w-full bg-gray-700 p-1.5 text-sm"/></div>
                                <div><label className="block text-xs font-bold text-gray-300">Bairro</label><input type="text" name="bairro" value={formData.bairro || ''} onChange={e => setFormData(prev => ({...prev, bairro: e.target.value}))} className="mt-1 block w-full bg-gray-700 p-1.5 text-sm"/></div>
                                <div className="md:col-span-2"><label className="block text-xs font-bold text-gray-300">Município</label><input type="text" name="municipio" value={formData.municipio || ''} onChange={e => setFormData(prev => ({...prev, municipio: e.target.value}))} className="mt-1 block w-full bg-gray-700 p-1.5 text-sm"/></div>
                                <div><label className="block text-xs font-bold text-gray-300">UF</label><input type="text" name="uf" value={formData.uf || ''} onChange={e => setFormData(prev => ({...prev, uf: e.target.value}))} className="mt-1 block w-full bg-gray-700 p-1.5 text-sm"/></div>
                            </div>
                        </div>
                    )}
                    {activeTab === 'condicoes' && (
                        <div>
                            <div className="flex justify-between items-center mb-2">
                                <h3 className="text-md font-semibold text-gray-100">Condições de Pagamento Padrão</h3>
                                <button type="button" onClick={addCondicao} className="text-sm font-medium text-orange-400 hover:text-orange-500 transition">+ Adicionar</button>
                            </div>
                            <div className="space-y-2 max-h-48 overflow-y-auto pr-2 border border-gray-700 rounded-md p-2">
                                {formData.condicoesPagamento?.length > 0 ? formData.condicoesPagamento.map((cond, index) => (
                                    <div key={index} className="grid grid-cols-3 gap-2 items-center">
                                        <input type="number" name="parcelas" placeholder="1" min="1" value={cond.parcelas || ''} onChange={e => handleCondicaoChange(index, e)} className="bg-gray-700 p-1.5 text-sm text-center" />
                                        <input type="text" name="prazos" placeholder="ex: 15/30" value={cond.prazos || ''} onChange={e => handleCondicaoChange(index, e)} className="bg-gray-700 p-1.5 text-sm" />
                                        <button type="button" onClick={() => removeCondicao(index)} className="bg-red-500 text-white text-xs py-1.5 px-2 rounded-md hover:bg-red-600">Remover</button>
                                    </div>
                                )) : <p className="text-center text-sm text-gray-400 py-3">Nenhuma condição adicionada.</p>}
                            </div>
                        </div>
                    )}
                    {activeTab === 'filiais' && isMatriz && (
                        <FilialManager matriz={sacado} onSave={onSave} onEditFilial={onEditFilial} />
                    )}
                </div>
                {modalError && (
                    <div className="text-center p-2 mt-4 bg-red-900/50 border border-red-500 rounded-md">
                        <p className="text-sm text-red-300">{modalError}</p>
                    </div>
                )}
                <div className="mt-6 flex justify-between border-t border-gray-700 pt-4 flex-shrink-0">
                    <div>
                        {isEditMode && <button onClick={() => onDelete(sacado.id)} className="bg-red-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-red-700 transition text-sm">Excluir</button>}
                    </div>
                    <div className="flex gap-2">
                        <button type="button" onClick={onClose} className="bg-gray-600 text-gray-100 font-semibold py-2 px-4 rounded-md hover:bg-gray-500 transition text-sm">Cancelar</button>
                        <button onClick={handleSave} disabled={isSaving} className="bg-orange-500 text-white font-semibold py-2 px-4 rounded-md hover:bg-orange-600 transition text-sm">
                            {isSaving ? 'Salvando...' : 'Salvar'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}