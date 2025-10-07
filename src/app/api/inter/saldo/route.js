import { NextResponse } from 'next/server';
import { getInterAccessToken, consultarSaldoInter } from '@/app/lib/interService';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const contaCorrente = searchParams.get('contaCorrente');
    
    if (!contaCorrente) {
        return NextResponse.json({ message: 'O número da conta corrente é obrigatório.' }, { status: 400 });
    }

    const tokenData = await getInterAccessToken();
    const saldo = await consultarSaldoInter(tokenData.access_token, contaCorrente);

    return NextResponse.json(saldo);

  } catch (err) {
    console.error('[ERRO API SALDO INTER]', err);
    return NextResponse.json({ message: err.message || 'Erro interno ao buscar saldo.' }, { status: 500 });
  }
}