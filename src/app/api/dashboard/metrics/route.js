import { NextResponse } from 'next/server';
import { supabase } from '../../../utils/supabaseClient';
import jwt from 'jsonwebtoken';

export async function GET(request) {
    // Validação do token (importante para segurança)
    try {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        }
        const token = authHeader.substring(7);
        jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
        return NextResponse.json({ message: 'Token inválido' }, { status: 403 });
    }

    // Lógica para buscar as métricas (por enquanto, dados de exemplo)
    const mockMetrics = {
        valorOperadoNoMes: 150000.75,
        topClientes: [],
        topSacados: [],
        vencimentosProximos: [],
        totalJuros: 25000.50,
        totalDespesas: 7500.25,
        lucroLiquido: 17500.25,
    };

    return NextResponse.json(mockMetrics, { status: 200 });
}