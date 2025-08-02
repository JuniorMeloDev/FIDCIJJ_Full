'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import TopFiveApex from '../components/TopFiveApex'
import { formatBRLNumber, formatDate } from '@/app/utils/formatters'
import DashboardFiltros from '@/app/components/DashboardFiltros'
import RelatorioModal from '@/app/components/RelatorioModal'
import { FaChartLine, FaDollarSign, FaClock } from 'react-icons/fa'
import { API_URL } from '../apiConfig'; // IMPORTAÇÃO DA URL CENTRALIZADA

export default function ResumoPage() {
    const [saldos, setSaldos] = useState([])
    const [metrics, setMetrics] = useState(null);
    const [tiposOperacao, setTiposOperacao] = useState([])
    const [contasBancarias, setContasBancarias] = useState([])
    const [filters, setFilters] = useState({
        dataInicio: '',
        dataFim: '',
        tipoOperacaoId: '',
        clienteId: '',
        clienteNome: '',
        sacado: '',
        contaBancaria: '',
    })
    
    const [debouncedFilters, setDebouncedFilters] = useState(filters);
    const [diasVencimento, setDiasVencimento] = useState(5)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [isRelatorioModalOpen, setIsRelatorioModalOpen] = useState(false)
    const [topFiveChartType, setTopFiveChartType] = useState('cedentes');

    const getAuthHeader = () => {
        const token = sessionStorage.getItem('authToken');
        return token ? { 'Authorization': `Bearer ${token}` } : {};
    };

    const fetchApiData = async (url) => {
        try {
          const res = await fetch(url, { headers: getAuthHeader() })
          if (!res.ok) return []
          return await res.json()
        } catch {
          return []
        }
    }

    useEffect(() => {
        ;(async () => {
          const [tiposData, contasData] = await Promise.all([
            fetchApiData(`${API_URL}/cadastros/tipos-operacao`),
            fetchApiData(`${API_URL}/cadastros/contas/master`),
          ])
          setTiposOperacao(tiposData)
          setContasBancarias(contasData)
        })()
    }, [])

    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedFilters(filters);
        }, 500);

        return () => {
            clearTimeout(handler);
        };
    }, [filters]);

    useEffect(() => {
        ;(async () => {
          setLoading(true)
          setError(null)

          try {
            const params = new URLSearchParams()
            Object.entries(debouncedFilters).forEach(([k, v]) => v && params.append(k, v))
            params.append('diasVencimento', diasVencimento)

            const headers = getAuthHeader()
            const [saldosRes, metricsRes] = await Promise.all([
              fetch(`${API_URL}/dashboard/saldos?${params}`, { headers }),
              fetch(`${API_URL}/dashboard/metrics?${params}`, { headers }),
            ])
            if (!saldosRes.ok || !metricsRes.ok) {
              throw new Error('Falha ao buscar dados do dashboard.')
            }
            setSaldos(await saldosRes.json())
            setMetrics(await metricsRes.json())
          } catch (err) {
            setError(err.message)
          } finally {
            setLoading(false)
          }
        })()
    }, [debouncedFilters, diasVencimento])

    const handleFilterChange = (e) => {
        const { name, value } = e.target
        setFilters((prev) => ({
          ...prev,
          [name]: value,
          ...(name === 'clienteNome' && !value ? { clienteId: '' } : {}),
          ...(name === 'sacado' && !value ? { sacado: '' } : {}),
        }))
    }

    const handleAutocompleteSelect = (name, item) => {
        if (name === 'cliente') {
          setFilters((prev) => ({
            ...prev,
            clienteId: item?.id || '',
            clienteNome: item?.nome || '',
          }))
        } else {
          setFilters((prev) => ({ ...prev, sacado: item?.nome || '' }))
        }
    }

    const clearFilters = () =>
        setFilters({
          dataInicio: '',
          dataFim: '',
          tipoOperacaoId: '',
          clienteId: '',
          clienteNome: '',
          sacado: '',
          contaBancaria: '',
        })

    const totalGeral = saldos.reduce((sum, c) => sum + c.saldo, 0)
    
    if (!metrics) {
        return (
          <main className="min-h-screen pt-16 flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800">
            <p className="text-gray-400 text-xl">Carregando resumo...</p>
          </main>
        )
    }

    return (
        <main className="min-h-screen pt-16 p-6 bg-gradient-to-br from-gray-900 to-gray-800">
          <RelatorioModal
            isOpen={isRelatorioModalOpen}
            onClose={() => setIsRelatorioModalOpen(false)}
            tiposOperacao={tiposOperacao}
            fetchClientes={(q) =>
              fetchApiData(`${API_URL}/cadastros/clientes/search?nome=${q}`)
            }
            fetchSacados={(q) =>
              fetchApiData(`${API_URL}/cadastros/sacados/search?nome=${q}`)
            }
          />

          <motion.div
            className="max-w-7xl mx-auto space-y-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6 }}
          >
            <motion.header
              className="flex justify-between items-center mb-6 border-b-2 border-orange-500 pb-4"
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
            >
              <div>
                <h1 className="text-3xl font-bold text-gray-100">
                  Resumo da Carteira
                </h1>
                <p className="text-gray-300 mt-1">
                  Visão geral da sua operação financeira
                </p>
              </div>
              <button
                onClick={() => setIsRelatorioModalOpen(true)}
                className="border-2 border-orange-500 text-orange-500 font-semibold py-2 px-4 rounded-md hover:bg-orange-500 hover:text-white transition"
              >
                Imprimir Relatórios
              </button>
            </motion.header>

            <DashboardFiltros
              filters={filters}
              onFilterChange={handleFilterChange}
              onAutocompleteSelect={handleAutocompleteSelect}
              tiposOperacao={tiposOperacao}
              contasBancarias={contasBancarias}
              fetchClientes={(q) =>
                fetchApiData(`${API_URL}/cadastros/clientes/search?nome=${q}`)
              }
              fetchSacados={(q) =>
                fetchApiData(`${API_URL}/cadastros/sacados/search?nome=${q}`)
              }
              onClear={clearFilters}
            />

            {error && <div className="text-center py-4 text-red-500">{error}</div>}

            <div className={`transition-opacity duration-300 ${loading ? 'opacity-50' : 'opacity-100'}`}>
                <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {saldos.map((conta, index) => (
                    <motion.div
                      key={conta.contaBancaria}
                      className="p-4 rounded-lg shadow-lg transition border-l-4 bg-gray-700"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 * index }}
                      style={{
                        borderColor: conta.saldo < 0 ? '#ef4444' : '#f97316',
                      }}
                    >
                      <h3 className="text-sm font-medium text-gray-300 truncate">
                        {conta.contaBancaria}
                      </h3>
                      <p
                        className={`mt-2 text-2xl font-semibold ${
                          conta.saldo < 0 ? 'text-red-400' : 'text-gray-100'
                        }`}
                      >
                        {formatBRLNumber(conta.saldo)}
                      </p>
                    </motion.div>
                  ))}
                </section>

                <section className="mt-2 flex justify-center">
                    <motion.div
                        className="p-4 rounded-lg shadow-xl transition border-l-8 bg-gray-700 border-yellow-400 w-full max-w-sm text-center"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5 }}
                    >
                        <h3 className="text-lg font-medium text-gray-300">Total Geral</h3>
                        <p className={`mt-2 text-3xl font-semibold ${totalGeral < 0 ? 'text-red-400' : 'text-gray-100'}`}>
                            {formatBRLNumber(totalGeral)}
                        </p>
                    </motion.div>
                </section>
                
                <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-8">
                  {[
                    {
                      label: 'Juros Total',
                      value: metrics.totalJuros || 0,
                      icon: <FaDollarSign className="w-6 h-6 text-green-400" />,
                      border: 'border-l-4 border-green-400',
                    },
                    {
                      label: 'Despesas Totais',
                      value: metrics.totalDespesas || 0,
                      icon: <FaDollarSign className="w-6 h-6 text-red-400" />,
                      border: 'border-l-4 border-red-400',
                    },
                    {
                      label: 'Lucro Líquido',
                      value: metrics.lucroLiquido || 0,
                      icon: <FaClock className="w-6 h-6 text-yellow-300" />,
                      border: 'border-l-4 border-yellow-300',
                    },
                    {
                      label: 'Total Operado',
                      value: metrics.valorOperadoNoMes || 0,
                      icon: <FaChartLine className="w-6 h-6 text-gray-400" />,
                      border: 'border-l-4 border-gray-400',
                    },
                  ].map((item, idx) => (
                    <motion.div
                      key={item.label}
                      className={`p-4 rounded-lg shadow-lg transition bg-gray-700 ${item.border}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 + idx * 0.1 }}
                    >
                      <div className="flex items-center space-x-3">
                        {item.icon}
                        <div>
                          <p className="text-sm text-gray-300">{item.label}</p>
                          <p className="text-lg font-semibold text-gray-100">
                            {formatBRLNumber(item.value)}
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </section>

                <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-8">
                  <motion.div
                    className="p-6 rounded-lg shadow-lg transition bg-gray-700"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.8 }}
                  >
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-semibold text-gray-100">
                        Vencimentos Próximos
                      </h3>
                      <select
                        value={diasVencimento}
                        onChange={(e) => setDiasVencimento(Number(e.target.value))}
                        className="bg-gray-800 text-gray-200 border-gray-600 rounded-md p-1 text-sm focus:ring-orange-500 focus:border-orange-500"
                      >
                        <option value={5}>5 dias</option>
                        <option value={15}>15 dias</option>
                        <option value={30}>30 dias</option>
                      </select>
                    </div>
                    <div className="space-y-3 max-h-80 overflow-auto pr-2">
                      {metrics.vencimentosProximos?.length > 0 ? (
                        metrics.vencimentosProximos
                          .sort(
                            (a, b) =>
                              new Date(a.dataVencimento) -
                              new Date(b.dataVencimento)
                          )
                          .map((dup) => (
                            <div
                              key={dup.id}
                              className="flex justify-between items-center text-sm border-b border-gray-600 pb-2 last:border-none"
                            >
                              <div>
                                <p className="font-medium text-gray-200">
                                  {dup.clienteSacado}
                                </p>
                                <p className="text-xs text-gray-400">
                                  NF {dup.nfCte}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="font-semibold text-red-400">
                                  {formatDate(dup.dataVencimento)}
                                </p>
                                <p className="text-gray-300">
                                  {formatBRLNumber(dup.valorBruto)}
                                </p>
                              </div>
                            </div>
                          ))
                      ) : (
                        <p className="text-gray-400">
                          Nenhuma duplicata a vencer nos próximos {diasVencimento} dias.
                        </p>
                      )}
                    </div>
                  </motion.div>

                  <motion.div
                    className="lg:col-span-2 bg-gray-700 p-6 rounded-lg shadow-lg"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.9 }}
                  >
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-semibold text-gray-100">
                            {topFiveChartType === 'cedentes' ? 'Top 5 Cedentes por Valor' : 'Top 5 Sacados por Valor'}
                        </h3>
                        <div className="flex space-x-1 rounded-lg bg-gray-800 p-1 w-auto">
                            <button
                                onClick={() => setTopFiveChartType('cedentes')}
                                className={`px-4 py-1 text-sm font-medium rounded-md transition ${topFiveChartType === 'cedentes' ? 'bg-orange-500 text-white' : 'text-gray-300 hover:bg-gray-700'}`}
                            >
                                Cedentes
                            </button>
                            <button
                                onClick={() => setTopFiveChartType('sacados')}
                                className={`px-4 py-1 text-sm font-medium rounded-md transition ${topFiveChartType === 'sacados' ? 'bg-orange-500 text-white' : 'text-gray-300 hover:bg-gray-700'}`}
                            >
                                Sacados
                            </button>
                        </div>
                    </div>
                    
                    <TopFiveApex
                      data={topFiveChartType === 'cedentes' ? (metrics.topClientes || []) : (metrics.topSacados || [])}
                    />
                  </motion.div>
                </section>
            </div>
          </motion.div>
        </main>
    )
}