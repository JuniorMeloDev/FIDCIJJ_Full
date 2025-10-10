import { NextResponse } from 'next/server';
import { getInterAccessToken, consultarChavePixInter } from '@/app/lib/interService';

export async function POST(request) {
  try {
    const { chavePix, contaCorrente } = await request.json();

    if (!chavePix || !contaCorrente) {
      return NextResponse.json({ message: 'Chave PIX e conta corrente são obrigatórias.' }, { status: 400 });
    }

    const tokenData = await getInterAccessToken();
    const resultado = await consultarChavePixInter(tokenData.access_token, chavePix, contaCorrente);

    return NextResponse.json(resultado);
  } catch (err) {
    console.error('Erro na API de consulta de chave PIX Inter:', err);
    return NextResponse.json({ message: err.message }, { status: 500 });
  }
}
