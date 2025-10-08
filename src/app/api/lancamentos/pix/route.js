import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';
import { getInterAccessToken, enviarPixInter } from '@/app/lib/interService';

export async function POST(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const body = await request.json();
        const { valor, descricao, contaOrigem, empresaAssociada, pix } = body;

        if (!valor || !descricao || !contaOrigem || !pix || !pix.chave) {
            return NextResponse.json({ message: 'Todos os campos são obrigatórios para o PIX.' }, { status: 400 });
        }

        let chaveFinal = pix.chave;
        if (pix.tipo === 'Telefone') {
            const numeros = pix.chave.replace(/\D/g, '');
            // Garante que o número tenha o código do país (+55)
            if (numeros.length >= 10 && !numeros.startsWith('55')) {
                chaveFinal = `+55${numeros}`;
            } else if (numeros.length >= 10 && !numeros.startsWith('+')) {
                 chaveFinal = `+${numeros}`;
            }
        }

        // 1. Monta o payload para a API do Inter
        const dadosPix = {
            valor: valor.toFixed(2),
            descricao: descricao, // 'infoPagador' é usado em outra API, aqui é 'descricao'
            destinatario: {
                tipo: "CHAVE", // Campo obrigatório que estava faltando
                chave: chaveFinal
            }
        };

        const tokenInter = await getInterAccessToken();
        const resultadoPix = await enviarPixInter(tokenInter.access_token, dadosPix, contaOrigem);

        // 2. Se o PIX foi bem-sucedido, registrar a movimentação de caixa
        const descricaoLancamento = `PIX Enviado - ${descricao}`;
        
        const { error: insertError } = await supabase.from('movimentacoes_caixa').insert({
            data_movimento: new Date().toISOString().split('T')[0],
            descricao: descricaoLancamento,
            valor: -Math.abs(valor),
            conta_bancaria: contaOrigem, 
            categoria: 'Pagamento PIX',
            empresa_associada: empresaAssociada,
            transaction_id: resultadoPix.endToEndId,
        });

        if (insertError) {
            console.error("ERRO CRÍTICO: PIX enviado mas falhou ao registrar no banco de dados.", insertError);
            return NextResponse.json({ 
                message: `PIX enviado com sucesso (ID: ${resultadoPix.endToEndId}), mas falhou ao registrar a movimentação no sistema. Por favor, registre manualmente.`,
                pixResult: resultadoPix 
            }, { status: 207 });
        }

        return NextResponse.json({ success: true, pixResult: resultadoPix }, { status: 201 });

    } catch (error) {
        console.error("Erro na API de Lançamento PIX:", error);
        return NextResponse.json({ message: error.message || 'Erro interno do servidor' }, { status: 500 });
    }
}