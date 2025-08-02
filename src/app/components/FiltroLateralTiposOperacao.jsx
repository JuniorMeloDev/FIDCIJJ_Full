'use client';

export default function FiltroLateralTiposOperacao({ filters, onFilterChange, onClear }) {
    return (
        <div className="w-full lg:w-72 flex-shrink-0 bg-gray-800 p-4 rounded-lg shadow-md">
            <h2 className="text-lg font-semibold text-gray-100 border-b border-gray-700 pb-2 mb-4">Filtros</h2>
            <div className="space-y-4">
                <div>
                    <label htmlFor="nome" className="block text-sm font-semibold text-gray-300">Nome da Operação</label>
                    <input 
                        id="nome" 
                        type="text" 
                        name="nome" 
                        placeholder="Parte do nome..." 
                        value={filters.nome} 
                        onChange={onFilterChange} 
                        className="mt-1 w-full bg-gray-700 border border-gray-600 rounded-md p-1.5 text-sm text-white"
                    />
                </div>
                <div className="pt-2 border-t border-gray-700 mt-4">
                    <button 
                        onClick={onClear} 
                        className="w-full bg-orange-500 text-white font-semibold py-2 rounded-md hover:bg-orange-600 transition text-sm"
                    >
                        Limpar Filtros
                    </button>
                </div>
            </div>
        </div>
    );
};