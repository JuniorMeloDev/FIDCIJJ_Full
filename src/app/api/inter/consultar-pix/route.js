import { NextResponse } from 'next/server';
import { getInterAccessToken, simularPixInter } from '@/app/lib/interService';
import { format } from 'date-fns';

export async function POST(request) {
  try {
    const { dadosPix, contaCorrente } = await request.json();

    if (!dadosPix || !contaCorrente) {
      return NextResponse.json({ message: 'Dados do PIX e conta corrente são obrigatórios.' }, { status: 400 });
    }

    // --- INÍCIO DA CORREÇÃO ---

    // 1. Formata a chave de telefone, se necessário
    let chaveFinal = dadosPix.destinatario.chave;
    if (dadosPix.destinatario.tipo === 'Telefone') {
        const numeros = dadosPix.destinatario.chave.replace(/\D/g, '');
        chaveFinal = numeros.length >= 10 && !numeros.startsWith('+55') ? `+55${numeros}` : numeros;
    }

    // 2. Monta o payload no formato exato que a API do Inter espera para a consulta
    const payloadParaSimulacao = {
      valor: dadosPix.valor.toFixed(2), // Garante que o valor seja uma string com duas casas decimais
      dataPagamento: format(new Date(), 'yyyy-MM-dd'), // Adiciona a data de hoje
      descricao: dadosPix.descricao,
      destinatario: {
        tipo: "CHAVE", // A API do Inter espera o tipo "CHAVE"
        chave: chaveFinal
      }
    };

    // --- FIM DA CORREÇÃO ---

    const tokenData = await getInterAccessToken();

    console.log("[LOG PIX] Simulando PIX para validar dados do favorecido...");
    // 3. Envia o payload formatado para a função de simulação
    const resultado = await simularPixInter(tokenData.access_token, payloadParaSimulacao, contaCorrente);

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