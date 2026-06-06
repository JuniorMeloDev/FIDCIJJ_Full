import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import {
  findRepeatedValues,
  formatDuplicataConflictMessage,
  queryDuplicatasByIdentifiers,
} from '@/app/lib/duplicataGuard';
import { supabase } from '@/app/utils/supabaseClient';

export async function POST(request) {
  try {
    const token = request.headers.get('Authorization')?.split(' ')[1];
    if (!token) {
      return NextResponse.json({ message: 'Nao autorizado' }, { status: 401 });
    }

    jwt.verify(token, process.env.JWT_SECRET);

    const body = await request.json();
    const nfCtes = Array.isArray(body?.nfCtes) ? body.nfCtes : [];
    const excludeOperacaoId = body?.excludeOperacaoId ?? null;

    if (nfCtes.length === 0) {
      return NextResponse.json({ message: 'Nenhum documento informado.' }, { status: 400 });
    }

    const repeatedInPayload = findRepeatedValues(nfCtes);
    const conflicts = await queryDuplicatasByIdentifiers(supabase, nfCtes, excludeOperacaoId);

    return NextResponse.json({
      ok: conflicts.length === 0 && repeatedInPayload.length === 0,
      conflicts,
      repeatedInPayload,
      message: formatDuplicataConflictMessage(conflicts, repeatedInPayload),
    });
  } catch (error) {
    console.error('Erro ao verificar duplicidade de NF/CT-e:', error);
    return NextResponse.json(
      { message: error.message || 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
