'use client';

import { formatDisplayConta } from '@/app/utils/formatters';
import { FaUpload } from 'react-icons/fa'; 
import { useRef } from 'react'; 

export default function FiltroLateral({ 
    filters, 
    onFilterChange, 
    onClear, 
    saldos, 
    contasMaster, 
    onOfxUpload, 
    ofxExtrato,
    onOfxClear 
}) {

    const fileInputRef = useRef(null); 

    const contasApi = Array.isArray(contasMaster)
        ? contasMaster.filter(c => {
            const banco = String(c?.banco || '').toLowerCase();
            const descricao = String(c?.descricao || '').toLowerCase();
            const contaBancaria = String(c?.contaBancaria || '').toLowerCase();

            const isInter =
                banco.includes('inter') ||
                descricao.includes('inter') ||
                contaBancaria.includes('inter');

            const isBradesco =
                banco.includes('bradesco') ||
                descricao.includes('bradesco') ||
                contaBancaria.includes('bradesco') ||
                banco === '237' ||
                contaBancaria.includes('237');

            return isInter || isBradesco;
        })
        : [];

    const handleUploadClick = () => {
        if (fileInputRef.current) {
            fileInputRef.current.click();
        }
    };
    
    const handleFileChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            onOfxUpload(e.target.files[0]);
            e.target.value = null; 
        }
    };

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
                            disabled={!!ofxExtrato} 
                        >
                            <option value="">-- Nenhum --</option>
                            {contasApi.map(conta => (
                                <option
                                    key={conta.id}
                                    value={`${conta.banco}|${conta.agencia}|${conta.contaCorrente}`}
                                >
                                    {formatDisplayConta(conta.contaBancaria)}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="pt-4 border-t border-gray-600">
                        <label className="block text-sm font-semibold text-gray-300 mb-1">Importar Extrato OFX</label>
                        <input
                            type="file"
                            accept=".ofx, .OFX"
                            ref={fileInputRef}
                            onChange={handleFileChange}
                            className="hidden" 
                        />
                        <button
                            onClick={handleUploadClick}
                            disabled={!!filters.contaExterna} 
                            className="w-full bg-blue-600 text-white font-semibold py-2 px-3 rounded-md hover:bg-blue-700 transition flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            <FaUpload /> Carregar Arquivo OFX
                        </button>
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
                            disabled={!!filters.contaExterna || !!ofxExtrato} 
                        >
                            <option value="">Todas as Contas</option>
                            {/* --- LÓGICA APLICADA AQUI: Filtra saldo !== 0 --- */}
                            {Array.isArray(saldos) && saldos
                                .filter(conta => conta.saldo !== 0)
                                .map(conta => (
                                    <option key={conta.contaBancaria} value={conta.contaBancaria}>
                                        {formatDisplayConta(conta.contaBancaria)}
                                    </option>
                                ))
                            }
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
                            disabled={!!filters.contaExterna || !!ofxExtrato} 
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
