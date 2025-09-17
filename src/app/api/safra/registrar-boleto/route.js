import { NextResponse } from 'next/server';
import { getSafraAccessToken, registrarBoletoSafra } from '@/app/lib/safraService';

export async function POST(request) {
  try {
    const dadosBoleto = await request.json();

    if (!dadosBoleto?.documento?.pagador) {
      return NextResponse.json({ message: 'Dados do boleto incompletos.' }, { status: 400 });
    }

    const tokenData = await getSafraAccessToken();
    const accessToken = tokenData.access_token;

    const resultado = await registrarBoletoSafra(accessToken, dadosBoleto);
    return NextResponse.json(resultado);

  } catch (err) {
    console.error('Erro no registro de boleto Safra:', err);
    return NextResponse.json({ message: err.message || 'Erro interno ao registrar boleto.' }, { status: 500 });
  }
}