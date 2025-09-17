'use client';

import { useState, useEffect } from 'react';
import { formatCnpjCpf, formatTelefone, formatCep } from '@/app/utils/formatters';
import AutocompleteSearch from './AutoCompleteSearch';

const TabButton = ({ label, isActive, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`px-4 py-2 text-sm font-medium whitespace-nowrap ${
      isActive
        ? "border-orange-500 text-orange-400 border-b-2"
        : "border-transparent text-gray-400 hover:text-gray-200"
    }`}
  >
    {label}
  </button>
);

export default function EditSacadoModal({ isOpen, onClose, sacado, onSave, onDelete, onEditFilial }) {
    const initialState = {
        nome: '', cnpj: '', ie: '', cep: '', endereco: '', bairro: '', 
        municipio: '', uf: '', fone: '', condicoesPagamento: [],
        matriz_id: null
    };
    const [formData, setFormData] = useState(initialState);
    const [isFetchingCnpj, setIsFetchingCnpj] = useState(false);
    const [dataFetched, setDataFetched] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [modalError, setModalError] = useState('');
    const [matrizNome, setMatrizNome] = useState('');
    const [activeTab, setActiveTab] = useState('dadosCadastrais');

    const getAuthHeader = () => {
        const token = sessionStorage.getItem('authToken');
        return token ? { 'Authorization': `Bearer ${token}` } : {};
    };

    const fetchSacados = async (query) => {
        try {
            const res = await fetch(`/api/cadastros/sacados/search?nome=${query}`, { headers: getAuthHeader() });
            if (!res.ok) return [];
            const data = await res.json();
            // Garante que uma filial não possa ser matriz de outra filial
            return data.filter(s => !s.matriz_id);
        } catch {
            return [];
        }
    };

    useEffect(() => {
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
                setDataFetched(true);
                
                if (sacado.matriz_id && sacado.matriz_nome) {
                    setMatrizNome(sacado.matriz_nome);
                } else {
                    setMatrizNome('');
                }

            } else {
                setFormData(initialState);
                setDataFetched(false);
                setMatrizNome('');
            }
        }
    }, [sacado, isOpen]);

    if (!isOpen) return null;

    const handleCnpjSearch = async (cnpjValue) => {
        const cleanCnpj = cnpjValue.replace(/\D/g, '');
        if (cleanCnpj.length !== 14) return;
        setIsFetchingCnpj(true);
        try {
            const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleanCnpj}`);
            if (!response.ok) throw new Error('CNPJ não encontrado na base de dados externa.');
            const data = await response.json();
            setFormData(prev => ({
                ...prev,
                nome: data.razao_social || '',
                fone: data.ddd_telefone_1 ? formatTelefone(`${data.ddd_telefone_1}${data.telefone_1 || ''}`) : '',
                cep: data.cep ? formatCep(data.cep) : '',
                endereco: `${data.logradouro || ''}, ${data.numero || ''}`,
                bairro: data.bairro || '',
                municipio: data.municipio || '',
                uf: data.uf || '',
                ie: '', 
            }));
            setDataFetched(true);
        } catch (error) {
            setModalError(error.message);
            setDataFetched(true); 
        } finally {
            setIsFetchingCnpj(false);
        }
    };

    const handleChange = (e) => {
        setModalError('');
        const { name, value } = e.target;
        let formattedValue = value;
        if (name === 'cnpj') {
            formattedValue = formatCnpjCpf(value);
            if (formattedValue.replace(/\D/g, '').length === 14) {
                handleCnpjSearch(formattedValue);
            }
        }
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

    const addCondicao = () => {
        setFormData(prev => ({ ...prev, condicoesPagamento: [...prev.condicoesPagamento, { parcelas: '1', prazos: '' }] }));
    };

    const removeCondicao = (index) => {
        const condicoes = [...formData.condicoesPagamento];
        condicoes.splice(index, 1);
        setFormData(prev => ({ ...prev, condicoesPagamento: condicoes }));
    };

    const handleSelectMatriz = (matrizSelecionada) => {
        setFormData(prev => ({ ...prev, matriz_id: matrizSelecionada.id, nome: matrizSelecionada.nome }));
        setMatrizNome(matrizSelecionada.nome);
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
            matriz_id: formData.matriz_id,
        }; 
        const result = await onSave(sacado?.id, dataToSave);
        setIsSaving(false);
        if (!result.success) {
            setModalError(result.message);
        }
    };
    
    const isEditMode = !!sacado?.id;
    const isMatrizComFiliais = isEditMode && !formData.matriz_id && sacado.filiais && sacado.filiais.length > 0;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4">
            <div className="bg-gray-800 text-white p-6 rounded-lg shadow-xl w-full max-w-4xl max-h-[95vh] flex flex-col">
                <h2 className="text-xl font-bold mb-4 flex-shrink-0">{isEditMode ? 'Editar Sacado' : 'Adicionar Novo Sacado'}</h2>
                
                <div className="border-b border-gray-700 flex-shrink-0">
                    <nav className="-mb-px flex space-x-6" aria-label="Tabs">
                        <TabButton label="Dados Cadastrais" isActive={activeTab === 'dadosCadastrais'} onClick={() => setActiveTab('dadosCadastrais')} />
                        <TabButton label="Condições Pag." isActive={activeTab === 'condicoes'} onClick={() => setActiveTab('condicoes')} />
                        {isMatrizComFiliais && (
                            <TabButton label={`Filiais (${sacado.filiais.length})`} isActive={activeTab === 'filiais'} onClick={() => setActiveTab('filiais')} />
                        )}
                    </nav>
                </div>
                
                <div className="flex-grow overflow-y-auto py-4 pr-2">
                    {activeTab === 'dadosCadastrais' && (
                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs font-bold text-gray-300">Empresa Matriz (Opcional - para filiais)</label>
                                <AutocompleteSearch
                                    name="matriz" value={matrizNome}
                                    onChange={(e) => {
                                        setMatrizNome(e.target.value);
                                        if (e.target.value === '') setFormData(prev => ({ ...prev, matriz_id: null }));
                                    }}
                                    onSelect={handleSelectMatriz} fetchSuggestions={fetchSacados}
                                    placeholder="Pesquise para vincular a uma matriz"
                                />
                            </div>
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-300">CNPJ {isFetchingCnpj && <span className="text-xs text-orange-400">(A consultar...)</span>}</label>
                                    <input type="text" name="cnpj" value={formData.cnpj} onChange={handleChange} placeholder="Digite para buscar..." className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md p-1.5 text-sm"/>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-300">Nome do Sacado (Matriz ou Filial)</label>
                                    <input type="text" name="nome" value={formData.nome || ''} onChange={handleChange} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md p-1.5 text-sm"/>
                                </div>
                            </div>
                            {(dataFetched || isEditMode) && (
                                <>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div><label className="block text-xs font-bold text-gray-300">Inscrição Estadual</label><input type="text" name="ie" value={formData.ie || ''} onChange={handleChange} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md p-1.5 text-sm"/></div>
                                        <div><label className="block text-xs font-bold text-gray-300">Telefone</label><input type="text" name="fone" value={formData.fone || ''} onChange={(e) => setFormData(prev => ({...prev, fone: formatTelefone(e.target.value)}))} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md p-1.5 text-sm"/></div>
                                        <div><label className="block text-xs font-bold text-gray-300">CEP</label><input type="text" name="cep" value={formData.cep || ''} onChange={(e) => setFormData(prev => ({...prev, cep: formatCep(e.target.value)}))} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md p-1.5 text-sm"/></div>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div className="md:col-span-2"><label className="block text-xs font-bold text-gray-300">Endereço</label><input type="text" name="endereco" value={formData.endereco || ''} onChange={handleChange} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md p-1.5 text-sm"/></div>
                                        <div><label className="block text-xs font-bold text-gray-300">Bairro</label><input type="text" name="bairro" value={formData.bairro || ''} onChange={handleChange} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md p-1.5 text-sm"/></div>
                                        <div className="md:col-span-2"><label className="block text-xs font-bold text-gray-300">Município</label><input type="text" name="municipio" value={formData.municipio || ''} onChange={handleChange} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md p-1.5 text-sm"/></div>
                                        <div><label className="block text-xs font-bold text-gray-300">UF</label><input type="text" name="uf" value={formData.uf || ''} onChange={handleChange} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md p-1.5 text-sm"/></div>
                                    </div>
                                </>
                            )}
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
                                        <input type="number" name="parcelas" placeholder="1" min="1" value={cond.parcelas || ''} onChange={e => handleCondicaoChange(index, e)} className="bg-gray-700 border-gray-600 rounded-md p-1.5 text-sm text-center" />
                                        <input type="text" name="prazos" placeholder="ex: 15/30" value={cond.prazos || ''} onChange={e => handleCondicaoChange(index, e)} className="bg-gray-700 border-gray-600 rounded-md p-1.5 text-sm" />
                                        <button type="button" onClick={() => removeCondicao(index)} className="bg-red-500 text-white text-xs font-semibold py-1.5 px-2 rounded-md hover:bg-red-600 transition">Remover</button>
                                    </div>
                                )) : (
                                    <p className="text-center text-sm text-gray-400 py-3">Nenhuma condição adicionada.</p>
                                )}
                            </div>
                        </div>
                    )}
                    
                    {activeTab === 'filiais' && isMatrizComFiliais && (
                        <div>
                            <h3 className="text-md font-semibold text-gray-100 mb-2">Filiais Vinculadas</h3>
                            <div className="overflow-x-auto border border-gray-700 rounded-md">
                                <table className="min-w-full divide-y divide-gray-600 text-sm">
                                    <thead className="bg-gray-700/50">
                                        <tr>
                                            <th className="px-4 py-2 text-left">CNPJ</th>
                                            <th className="px-4 py-2 text-left">Local</th>
                                            <th className="px-4 py-2 text-left">Telefone</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-600">
                                        {sacado.filiais.map(filial => (
                                            <tr key={filial.id} onClick={() => onEditFilial(filial)} className="hover:bg-gray-700 cursor-pointer">
                                                <td className="px-4 py-2">{formatCnpjCpf(filial.cnpj)}</td>
                                                <td className="px-4 py-2">{filial.municipio} - {filial.uf}</td>
                                                <td className="px-4 py-2">{formatTelefone(filial.fone)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
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