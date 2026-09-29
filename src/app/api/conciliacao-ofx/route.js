import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { supabase } from '@/app/utils/supabaseClient';

export async function POST(request) {
  try {
    const token = request.headers.get('Authorization')?.split(' ')[1];
    if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    jwt.verify(token, process.env.JWT_SECRET);
    const { conta, transacoes } = await request.json();
    if (typeof conta !== 'string' || !Array.isArray(transacoes) || transacoes.length > 1000) {
      return NextResponse.json({ message: 'Dados de conciliação inválidos.' }, { status: 400 });
    }
    const { data, error } = await supabase.rpc('conciliar_ofx_automaticamente', {
      p_conta: conta,
      p_transacoes: transacoes.map(({ id, data, valor }) => ({ id, data, valor })),
    });
    if (error) throw error;
    return NextResponse.json({ resultados: data });
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return NextResponse.json({ message: 'Token inválido.' }, { status: 401 });
    }
    console.error('Erro na conciliação OFX:', error);
    return NextResponse.json({ message: 'Não foi possível conciliar o extrato.' }, { status: 500 });
  }
}
