import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';
import { format } from 'date-fns';

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

    const { searchParams } = new URL(request.url);
    const diasVencimento = parseInt(searchParams.get('diasVencimento') || '5', 10);

    const hoje = new Date();
    const dataLimite = new Date();
    dataLimite.setDate(hoje.getDate() + diasVencimento);

    // --- CORREÇÃO AQUI ---
    // A consulta foi ajustada para filtrar corretamente as duplicatas
    // com base no cliente_id que está na tabela 'operacoes'.
    const { data, error } = await supabase
      .from('duplicatas')
      .select(`
        id, 
        nf_cte, 
        data_vencimento, 
        valor_bruto, 
        cliente_sacado,
        operacao:operacoes!inner(cliente_id)
      `)
      .eq('operacao.cliente_id', clienteId)
      .eq('status_recebimento', 'Pendente')
      .lte('data_vencimento', format(dataLimite, 'yyyy-MM-dd'))
      .order('data_vencimento', { ascending: true });

    if (error) {
      console.error('Erro ao buscar vencimentos do cliente:', error);
      throw error;
    }

    return NextResponse.json(data, { status: 200 });

  } catch (error) {
    return NextResponse.json({ message: error.message || 'Erro interno do servidor' }, { status: 500 });
  }
}