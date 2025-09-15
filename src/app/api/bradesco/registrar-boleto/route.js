
import { NextResponse } from 'next/server';
import { getBradescoAccessToken, registrarBoleto } from '@/app/lib/bradescoService';

export async function POST(request) {
    try {
        const dadosBoleto = await request.json();

        if (!dadosBoleto || !dadosBoleto.pagador) {
            return NextResponse.json({ message: 'Dados do boleto, incluindo pagador, são obrigatórios.' }, { status: 400 });
        }

        console.log("Payload recebido do frontend para enviar ao Bradesco:", JSON.stringify(dadosBoleto, null, 2));


        // 1. Obtém um novo token de acesso
        const tokenData = await getBradescoAccessToken();
        const accessToken = tokenData.access_token;

        // 2. Chama a função de registro de boleto com o token e os dados
        const resultadoRegistro = await registrarBoleto(accessToken, dadosBoleto);

        // A resposta de sucesso do Bradesco geralmente contém a linha digitável, código de barras, etc.
        return NextResponse.json(resultadoRegistro);

    } catch (error) {
        console.error("Erro no processo de registro de boleto:", error);
        return NextResponse.json(
            { message: error.message || 'Erro interno ao registrar boleto.' },
            { status: 500 }
        );
    }
}