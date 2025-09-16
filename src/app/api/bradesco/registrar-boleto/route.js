import { NextResponse } from 'next/server';
import { getBradescoAccessToken, registrarBoleto } from '@/app/lib/bradescoService';

export async function POST(request) {
  try {
    const dadosBoleto = await request.json();

    // Verifica se todos os campos obrigatórios chegaram
    if (
      !dadosBoleto?.registraTitulo?.pagador ||
      !dadosBoleto.filialCPFCNPJ ||
      !dadosBoleto.ctrlCPFCNPJ ||
      !dadosBoleto.codigoUsuarioSolicitante
    ) {
      return NextResponse.json(
        { message: 'Campos obrigatórios do boleto ausentes.' },
        { status: 400 }
      );
    }

    const tokenData = await getBradescoAccessToken();
    const accessToken = tokenData.access_token;

    const resultado = await registrarBoleto(accessToken, dadosBoleto);
    return NextResponse.json(resultado);

  } catch (err) {
    console.error('Erro no registro de boleto:', err);
    return NextResponse.json(
      { message: err.message || 'Erro interno ao registrar boleto.' },
      { status: 500 }
    );
  }
}
