'use client';

export default function FiltroLateral({ filters, onFilterChange, onClear, saldos, contasMaster }) {
    
    // Agora usamos o contasMaster, que tem os dados mais limpos
    const contasInter = Array.isArray(contasMaster)
        ? contasMaster.filter(c => c.contaBancaria.toLowerCase().includes('inter'))
        : [];

    return (
        <div className="w-full bg-gray-800 rounded-lg shadow-md flex flex-col">
            <div className="p-4 border-b border-gray-700 flex-shrink-0">
                <h2 className="text-lg font-semibold text-gray-100">Filtros</h2>
            </div>
            
            <div className="flex-grow p-4 overflow-y-auto">
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-semibold text-gray-300 mb-1">Consultar Extrato Bancário</label>
                        <select 
                            name="contaExterna" 
                            value={filters.contaExterna || ''} 
                            onChange={onFilterChange}
                            className="w-full bg-gray-700 border border-gray-600 rounded-md shadow-sm text-sm p-2 text-white"
                        >
                            <option value="">-- Nenhum --</option>
                            {/* CORREÇÃO: O 'value' agora pega apenas o número da conta */}
                            {contasInter.map(conta => (
                                <option key={conta.id} value={conta.contaBancaria.split('/')[1]}>
                                    {conta.contaBancaria}
                                </option>
                            ))}
                        </select>
                         <p className="text-xs text-gray-400 mt-1">Selecionar uma conta aqui irá buscar o extrato via API do banco.</p>
                    </div>

                    <div className="border-t border-gray-600 my-4"></div>
                    <p className="text-sm font-semibold text-gray-300">Filtros Internos</p>

                    <div>
                        <label className="block text-sm font-semibold text-gray-300 mb-1">Conta (Interno)</label>
                        <select 
                            name="contaBancaria" 
                            value={filters.contaBancaria} 
                            onChange={onFilterChange}
                            className="w-full bg-gray-700 border border-gray-600 rounded-md shadow-sm text-sm p-2 text-white"
                            disabled={!!filters.contaExterna}
                        >
                            <option value="">Todas as Contas</option>
                            {Array.isArray(saldos) && saldos.map(conta => (
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
                        <input id="descricao" type="text" name="descricao" placeholder="Parte da descrição..." value={filters.descricao} onChange={onFilterChange} className="mt-1 w-full bg-gray-700 border border-gray-600 rounded-md shadow-sm text-sm p-2 text-white" disabled={!!filters.contaExterna} />
                    </div>
                </div>
            </div>

            <div className="flex-shrink-0 p-4 border-t border-gray-700 bg-gray-800 rounded-b-lg">
                <button onClick={onClear} className="w-full bg-orange-500 text-white font-semibold py-2 rounded-md hover:bg-orange-600 transition">Limpar</button>
            </div>
        </div>
    );
};