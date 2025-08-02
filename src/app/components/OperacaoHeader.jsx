'use client';

import AutocompleteSearch from "./AutoCompleteSearch";

export default function OperacaoHeader({
    dataOperacao, setDataOperacao,
    tipoOperacaoId, setTipoOperacaoId, tiposOperacao,
    empresaCedente,
    onCedenteChange,
    onSelectCedente,
    fetchClientes
}) {
    return (
        <div className="bg-gray-800 p-4 rounded-lg shadow-md mb-4">
            <h2 className="text-xl font-semibold mb-4 text-gray-100">Dados da Operação</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-300">Data da Operação</label>
                    <input type="date" value={dataOperacao} onChange={e => setDataOperacao(e.target.value)} className="mt-1 w-full bg-gray-700 border-gray-600 rounded-md shadow-sm p-2 text-white" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-300">Tipo de Operação</label>
                    <select value={tipoOperacaoId} onChange={e => setTipoOperacaoId(e.target.value)} className="mt-1 w-full bg-gray-700 border-gray-600 rounded-md shadow-sm p-2 text-white">
                        <option value="">Selecione...</option>
                        {tiposOperacao.map(op => ( <option key={op.id} value={op.id}>{op.nome}</option>))}
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-300">Cedente</label>
                    <AutocompleteSearch
                        name="empresaCedente"
                        value={empresaCedente}
                        onChange={(e) => onCedenteChange(e.target.value)}
                        onSelect={onSelectCedente}
                        fetchSuggestions={fetchClientes}
                        placeholder="Digite o nome do cliente"
                    />
                </div>
            </div>
        </div>
    );
}