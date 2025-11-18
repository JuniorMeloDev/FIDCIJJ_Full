import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

export async function GET(request) {
  try {
    const token = request.headers.get('Authorization')?.split(' ')[1];
    if (!token) {
      return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    }

    let clienteId;
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      clienteId = decoded.cliente_id;
    } catch (e) {
      return NextResponse.json({ message: 'Token inválido' }, { status: 401 });
    }

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
      console.error('Erro ao buscar limite de crédito:', clienteError);
      throw new Error('Não foi possível buscar os dados de limite de crédito.');
    }

    const limite_total = Number(clienteData?.limite_credito || 0);

    // 2. Buscar duplicatas para cálculo do limite utilizado
    // CORREÇÃO: Usando 'valor_bruto' em vez de 'valor'
    const { data: duplicatasPendentes, error: duplicatasError } = await supabase
      .from('duplicatas')
      .select(`
        valor_bruto,
        status_recebimento,
        operacoes!inner (
          cliente_id,
          status
        )
      `)
      .eq('operacoes.cliente_id', clienteId)
      .eq('operacoes.status', 'Aprovada') 
      .eq('status_recebimento', 'Pendente'); 

    if (duplicatasError) {
      console.error('Erro ao buscar duplicatas:', duplicatasError);
      throw new Error('Não foi possível calcular o limite utilizado.');
    }

    // 3. Calcular Soma usando 'valor_bruto'
    const limite_utilizado = duplicatasPendentes.reduce((sum, dup) => {
        return sum + Number(dup.valor_bruto || 0);
    }, 0);

    // 4. Resultado Final
    const limite_disponivel = limite_total - limite_utilizado;

    return NextResponse.json({
      limite_total,
      limite_utilizado,
      limite_disponivel,
    }, { status: 200 });

  } catch (error) {
    console.error('Erro API Limite Credito:', error);
    return NextResponse.json({ message: error.message || 'Erro interno do servidor' }, { status: 500 });
  }
}