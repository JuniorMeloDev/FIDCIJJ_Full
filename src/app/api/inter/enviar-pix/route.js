import { NextResponse } from 'next/server';
import { getInterAccessToken, enviarPixInter } from '@/app/lib/interService';

export async function POST(request) {
  try {
    const { dadosPix, contaCorrente } = await request.json();

    if (!dadosPix || !contaCorrente) {
      return NextResponse.json({ message: 'Dados do PIX e conta corrente são obrigatórios.' }, { status: 400 });
    }

    const tokenData = await getInterAccessToken();
    const resultado = await enviarPixInter(tokenData.access_token, dadosPix, contaCorrente);

    return NextResponse.json(resultado);

  } catch (err) {
    console.error('Erro na API de envio de PIX Inter:', err);
    return NextResponse.json({ message: err.message }, { status: 500 });
  }
}