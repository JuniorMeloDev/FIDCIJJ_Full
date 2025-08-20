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
                    <p className="text-gray-200">{`${originalName} : ${formatBRLNumber(payload(0).value)}`}</p>
                </div>
            );
        }
        return null;
    };

    const useVerticalLayout = data.length >= 10;

    const xAxisProps = {
        dataKey: "name",
        stroke: "#9ca3af",
        fontSize: 12,
        interval: 0,
        angle: -35,
        textAnchor: "end",
        height: 60,
    };

    const yAxisProps = {
        stroke: "#9ca3af",
        fontSize: 12,
        tickFormatter: abbreviateValue,
        axisLine: false,
        tickLine: false,
        width: 80,
        // Aplica a orientação vertical aos valores se necessário
        orientation: useVerticalLayout ? 'left' : 'top',
        tick: useVerticalLayout ? { angle: -90, position: 'insideLeft' } : {},
    };

    const chartMargin = {
        top: 30,
        right: 10,
        left: useVerticalLayout ? 80 : 10, // Aumenta a margem esquerda para valores verticais
        bottom: 20,
    };

    return (
        <ResponsiveContainer width="100%" height={350}>
            <BarChart
                data={chartData}
                margin={chartMargin}
            >
                <XAxis {...xAxisProps} />
                <YAxis {...yAxisProps} />
                <Tooltip
                    cursor={{ fill: 'rgba(255, 255, 255, 0.1)' }}
                    content={<CustomTooltip />}
                />
                <Bar
                    dataKey="value"
                    fill="#f97316"
                    radius={[4, 4, 0, 0]}
                    barSize={useVerticalLayout ? 30 : 50}
                >
                    <LabelList
                        dataKey="value"
                        position={useVerticalLayout ? 'left' : 'top'}
                        style={{ fill: '#d1d5db', fontSize: 12, ... (useVerticalLayout && { textAnchor: 'end', dy: -10, dx: -5 }) }}
                        formatter={formatBRLNumber}
                    />
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    );
}