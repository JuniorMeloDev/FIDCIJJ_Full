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

    // 1. Buscar o limite de crédito total do cliente
    const { data: clienteData, error: clienteError } = await supabase
      .from('clientes')
      .select('limite_credito')
      .eq('id', clienteId)
      .single();

    if (clienteError) {
      console.error('Erro ao buscar limite de crédito do cliente:', clienteError);
      throw new Error('Não foi possível buscar os dados de limite de crédito.');
    }

    const limite_total = clienteData?.limite_credito || 0;

    // 2. Calcular o limite utilizado somando as duplicatas pendentes
    const { data: duplicatasPendentes, error: duplicatasError } = await supabase
      .from('duplicatas')
      .select('valor_bruto, operacao:operacoes!inner(cliente_id)')
      .eq('operacao.cliente_id', clienteId)
      .eq('status_recebimento', 'Pendente');
    
    if (duplicatasError) {
      console.error('Erro ao buscar duplicatas pendentes:', duplicatasError);
      throw new Error('Não foi possível calcular o limite utilizado.');
    }

    const limite_utilizado = duplicatasPendentes.reduce((sum, dup) => sum + dup.valor_bruto, 0);

    // 3. Calcular o limite disponível
    const limite_disponivel = limite_total - limite_utilizado;

    const result = {
      limite_total,
      limite_utilizado,
      limite_disponivel,
    };

    return NextResponse.json(result, { status: 200 });

  } catch (error) {
    return NextResponse.json({ message: error.message || 'Erro interno do servidor' }, { status: 500 });
  }
}