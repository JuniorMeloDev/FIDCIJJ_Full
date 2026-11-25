import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { supabase } from '@/app/utils/supabaseClient';

export async function POST(request) {
  try {
    const token = request.headers.get('Authorization')?.split(' ')[1];
    if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    const usuario = jwt.verify(token, process.env.JWT_SECRET);
    if (!usuario.roles?.some((role) => ['ROLE_ADMIN', 'ROLE_USER'].includes(role))) {
      return NextResponse.json({ message: 'Acesso negado.' }, { status: 403 });
    }
    const { conta, transacoes, confirmar } = await request.json();
    if (typeof conta !== 'string' || !conta.trim() || typeof confirmar !== 'boolean'
      || !Array.isArray(transacoes) || transacoes.length === 0 || transacoes.length > 1000) {
      return NextResponse.json({ message: 'Dados de conciliação inválidos.' }, { status: 400 });
    }

    const ids = new Set();
    const transacoesNormalizadas = [];
    for (const transacao of transacoes) {
      const id = String(transacao?.id ?? '').trim();
      const data = String(transacao?.data ?? '').slice(0, 10);
      const dia = new Date(`${data}T00:00:00Z`);
      const valor = transacao?.valor;
      const movimentoId = transacao?.movimentoId ?? null;
      const duplicataId = transacao?.duplicataId ?? null;
      if (!id || ids.has(id) || !/^\d{4}-\d{2}-\d{2}$/.test(data)
        || !Number.isFinite(dia.getTime()) || dia.toISOString().slice(0, 10) !== data
        || !Number.isFinite(valor) || Math.abs(valor) >= 1e12
        || [movimentoId, duplicataId].some((id) => id !== null && (!Number.isSafeInteger(id) || id < 1))
        || (movimentoId !== null && duplicataId !== null)) {
        return NextResponse.json({ message: 'O extrato contém uma transação inválida ou repetida.' }, { status: 400 });
      }
      ids.add(id);
      transacoesNormalizadas.push({ id, data, valor, descricao: String(transacao.descricao ?? ''), movimentoId, duplicataId });
    }

    const { data, error } = await supabase.rpc('processar_conciliacao_ofx_com_titulos', {
      p_conta: conta,
      p_transacoes: transacoesNormalizadas,
      p_confirmar: confirmar,
    });
    if (error?.code === 'PGRST202') {
      return NextResponse.json({ message: 'A conciliação automática precisa ser atualizada no banco de dados.' }, { status: 503 });
    }
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
