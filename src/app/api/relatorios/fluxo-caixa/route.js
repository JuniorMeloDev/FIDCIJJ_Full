import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseServerClient';
import jwt from 'jsonwebtoken';

export async function GET(request) {
    try {

        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);
   

        const { searchParams } = new URL(request.url);
        let query = supabase.from('movimentacoes_caixa').select('*');

        if (searchParams.get('dataInicio')) query = query.gte('data_movimento', searchParams.get('dataInicio'));
        if (searchParams.get('dataFim')) query = query.lte('data_movimento', searchParams.get('dataFim'));
        if (searchParams.get('conta')) query = query.eq('conta_bancaria', searchParams.get('conta'));
        if (searchParams.get('categoria') && searchParams.get('categoria') !== 'Todos') {
             query = query.eq('categoria', searchParams.get('categoria'));
        }
        if (searchParams.get('tipoValor') === 'credito') query = query.gt('valor', 0);
        if (searchParams.get('tipoValor') === 'debito') query = query.lt('valor', 0);
        
        const { data, error } = await query.order('data_movimento', { ascending: true });
        if (error) throw error;
        return NextResponse.json(data, { status: 200 });
    } catch (error) {
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            return NextResponse.json({ message: 'Token inválido ou expirado' }, { status: 403 });
        }
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}