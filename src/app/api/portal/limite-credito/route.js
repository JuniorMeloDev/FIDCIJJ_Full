import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

export async function GET(request) {
  try {
    const token = request.headers.get('Authorization')?.split(' ')[1];
    if (!token) {
      return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const clienteId = decoded.cliente_id;
    if (!clienteId) {
      return NextResponse.json({ message: 'Usuário cliente sem empresa associada.' }, { status: 403 });
    }

    // Chama a função RPC do Supabase para obter os dados do limite de crédito
    const { data, error } = await supabase.rpc('get_limite_credito_cliente', {
      p_cliente_id: clienteId
    });

    if (error) {
      console.error('Erro ao chamar RPC get_limite_credito_cliente:', error);
      throw error;
    }

    // A função RPC retorna um array com um objeto, então pegamos o primeiro elemento
    const result = data[0] || { limite_total: 0, limite_utilizado: 0, limite_disponivel: 0 };

    return NextResponse.json(result, { status: 200 });

  } catch (error) {
    return NextResponse.json({ message: error.message || 'Erro interno do servidor' }, { status: 500 });
  }
}