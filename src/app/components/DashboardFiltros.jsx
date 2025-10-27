'use client'

import AutocompleteSearch from './AutoCompleteSearch'
// 1. Importar a função de formatação
import { formatDisplayConta } from '@/app/utils/formatters';

export default function DashboardFiltros({
  filters,
  onFilterChange,
  onAutocompleteSelect,
  tiposOperacao,
  contasBancarias, // Esta prop recebe o array com snake_case (ex: conta_corrente)
  fetchClientes,
  fetchSacados,
  onClear,
}) {
  return (
    <div className="bg-gray-700 p-4 rounded-lg shadow-lg mb-6">
      <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
        {/* Período */}
        <div className="md:col-span-2">
          <label
            htmlFor="dataInicio"
            className="block text-sm font-medium text-gray-200"
          >
            Período
          </label>
          <div className="flex items-center space-x-2 mt-1">
            <input
              type="date"
              id="dataInicio"
              name="dataInicio"
              value={filters.dataInicio}
              onChange={onFilterChange}
              className="w-full bg-gray-600 border border-gray-500 rounded-md px-2 py-1 text-gray-200 placeholder-gray-400
                         focus:ring-orange-500 focus:border-orange-500 outline-none"
            />
            <span className="text-gray-300">até</span>
            <input
              type="date"
              id="dataFim"
              name="dataFim"
              value={filters.dataFim}
              onChange={onFilterChange}
              className="w-full bg-gray-600 border border-gray-500 rounded-md px-2 py-1 text-gray-200 placeholder-gray-400
                         focus:ring-orange-500 focus:border-orange-500 outline-none"
            />
          </div>
        </div>

        {/* Tipo de Operação */}
        <div className="md:col-span-2">
          <label
            htmlFor="tipoOperacaoId"
            className="block text-sm font-medium text-gray-200"
          >
            Tipo de Operação
          </label>
          <select
            id="tipoOperacaoId"
            name="tipoOperacaoId"
            value={filters.tipoOperacaoId}
            onChange={onFilterChange}
            className="mt-1 block w-full bg-gray-600 border border-gray-500 rounded-md px-2 py-1 text-gray-200 placeholder-gray-400
                       focus:ring-orange-500 focus:border-orange-500 outline-none"
          >
            <option value="">Todos</option>
            {Array.isArray(tiposOperacao) && tiposOperacao.map((op) => (
              <option key={op.id} value={op.id}>
                {op.nome}
              </option>
            ))}
          </select>
        </div>

        {/* Cedente */}
        <div className="md:col-span-2">
          <label
            htmlFor="clienteNome"
            className="block text-sm font-medium text-gray-200"
          >
            Cedente
          </label>
          <AutocompleteSearch
            id="clienteNome"
            name="clienteNome"
            value={filters.clienteNome}
            onChange={onFilterChange}
            onSelect={(cliente) => onAutocompleteSelect('cliente', cliente)}
            fetchSuggestions={fetchClientes}
            placeholder="Todos os Cedentes"
            inputClassName="
              mt-1 w-full bg-gray-600 border border-gray-500 rounded-md
              px-2 py-1 text-white placeholder-gray-200
              focus:ring-orange-500 focus:border-orange-500 outline-none
            "
            listClassName="bg-gray-600 text-white"
          />
        </div>

        {/* Sacado */}
        <div className="md:col-span-2">
          <label
            htmlFor="sacado"
            className="block text-sm font-medium text-gray-200"
          >
            Sacado
          </label>
          <AutocompleteSearch
            id="sacado"
            name="sacado"
            value={filters.sacado}
            onChange={onFilterChange}
            onSelect={(sacado) => onAutocompleteSelect('sacado', sacado)}
            fetchSuggestions={fetchSacados}
            placeholder="Todos os Sacados"
            inputClassName="
              mt-1 w-full bg-gray-600 border border-gray-500 rounded-md
              px-2 py-1 text-white placeholder-gray-200
              focus:ring-orange-500 focus:border-orange-500 outline-none
            "
            listClassName="bg-gray-600 text-white"
          />
        </div>

        {/* --- CORREÇÃO NO SELECT DE CONTA BANCÁRIA --- */}
        <div className="md:col-span-2">
          <label
            htmlFor="contaBancaria"
            className="block text-sm font-medium text-gray-200"
          >
            Conta Bancária
          </label>
          <select
            id="contaBancaria"
            name="contaBancaria"
            value={filters.contaBancaria}
            onChange={onFilterChange}
            className="mt-1 block w-full bg-gray-600 border border-gray-500 rounded-md px-2 py-1 text-gray-200 placeholder-gray-400
                       focus:ring-orange-500 focus:border-orange-500 outline-none"
          >
            {/* CORREÇÃO AQUI: </as> mudado para </option> */}
            <option value="">Todas</option>
            {/* Mapear e formatar as contas */}
            {Array.isArray(contasBancarias) && contasBancarias.map((conta) => {

               // Verifica se 'conta' tem as propriedades necessárias (usando snake_case)
              if (!conta || !conta.id || !conta.banco || !conta.conta_corrente) {
                 // O 'agencia' pode ser nulo (ex: Inter), mas banco e conta_corrente são essenciais
                 console.warn("Item inválido em contasBancarias (DashboardFiltros):", conta);
                 return null; // Pula itens inválidos
              }

              // Monta a string completa usando snake_case
              // Trata o caso de agência nula ou vazia
              const agencia = conta.agencia || 'N/A';
              const contaCompleta = `${conta.banco} - ${agencia}/${conta.conta_corrente}`;

              // O 'value' para o filtro DEVE ser a string completa que a API de filtro espera
              return (
                <option key={conta.id} value={contaCompleta}>
                   {/* Aplica a formatação para exibição */}
                  {formatDisplayConta(contaCompleta)}
                </option>
              );
            })}
          </select>
        </div>
        {/* --- FIM DA CORREÇÃO --- */}

        {/* Limpar Filtros */}
        <div className="md:col-span-2">
          <button
            onClick={onClear}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold py-2 rounded-md text-sm
                       transition"
          >
            Limpar Filtros
          </button>
        </div>
      </div>
    </div>
  )
}

