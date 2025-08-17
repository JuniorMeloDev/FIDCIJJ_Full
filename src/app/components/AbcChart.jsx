'use client';

import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, Line } from 'recharts';
import { formatBRLForAxis } from '@/app/utils/formatters';

const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-gray-700 p-3 border border-gray-600 rounded-md shadow-lg text-white">
                <p className="font-bold">{label}</p>
                <p className="text-orange-400">{`Valor: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(payload[0].value)}`}</p>
                <p className="text-cyan-400">{`Acumulado: ${payload[1].value.toFixed(2)}%`}</p>
            </div>
        );
    }
    return null;
};

export default function AbcChart({ data }) {
    if (!data || data.length === 0) {
        return <p className="text-center text-gray-400">Sem dados para exibir.</p>;
    }

    // A Curva ABC precisa de um eixo Y duplo
    return (
        <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                <XAxis dataKey="name" stroke="#9ca3af" fontSize={12} />
                <YAxis yAxisId="left" stroke="#9ca3af" fontSize={12} tickFormatter={formatBRLForAxis} />
                <YAxis yAxisId="right" orientation="right" stroke="#06b6d4" fontSize={12} tickFormatter={(value) => `${value}%`} />
                <Tooltip content={<CustomTooltip />} />
                <Legend verticalAlign="top" height={36} />
                <Bar yAxisId="left" dataKey="valor" name="Valor" fill="#f97316" />
                <Line yAxisId="right" type="monotone" dataKey="acumulado" name="% Acumulado" stroke="#06b6d4" strokeWidth={2} dot={{ r: 4 }} />
            </BarChart>
        </ResponsiveContainer>
    );
}