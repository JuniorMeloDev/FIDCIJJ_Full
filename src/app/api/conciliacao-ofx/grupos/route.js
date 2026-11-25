import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { ehCobrancaAgrupadaOfx } from '@/app/lib/conciliacaoOfxAgrupada';
import { supabase } from '@/app/utils/supabaseClient';

function autenticar(request) {
  const token = request.headers.get('Authorization')?.split(' ')[1];
  try {
    const usuario = jwt.verify(token || '', process.env.JWT_SECRET);
    if (!usuario.roles?.some((role) => ['ROLE_ADMIN', 'ROLE_USER'].includes(role))) {
      return NextResponse.json({ message: 'Acesso negado.' }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ message: 'Não autorizado.' }, { status: 401 });
  }
  return null;
}

const inteiroPositivo = (value) => Number.isSafeInteger(value) && value > 0;

function responderErro(error) {
  if (error.code === 'PGRST202') {
    return NextResponse.json({ message: 'A validação de grupos OFX precisa ser atualizada no banco de dados.' }, { status: 503 });
  }
  if (error.code === 'P0001' || error.code === '23505') {
    const message = error.code === '23505' ? 'Este crédito do extrato já está registrado.' : error.message;
    return NextResponse.json({ message }, { status: 409 });
  }
  console.error('Erro na conciliação agrupada OFX:', error);
  return NextResponse.json({ message: 'Não foi possível processar a conciliação agrupada.' }, { status: 500 });
}

export async function POST(request) {
  const erroAuth = autenticar(request);
  if (erroAuth) return erroAuth;

  const { conta, transacao, titulos } = await request.json().catch(() => ({})) || {};
  const fitid = String(transacao?.id ?? '').trim();
  const dia = String(transacao?.data ?? '').slice(0, 10);
  const data = new Date(`${dia}T00:00:00Z`);
  const centavos = Math.round(transacao?.valor * 100);
  if (typeof conta !== 'string' || !conta.trim() || !fitid
    || !ehCobrancaAgrupadaOfx(transacao?.descricao) || !Number.isFinite(transacao?.valor)
    || !inteiroPositivo(centavos) || centavos >= 1e14
    || !/^\d{4}-\d{2}-\d{2}$/.test(dia) || !Number.isFinite(data.getTime()) || data.toISOString().slice(0, 10) !== dia
    || !Array.isArray(titulos) || titulos.length < 2 || titulos.length > 1000
    || titulos.some((item) => !inteiroPositivo(item?.id) || !inteiroPositivo(item?.centavos))
    || new Set(titulos.map((item) => item.id)).size !== titulos.length
    || titulos.reduce((soma, item) => soma + item.centavos, 0) !== centavos) {
    return NextResponse.json({ message: 'Confira o crédito e os valores das NFs selecionadas.' }, { status: 400 });
  }

  const { data: movimentoId, error } = await supabase.rpc('conciliar_ofx_grupo', {
    p_conta: conta,
    p_fitid: fitid,
    p_data: dia,
    p_valor: centavos / 100,
    p_titulos: titulos.map(({ id, centavos }) => ({ id, centavos })),
  });
  if (error) return responderErro(error);
  return NextResponse.json({ movimentoId });
}

export async function DELETE(request) {
  const erroAuth = autenticar(request);
  if (erroAuth) return erroAuth;

  const { movimentoId } = await request.json().catch(() => ({})) || {};
  if (!inteiroPositivo(movimentoId)) {
    return NextResponse.json({ message: 'Informe o recebimento agrupado.' }, { status: 400 });
  }

  const { error } = await supabase.rpc('estornar_conciliacao_ofx_grupo', { p_movimento_id: movimentoId });
  if (error) return responderErro(error);
  return new NextResponse(null, { status: 204 });
}
