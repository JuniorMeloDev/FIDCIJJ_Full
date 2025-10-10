import { NextResponse } from 'next/server';
import { getInterAccessToken, simularPixInter } from '@/app/lib/interService';

export async function POST(request) {
  try {
    const { dadosPix, contaCorrente } = await request.json();

    if (!dadosPix || !contaCorrente) {
      return NextResponse.json({ message: 'Dados do PIX e conta corrente são obrigatórios.' }, { status: 400 });
    }

    const tokenData = await getInterAccessToken();

    console.log("[LOG PIX] Simulando PIX para validar dados do favorecido...");
    const resultado = await simularPixInter(tokenData.access_token, dadosPix, contaCorrente);

    return NextResponse.json({
      sucesso: true,
      favorecido: resultado.nome,
      cpfCnpj: resultado.cpfCnpj,
      banco: resultado.banco,
      validacao: resultado.validacao,
    });

  } catch (err) {
    console.error('❌ Erro na simulação de PIX (consultar-pix):', err);
    return NextResponse.json({ sucesso: false, message: err.message }, { status: 500 });
  }
}
