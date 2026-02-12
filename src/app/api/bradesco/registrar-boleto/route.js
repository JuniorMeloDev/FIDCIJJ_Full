import { NextResponse } from 'next/server';
import { getBradescoAccessToken, registrarBoleto } from '@/app/lib/bradescoService';

export async function POST(request) {
  try {
    const dadosBoleto = await request.json();

    if (
      !dadosBoleto?.nomePagador ||
      !dadosBoleto?.nuCpfcnpjPagador ||
      !dadosBoleto?.dtVencimentoTitulo ||
      !dadosBoleto?.vlNominalTitulo ||
      !dadosBoleto?.nuNegociacao ||
      !dadosBoleto?.idProduto ||
      !dadosBoleto?.filialCPFCNPJ ||
      !dadosBoleto?.ctrlCPFCNPJ ||
      !dadosBoleto?.nuCPFCNPJ ||
      !dadosBoleto?.codigoUsuarioSolicitante
    ) {
      return NextResponse.json(
        { message: 'Campos obrigatorios do boleto Bradesco ausentes.' },
        { status: 400 }
      );
    }

    const tokenData = await getBradescoAccessToken();
    const accessToken = tokenData.access_token;

    const resultado = await registrarBoleto(accessToken, dadosBoleto);
    return NextResponse.json(resultado);
  } catch (err) {
    console.error('Erro no registro de boleto Bradesco:', err);
    return NextResponse.json(
      { message: err.message || 'Erro interno ao registrar boleto.' },
      { status: 500 }
    );
  }
}
