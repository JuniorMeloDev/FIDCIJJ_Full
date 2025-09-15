// src/app/api/bradesco/registrar-boleto/route.js

import { NextResponse } from 'next/server';
import { getBradescoAccessToken, registrarBoleto } from '@/app/lib/bradescoService';

export async function POST(request) {
  try {
    const dadosBoleto = await request.json();

    // ✅ Validação corrigida:
    // Garante que existe o objeto registraTitulo e que ele contém pagador
    if (
      !dadosBoleto ||
      !dadosBoleto.registraTitulo ||
      !dadosBoleto.registraTitulo.pagador
    ) {
      return NextResponse.json(
        { message: 'Dados do boleto, incluindo pagador, são obrigatórios.' },
        { status: 400 }
      );
    }

    // 1. Obtém um novo token de acesso no Bradesco
    const tokenData = await getBradescoAccessToken();
    const accessToken = tokenData.access_token;

    // 2. Chama a função de registro de boleto passando o token e o payload recebido
    const resultadoRegistro = await registrarBoleto(accessToken, dadosBoleto);

    // 3. Retorna para o front o resultado do Bradesco (linha digitável, código de barras etc.)
    return NextResponse.json(resultadoRegistro);

  } catch (error) {
    // Log detalhado para depuração (pega eventuais detalhes de resposta da API do Bradesco)
    console.error(
      'Erro no processo de registro de boleto:',
      error.response?.data || error
    );

    return NextResponse.json(
      { message: error.message || 'Erro interno ao registrar boleto.' },
      { status: 500 }
    );
  }
}
