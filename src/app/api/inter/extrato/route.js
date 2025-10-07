import { NextResponse } from 'next/server';
import { getInterAccessToken, consultarExtratoInter } from '@/app/lib/interService';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const contaCorrente = searchParams.get('contaCorrente');
    const dataInicio = searchParams.get('dataInicio');
    const dataFim = searchParams.get('dataFim');
    
    if (!contaCorrente || !dataInicio || !dataFim) {
        return NextResponse.json({ message: 'Conta corrente, data de início e data de fim são obrigatórios.' }, { status: 400 });
    }

    const tokenData = await getInterAccessToken();
    const extrato = await consultarExtratoInter(tokenData.access_token, contaCorrente, dataInicio, dataFim);

    return NextResponse.json(extrato);

  } catch (err) {
    console.error('[ERRO API EXTRATO INTER]', err);
    return NextResponse.json({ message: err.message || 'Erro interno ao buscar extrato.' }, { status: 500 });
  }
}