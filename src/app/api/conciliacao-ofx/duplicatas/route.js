import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { supabase } from '@/app/utils/supabaseClient';

function authorized(request) {
  const token = request.headers.get('Authorization')?.split(' ')[1];
  if (!token) return false;
  try { jwt.verify(token, process.env.JWT_SECRET); return true; } catch { return false; }
}

export async function GET(request) {
  if (!authorized(request)) return NextResponse.json({ message: 'Não autorizado.' }, { status: 401 });
  const duplicatas = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('duplicatas')
      .select('id,nf_cte,cliente_sacado,valor_bruto,valor_juros,data_vencimento,status_recebimento,operacao:operacoes!inner(status,juros_pre_fixado,valor_total_bruto,valor_liquido,valor_total_juros,valor_total_descontos,tipo_operacao:tipos_operacao(juros_pre_fixado))')
      .eq('status_recebimento', 'Pendente').eq('operacao.status', 'Aprovada')
      .order('id').range(from, from + 999);
    if (error) return NextResponse.json({ message: 'Falha ao consultar duplicatas.' }, { status: 500 });
    duplicatas.push(...data);
    if (data.length < 1000) break;
  }
  return NextResponse.json({ duplicatas });
}

export async function POST(request) {
  if (!authorized(request)) return NextResponse.json({ message: 'Não autorizado.' }, { status: 401 });
  try {
    const { conta, transacao, duplicataId } = await request.json();
    if (!conta || !transacao?.id || !transacao?.data || !Number.isInteger(Number(duplicataId))) {
      return NextResponse.json({ message: 'Dados incompletos.' }, { status: 400 });
    }
    const { data, error } = await supabase.rpc('conciliar_ofx_duplicata', {
      p_conta: conta,
      p_fitid: String(transacao.id),
      p_data: transacao.data.slice(0, 10),
      p_valor: Number(transacao.valor),
      p_duplicata_id: Number(duplicataId),
    });
    if (error) return NextResponse.json({ message: error.message }, { status: 409 });
    return NextResponse.json({ movimentoId: data });
  } catch (error) {
    return NextResponse.json({ message: error.message || 'Falha na conciliação.' }, { status: 400 });
  }
}
