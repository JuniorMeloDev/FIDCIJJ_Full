import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';
import { format } from 'date-fns';

export async function GET(request) {
    try {
    
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);


        const { searchParams } = new URL(request.url);
        const defaultEndDate = new Date();
        const defaultStartDate = new Date(defaultEndDate.getFullYear(), defaultEndDate.getMonth(), 1);
        const dataInicio = searchParams.get('dataInicio') || format(defaultStartDate, 'yyyy-MM-dd');
        const dataFim = searchParams.get('dataFim') || format(defaultEndDate, 'yyyy-MM-dd');

        const [valorOperadoRes, topClientesRes, topSacadosRes] = await Promise.all([
            supabase.rpc('get_valor_operado', { data_inicio: dataInicio, data_fim: dataFim }),
            supabase.rpc('get_top_clientes', { data_inicio: dataInicio, data_fim: dataFim }),
            supabase.rpc('get_top_sacados', { data_inicio: dataInicio, data_fim: dataFim }),
        ]);

        const metrics = {
            valorOperadoNoMes: valorOperadoRes.data || 0,
            topClientes: topClientesRes.data || [],
            topSacados: topSacadosRes.data || [],
        };

        return NextResponse.json(metrics, { status: 200 });
    } catch (error) {
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            return NextResponse.json({ message: 'Token inválido ou expirado' }, { status: 403 });
        }
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}