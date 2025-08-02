'use client';

import AutocompleteSearch from './AutoCompleteSearch';

export default function FiltroLateralConsultas({ filters, onFilterChange, onClear, tiposOperacao, fetchClientes, fetchSacados, onAutocompleteSelect }) {
    return (
        <div className="w-full lg:w-72 flex-shrink-0 bg-gray-800 p-3 rounded-lg shadow-md flex flex-col h-full max-h-[calc(100vh-12rem)]">
            <h2 className="text-md font-semibold text-gray-100 border-b border-gray-700 pb-2 mb-3 flex-shrink-0">Filtros de Consulta</h2>
            
            <div className="flex-grow overflow-y-auto pr-2">
                <div className="space-y-2">
                    <div>
                        <label className="block text-xs font-bold text-gray-300 mb-1">Data Operação</label>
                        <div className="grid grid-cols-2 gap-2">
                            <input type="date" name="dataOpInicio" value={filters.dataOpInicio} onChange={onFilterChange} className="w-full bg-gray-700 border-gray-600 rounded-md shadow-sm text-sm p-1.5 text-white"/>
                            <input type="date" name="dataOpFim" value={filters.dataOpFim} onChange={onFilterChange} className="w-full bg-gray-700 border-gray-600 rounded-md shadow-sm text-sm p-1.5 text-white"/>
                        </div>
                    </div>
                    
                    <div>
                        <label className="block text-xs font-bold text-gray-300 mb-1">Data Vencimento</label>
                        <div className="grid grid-cols-2 gap-2">
                            <input type="date" name="dataVencInicio" value={filters.dataVencInicio} onChange={onFilterChange} className="w-full bg-gray-700 border-gray-600 rounded-md shadow-sm text-sm p-1.5 text-white"/>
                            <input type="date" name="dataVencFim" value={filters.dataVencFim} onChange={onFilterChange} className="w-full bg-gray-700 border-gray-600 rounded-md shadow-sm text-sm p-1.5 text-white"/>
                        </div>
                    </div>

                    <div>
                        <label htmlFor="cedente" className="block text-xs font-bold text-gray-300">Cedente</label>
                        <AutocompleteSearch
                            name="clienteNome"
                            value={filters.clienteNome}
                            onChange={onFilterChange}
                            onSelect={(cliente) => onAutocompleteSelect('cliente', cliente)}
                            fetchSuggestions={fetchClientes}
                            placeholder="Nome do cedente"
                        />
                    </div>
                     <div>
                        <label htmlFor="sacado" className="block text-xs font-bold text-gray-300">Sacado</label>
                        <AutocompleteSearch
                            name="sacado"
                            value={filters.sacado}
                            onChange={onFilterChange}
                            onSelect={(sacado) => onAutocompleteSelect('sacado', sacado)}
                            fetchSuggestions={fetchSacados}
                            placeholder="Nome do sacado"
                        />
                    </div>
                     <div>
                        <label htmlFor="tipoOperacaoId" className="block text-xs font-bold text-gray-300">Tipo de Operação</label>
                        <select id="tipoOperacaoId" name="tipoOperacaoId" value={filters.tipoOperacaoId} onChange={onFilterChange} className="mt-1 w-full bg-gray-700 border-gray-600 rounded-md shadow-sm text-sm p-1.5 text-white">
                            <option value="">Todos</option>
                            {tiposOperacao.map(op => (
                                <option key={op.id} value={op.id}>{op.nome}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="nfCte" className="block text-xs font-bold text-gray-300">NF/CT-e</label>
                        <input id="nfCte" type="text" name="nfCte" placeholder="Número da nota..." value={filters.nfCte} onChange={onFilterChange} className="mt-1 w-full bg-gray-700 border-gray-600 rounded-md shadow-sm text-sm p-1.5 text-white"/>
                    </div>

                    <div>
                        <label htmlFor="status" className="block text-xs font-bold text-gray-300">Status</label>
                        <select id="status" name="status" value={filters.status} onChange={onFilterChange} className="mt-1 w-full bg-gray-700 border-gray-600 rounded-md shadow-sm text-sm p-1.5 text-white">
                            <option value="Todos">Todos</option>
                            <option value="Pendente">Pendente</option>
                            <option value="Recebido">Recebido</option>
                        </select>
                    </div>
                </div>
            </div>
            
            <div className="flex-shrink-0 pt-2 border-t border-gray-700 mt-2">
                <button onClick={onClear} className="w-full bg-orange-500 text-white font-semibold py-1.5 rounded-md hover:bg-orange-600 transition text-sm">Limpar</button>
            </div>
        </div>
    );
};