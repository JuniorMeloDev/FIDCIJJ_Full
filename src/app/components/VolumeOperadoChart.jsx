'use client';

import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { formatBRLNumber } from '@/app/utils/formatters';

const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-gray-600 p-3 border border-gray-500 rounded-md shadow-lg">
                <p className="font-bold text-gray-100">{label}</p>
                <p className="text-orange-400">{`Valor: ${formatBRLNumber(payload[0].value)}`}</p>
            </div>
        );
    }
    return null;
};

const formatAxis = (value) => {
    if (value >= 1000000) return `R$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `R$${Math.round(value / 1000)}k`;
    return formatBRLNumber(value);
};

export default function VolumeOperadoChart({ data = [] }) {
    if (!data || data.length === 0) {
        return (
            <div className="h-[250px] flex items-center justify-center">
                <p className="text-gray-400">Nenhum dado de volume para o período selecionado.</p>
            </div>
        );
    }

    return (
        <ResponsiveContainer width="100%" height={250}>
            <BarChart data={data} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                <XAxis dataKey="mes" stroke="#9ca3af" fontSize={12} />
                <YAxis stroke="#9ca3af" fontSize={12} tickFormatter={formatAxis} />
                <Tooltip cursor={{ fill: 'rgba(255, 255, 255, 0.1)' }} content={<CustomTooltip />} />
                <Bar dataKey="total" name="Volume" fill="#f97316" radius={[4, 4, 0, 0]} />
            </BarChart>
        </ResponsiveContainer>
    );
}