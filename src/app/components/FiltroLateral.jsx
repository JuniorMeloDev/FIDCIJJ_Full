// src/app/components/FiltroLateral.jsx
'use client';
import { formatDisplayConta } from '@/app/utils/formatters';
import { FaUpload } from 'react-icons/fa'; // Importa o ícone
import { useRef } from 'react'; // Importa o useRef

// Adiciona as novas props onOfxUpload e ofxExtrato
export default function FiltroLateral({ 
    filters, 
    onFilterChange, 
    onClear, 
    saldos, 
    contasMaster, 
    onOfxUpload, 
    ofxExtrato,
    onOfxClear  // Nova prop
}) {

    const fileInputRef = useRef(null); // Ref para o input de arquivo

    const contasInter = Array.isArray(contasMaster)
        ? contasMaster.filter(c => c.contaBancaria.toLowerCase().includes('inter'))
        : [];

    // Handler para o clique no botão
    const handleUploadClick = () => {
        if (fileInputRef.current) {
            fileInputRef.current.click();
        }
    };
    
    // Handler para a seleção do arquivo
    const handleFileChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            onOfxUpload(e.target.files[0]);
            e.target.value = null; // Reseta o input
        }
    };

    // Modifique o botão de limpar para chamar também o onOfxClear
    const handleClearAll = () => {
        onClear();
        if (onOfxClear) {
            onOfxClear();
        }
    };

    return (
        <div className="w-full bg-gray-800 rounded-lg shadow-md flex flex-col">
            <div className="p-4 border-b border-gray-700 flex-shrink-0">
                <h2 className="text-lg font-semibold text-gray-100">Filtros</h2>
            </div>

            <div className="flex-grow p-4 overflow-y-auto">
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-semibold text-gray-300 mb-1">Extrato Bancário API</label>
                        <select
                            name="contaExterna"
                            value={filters.contaExterna || ''}
                            onChange={onFilterChange}
                            className="w-full bg-gray-700 border border-gray-600 rounded-md shadow-sm text-sm p-2 text-white"
                            disabled={!!ofxExtrato} // Desabilita se OFX estiver carregado
                        >
                            <option value="">-- Nenhum --</option>
                            {contasInter.map(conta => (
                                // O value aqui deve ser o número da conta que a API do Inter espera
                                <option key={conta.id} value={conta.contaBancaria.split('/')[1]}> 
                                    {formatDisplayConta(conta.contaBancaria)}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* --- SEÇÃO DE UPLOAD OFX ADICIONADA --- */}
                    <div className="pt-4 border-t border-gray-600">
                        <label className="block text-sm font-semibold text-gray-300 mb-1">Importar Extrato OFX</label>
                        <input
                            type="file"
                            accept=".ofx, .OFX"
                            ref={fileInputRef}
                            onChange={handleFileChange}
                            className="hidden" // Oculta o input real
                        />
                        <button
                            onClick={handleUploadClick}
                            disabled={!!filters.contaExterna} // Desabilita se API estiver selecionada
                            className="w-full bg-blue-600 text-white font-semibold py-2 px-3 rounded-md hover:bg-blue-700 transition flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            <FaUpload /> Carregar Arquivo OFX
                        </button>
                    </div>
                    {/* --- FIM DA SEÇÃO --- */}

                    <div className="border-t border-gray-600 my-4"></div>
                    <p className="text-sm font-semibold text-gray-300">Filtros Internos</p>

                    <div>
                        <label className="block text-sm font-semibold text-gray-300 mb-1">Conta (Interno)</label>
                        <select
                            name="contaBancaria"
                            value={filters.contaBancaria}
                            onChange={onFilterChange}
                            className="w-full bg-gray-700 border border-gray-600 rounded-md shadow-sm text-sm p-2 text-white"
                            disabled={!!filters.contaExterna || !!ofxExtrato} // Desabilita se API ou OFX estiverem em uso
                        >
                            <option value="">Todas as Contas</option>
                            {Array.isArray(saldos) && saldos.map(conta => (
                                // --- ESTA É A CORREÇÃO PARA O ERRO DA IMAGEM ---
                                <option key={conta.contaBancaria} value={conta.contaBancaria}>
                                    {formatDisplayConta(conta.contaBancaria)}
                                </option>
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
                        <input 
                            id="descricao" 
                            type="text" 
                            name="descricao" 
                            placeholder="Parte da descrição..." 
                            value={filters.descricao} 
                            onChange={onFilterChange} 
                            className="mt-1 w-full bg-gray-700 border border-gray-600 rounded-md shadow-sm text-sm p-2 text-white" 
                            disabled={!!filters.contaExterna || !!ofxExtrato} // Desabilita se API ou OFX
                        />
                    </div>
                </div>
            </div>

            <div className="flex-shrink-0 p-4 border-t border-gray-700 bg-gray-800 rounded-b-lg">
                <button 
                    onClick={handleClearAll} 
                    className="w-full bg-orange-500 text-white font-semibold py-2 rounded-md hover:bg-orange-600 transition"
                >
                    Limpar
                </button>
            </div>
        </div>
    );
};