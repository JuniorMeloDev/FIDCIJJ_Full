'use client'

import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList } from 'recharts';
import { formatBRLNumber } from '@/app/utils/formatters';

export default function TopFiveApex({ data = [] }) {
    if (!data || data.length === 0) {
        return (
            <div className="h-[308px] flex items-center justify-center">
                <p className="text-gray-400">Nenhum dado para exibir no período.</p>
            </div>
        );
    }

    // Para o gráfico vertical, não precisamos inverter os dados.
    // A API já os envia na ordem correta (do maior para o menor).
    const chartData = data.map(item => ({
        name: item.nome.length > 15 ? `${item.nome.substring(0, 13)}...` : item.nome,
        value: item.valorTotal,
    }));

    // Abrevia os valores para o eixo Y (vertical)
    const abbreviateValue = val => {
        if (val >= 1000000) return `R$${(val / 1000000).toFixed(1)}M`;
        if (val >= 1000) return `R$${Math.round(val / 1000)}k`;
        return `R$${val}`;
    };
    
    // Tooltip customizado para manter o estilo
    const CustomTooltip = ({ active, payload, label }) => {
        if (active && payload && payload.length) {
            // Busca o nome completo original para exibir no tooltip
            const originalName = data.find(d => d.nome.startsWith(label.substring(0, 13)))?.nome || label;
            return (
                <div className="bg-gray-600 p-2 border border-gray-500 rounded-md shadow-lg">
                    <p className="text-gray-200">{`${originalName} : ${formatBRLNumber(payload[0].value)}`}</p>
                </div>
            );
        }
        return null;
    };

    return (
        <ResponsiveContainer width="100%" height={308}>
            <BarChart
                data={chartData}
                margin={{ top: 30, right: 10, left: 10, bottom: 20 }} 
            >
                <XAxis 
                    dataKey="name" 
                    stroke="#9ca3af" 
                    fontSize={12} 
                    interval={0}
                    // Angula os nomes para evitar sobreposição
                    angle={-35}
                    textAnchor="end"
                    height={60} // Aumenta a altura para caber os nomes angulados
                />
                <YAxis 
                    stroke="#9ca3af" 
                    fontSize={12} 
                    tickFormatter={abbreviateValue}
                    axisLine={false}
                    tickLine={false}
                    width={80}
                />
                <Tooltip 
                    cursor={{ fill: 'rgba(255, 255, 255, 0.1)' }}
                    content={<CustomTooltip />}
                />
                <Bar 
                    dataKey="value" 
                    fill="#f97316" 
                    radius={[4, 4, 0, 0]} // Cantos superiores arredondados
                    barSize={50}
                >
                    {/* Posiciona o valor completo acima de cada barra */}
                    <LabelList 
                        dataKey="value" 
                        position="top" 
                        style={{ fill: '#d1d5db', fontSize: 12 }}
                        formatter={formatBRLNumber} 
                    />
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    );
}