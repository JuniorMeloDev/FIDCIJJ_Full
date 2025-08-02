'use client'

import AutocompleteSearch from './AutoCompleteSearch'

export default function DashboardFiltros({
  filters,
  onFilterChange,
  onAutocompleteSelect,
  tiposOperacao,
  contasBancarias,
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
            {tiposOperacao.map((op) => (
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

        {/* Conta Bancária */}
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
            <option value="">Todas</option>
            {contasBancarias.map((conta) => (
              <option key={conta.id} value={conta.contaCorrente}>
                {`${conta.banco} - ${conta.agencia}/${conta.contaCorrente}`}
              </option>
            ))}
          </select>
        </div>

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