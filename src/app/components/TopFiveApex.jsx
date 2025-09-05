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
        name: item.nome.split(" ")[0],
        value: item.valorTotal,
        fullName: item.nome
    }));

    const abbreviateValue = val => {
        if (val >= 1000000) return `R$${(val / 1000000).toFixed(1)}M`;
        if (val >= 1000) return `R$${Math.round(val / 1000)}k`;
        return `R$${val}`;
    };

    const CustomTooltip = ({ active, payload }) => {
        if (active && payload && payload.length) {
            const fullName = payload[0].payload.fullName;
            return (
                <div className="bg-gray-600 p-2 border border-gray-500 rounded-md shadow-lg">
                    <p className="text-gray-200">{`${fullName} : ${formatBRLNumber(payload[0].value)}`}</p>
                </div>
            );
        }
        return null;
    };

    const isManyItems = data.length > 5;

    return (
        <ResponsiveContainer width="100%" height={isManyItems ? 400 : 308}>
            <BarChart
                data={chartData}
                layout={isManyItems ? "vertical" : "horizontal"}
                margin={{ top: 20, right: 20, left: 20, bottom: 20 }}
                barSize={isManyItems ? 25 : 50}
            >
                {isManyItems ? (
                    <>
                        <XAxis 
                            type="number" 
                            stroke="#9ca3af" 
                            fontSize={12} 
                            tickFormatter={abbreviateValue}
                            axisLine={false}
                            tickLine={false}
                            /* CORREÇÃO: Estende o eixo em 20% para dar espaço ao texto */
                            domain={[0, dataMax => dataMax * 1.2]} 
                        />
                        <YAxis 
                            type="category" 
                            dataKey="name" 
                            stroke="#9ca3af" 
                            fontSize={12} 
                            width={120} 
                            interval={0}
                        />
                    </>
                ) : (
                    <>
                        <XAxis 
                            dataKey="name" 
                            stroke="#9ca3af" 
                            fontSize={12} 
                            interval={0}
                            angle={-35}
                            textAnchor="end"
                            height={60}
                        />
                        <YAxis 
                            stroke="#9ca3af" 
                            fontSize={12} 
                            tickFormatter={abbreviateValue}
                            axisLine={false}
                            tickLine={false}
                            width={80}
                        />
                    </>
                )}

                <Tooltip 
                    cursor={{ fill: 'rgba(255, 255, 255, 0.1)' }}
                    content={<CustomTooltip />}
                />
                <Bar 
                    dataKey="value" 
                    fill="#f97316" 
                    radius={isManyItems ? [0, 4, 4, 0] : [4, 4, 0, 0]}
                >
                    <LabelList 
                        dataKey="value" 
                        position={isManyItems ? "right" : "top"}
                        style={{ fill: '#d1d5db', fontSize: 12 }}
                        formatter={formatBRLNumber}
                    />
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    );
}