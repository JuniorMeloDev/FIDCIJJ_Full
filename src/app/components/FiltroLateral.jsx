'use client';


export default function FiltroLateral({ filters, onFilterChange, onClear, saldos }) {
    
    const contas = Array.isArray(saldos) ? saldos : [];
    
    return (
        <div className="w-full lg:w-66 flex-shrink-0 bg-gray-800 rounded-lg shadow-md flex flex-col overflow-hidden">
            
            <div className="p-4 border-b border-gray-700">
                <h2 className="text-lg font-semibold text-gray-100">Filtros</h2>
            </div>
            
            <div className="flex-grow p-4 overflow-y-auto">
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-semibold text-gray-300 mb-1">Conta</label>
                        <select 
                            name="contaBancaria" 
                            value={filters.contaBancaria} 
                            onChange={onFilterChange}
                            className="w-full bg-gray-700 border border-gray-600 rounded-md shadow-sm text-sm p-2 text-white"
                        >
                            <option value="">Todas as Contas</option>
                            {contas.map(conta => (
                                <option key={conta.contaBancaria} value={conta.contaBancaria}>{conta.contaBancaria}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-gray-300">Período</label>
                        <div className="mt-1 space-y-2">
                            <input type="date" name="dataInicio" value={filters.dataInicio} onChange={onFilterChange} className="w-full bg-gray-700 border border-gray-600 rounded-md shadow-sm text-sm p-2 text-white"/>
                            <input type="date" name="dataFim" value={filters.dataFim} onChange={onFilterChange} className="w-full bg-gray-700 border border-gray-600 rounded-md shadow-sm text-sm p-2 text-white"/>
                        </div>
                    </div>

                    <div>
                        <label htmlFor="descricao" className="block text-sm font-semibold text-gray-300">Descrição</label>
                        <input id="descricao" type="text" name="descricao" placeholder="Parte da descrição..." value={filters.descricao} onChange={onFilterChange} className="mt-1 w-full bg-gray-700 border border-gray-600 rounded-md shadow-sm text-sm p-2 text-white"/>
                    </div>
                </div>
            </div>

            <div className="flex-shrink-0 p-4 border-t border-gray-700 bg-gray-800 rounded-b-lg">
                <div className="flex flex-col space-y-2">
                    {/* Botão "Aplicar" foi removido */}
                    <button onClick={onClear} className="w-full bg-orange-500 text-white font-semibold py-2 rounded-md hover:bg-orange-600 transition">Limpar</button>
                </div>
            </div>
        </div>
    );
};