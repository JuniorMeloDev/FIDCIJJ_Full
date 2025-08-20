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

    const chartData = data.map(item => ({
        name: item.nome.length > 15 ? `${item.nome.substring(0, 13)}...` : item.nome,
        value: item.valorTotal,
    }));

    const abbreviateValue = val => {
        if (val >= 1000000) return `R$${(val / 1000000).toFixed(1)}M`;
        if (val >= 1000) return `R$${Math.round(val / 1000)}k`;
        return `R$${val}`;
    };
    
    const CustomTooltip = ({ active, payload, label }) => {
        if (active && payload && payload.length) {
            const originalName = data.find(d => d.nome.startsWith(label.substring(0, 13)))?.nome || label;
            return (
                <div className="bg-gray-600 p-2 border border-gray-500 rounded-md shadow-lg">
                    <p className="text-gray-200">{`${originalName} : ${formatBRLNumber(payload[0].value)}`}</p>
                </div>
            );
        }
        return null;
    };

    // --- MODIFICAÇÃO APLICADA AQUI ---
    // Verifica se a quantidade de itens é grande o suficiente para justificar o layout vertical.
    const useVerticalLayout = data.length >= 10;

    const xAxisProps = {
        dataKey: "name", 
        stroke: "#9ca3af", 
        fontSize: 12, 
        interval: 0,
        // Altera o ângulo e a altura com base na quantidade de itens
        angle: useVerticalLayout ? -90 : -35,
        textAnchor: "end",
        height: useVerticalLayout ? 100 : 60, // Aumenta a altura para os rótulos verticais
    };
    
    const chartMargin = { 
        top: 30, 
        right: 10, 
        left: 10, 
        // Aumenta a margem inferior para dar espaço aos rótulos verticais
        bottom: useVerticalLayout ? 50 : 20 
    };

    return (
        <ResponsiveContainer width="100%" height={350}>
            <BarChart
                data={chartData}
                margin={chartMargin} 
            >
                <XAxis {...xAxisProps} />
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
                    radius={[4, 4, 0, 0]}
                    barSize={ useVerticalLayout ? 30 : 50 } // Diminui a largura da barra para caber mais itens
                >
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