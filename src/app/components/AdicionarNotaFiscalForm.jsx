'use client';
import AutocompleteSearch from './AutoCompleteSearch';

export default function AdicionarNotaFiscalForm({ 
    novaNf, 
    handleInputChange, 
    handleAddNotaFiscal, 
    isLoading,
    onSelectSacado,
    fetchSacados,
    condicoesSacado,
    setNovaNf 
}) {
    const handleCondicaoChange = (e) => {
        const selectedIndex = e.target.value;
        if (selectedIndex === "manual") {
            setNovaNf(prev => ({ ...prev, parcelas: '1', prazos: '' }));
        } else {
            const condicao = condicoesSacado[selectedIndex];
            if (condicao) {
                setNovaNf(prev => ({
                    ...prev,
                    parcelas: String(condicao.parcelas),
                    prazos: condicao.prazos,
                }));
            }
        }
    };
    
    return (
        <section className="bg-gray-800 p-4 rounded-lg shadow-md mb-4">
          <h2 className="text-xl font-semibold mb-4 text-gray-100">Adicionar Nota Fiscal / CT-e</h2>
          <form onSubmit={handleAddNotaFiscal} className="grid grid-cols-1 md:grid-cols-6 gap-6 items-end">
            
            <div className="md:col-span-2">
              <label htmlFor="clienteSacado" className="block text-sm font-medium text-gray-300">Cliente (Sacado)</label>
              <AutocompleteSearch
                name="clienteSacado"
                value={novaNf.clienteSacado}
                onChange={handleInputChange}
                onSelect={onSelectSacado}
                fetchSuggestions={fetchSacados}
                placeholder="Digite o nome do sacado"
              />
            </div>

            <div className="md:col-span-1">
              <label htmlFor="nfCte" className="block text-sm font-medium text-gray-300">Número NF/CT-e</label>
              <input type="text" name="nfCte" value={novaNf.nfCte} onChange={handleInputChange} required className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm p-2 text-white"/>
            </div>

            <div className="md:col-span-1">
              <label htmlFor="dataNf" className="block text-sm font-medium text-gray-300">Data da NF/CT-e</label>
              <input type="date" name="dataNf" value={novaNf.dataNf} onChange={handleInputChange} required className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm p-2 text-white"/>
            </div>

            <div className="md:col-span-2">
              <label htmlFor="valorNf" className="block text-sm font-medium text-gray-300">Valor</label>
              <input type="text" name="valorNf" value={novaNf.valorNf} onChange={handleInputChange} placeholder="R$ 0,00" required className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm p-2 text-white"/>
            </div>
            
            
            {condicoesSacado && condicoesSacado.length > 0 ? (
                <div className="md:col-span-3">
                    <label htmlFor="condicao" className="block text-sm font-medium text-gray-300">Condição de Pagamento</label>
                    <select
                        id="condicao"
                        name="condicao"
                        onChange={handleCondicaoChange}
                        className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm p-2 text-white"
                    >
                        {condicoesSacado.map((c, index) => (
                            <option key={index} value={index}>
                                {c.parcelas}x - Prazos: {c.prazos}
                            </option>
                        ))}
                        <option value="manual">Digitar manualmente</option>
                    </select>
                </div>
            ) : (
                <>
                    <div className="md:col-span-1">
                        <label htmlFor="parcelas" className="block text-sm font-medium text-gray-300">Parcelas</label>
                        <input type="number" name="parcelas" value={novaNf.parcelas} onChange={handleInputChange} placeholder="1" min="1" required className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm p-2 text-white"/>
                    </div>
                    <div className="md:col-span-2">
                        <label htmlFor="prazos" className="block text-sm font-medium text-gray-300">Prazos</label>
                        <input type="text" name="prazos" value={novaNf.prazos} onChange={handleInputChange} placeholder="Ex: 15/30/45" required className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm p-2 text-white"/>
                    </div>
                </>
            )}
            
            <div className="md:col-span-2">
              <label htmlFor="peso" className="block text-sm font-medium text-gray-300">Peso Líquido (Kg)</label>
              <input type="text" name="peso" value={novaNf.peso} onChange={handleInputChange} placeholder="0,00" className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm p-2 text-white"/>
            </div>
            
            <div className="md:col-span-1">
              <button type="submit" disabled={isLoading} className="w-full bg-orange-500 text-white font-semibold py-2 px-4 rounded-md shadow-sm hover:bg-orange-600 transition disabled:bg-orange-400">
                {isLoading ? 'A calcular...' : 'Adicionar NF'}
              </button>
            </div>
          </form>
        </section>
    );
}