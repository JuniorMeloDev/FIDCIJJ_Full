import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';
import { startOfMonth, endOfMonth, subMonths, format } from 'date-fns';

export async function GET(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const clienteId = decoded.cliente_id;
        if (!clienteId) {
            return NextResponse.json({ message: 'Usuário cliente sem empresa associada.' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const period = searchParams.get('period') || 'last_6_months';
        
        let startDate, endDate = new Date();
        const now = new Date();

        switch (period) {
            case 'current_month':
                startDate = startOfMonth(now);
                endDate = endOfMonth(now);
                break;
            case 'last_month':
                const lastMonth = subMonths(now, 1);
                startDate = startOfMonth(lastMonth);
                endDate = endOfMonth(lastMonth);
                break;
            case 'current_year':
                startDate = new Date(now.getFullYear(), 0, 1);
                endDate = new Date(now.getFullYear(), 11, 31);
                break;
            case 'last_6_months':
            default:
                startDate = startOfMonth(subMonths(now, 5));
                break;
        }
        
        const { data, error } = await supabase.rpc('get_maiores_sacados_cliente', {
            p_cliente_id: clienteId,
            p_start_date: format(startDate, 'yyyy-MM-dd'),
            p_end_date: format(endDate, 'yyyy-MM-dd')
        });

        if (error) {
            console.error('Erro RPC get_maiores_sacados_cliente:', error);
            throw error;
        }

        const formattedData = data.map(item => ({
            nome: item.nome,
            valorTotal: item.valor_total
        }));

        return NextResponse.json(formattedData, { status: 200 });
    } catch (error) {
        return NextResponse.json({ message: error.message || 'Erro interno do servidor' }, { status: 500 });
    }
}