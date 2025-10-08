// src/app/api/lancamentos/pix/route.js
import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';
import { getInterAccessToken, enviarPixInter } from '@/app/lib/interService';
import { format } from 'date-fns';

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

        // 1. Busca a conta bancária completa para usar o nome padronizado
        const { data: contaInfo, error: contaError } = await supabase
            .from('contas_bancarias')
            .select('banco, agencia, conta_corrente')
            .eq('conta_corrente', contaOrigem)
            .single();

        if (contaError || !contaInfo) {
            throw new Error(`Conta de origem (${contaOrigem}) não encontrada no cadastro de contas.`);
        }
        
        const nomeContaCompleto = `${contaInfo.banco} - ${contaInfo.agencia}/${contaInfo.conta_corrente}`;

        let chaveFinal = pix.chave;
        if (pix.tipo === 'Telefone') {
            const numeros = pix.chave.replace(/\D/g, '');
            chaveFinal = numeros.length >= 10 && !numeros.startsWith('+55') ? `+55${numeros}` : numeros;
        }

        const dadosPix = {
            valor: parseFloat(valor.toFixed(2)),
            dataPagamento: format(new Date(), 'yyyy-MM-dd'),
            descricao: descricao,
            destinatario: {
                tipo: "CHAVE",
                chave: chaveFinal
            }
        };

        const tokenInter = await getInterAccessToken();
        const resultadoPix = await enviarPixInter(tokenInter.access_token, dadosPix, contaOrigem);

        const descricaoLancamento = `PIX Enviado - ${descricao}`;
        
        // 2. Insere o lançamento usando o nome completo e correto da conta
        const { error: insertError } = await supabase.from('movimentacoes_caixa').insert({
            data_movimento: new Date().toISOString().split('T')[0],
            descricao: descricaoLancamento,
            valor: -Math.abs(valor),
            conta_bancaria: nomeContaCompleto, // <-- CORREÇÃO APLICADA AQUI
            categoria: 'Pagamento PIX',
            empresa_associada: empresaAssociada,
            transaction_id: resultadoPix.endToEndId,
        });

        if (insertError) {
            console.error("ERRO CRÍTICO: PIX enviado mas falhou ao registrar no banco de dados.", insertError);
            return NextResponse.json({ 
                message: `PIX enviado com sucesso (ID: ${resultadoPix.endToEndId}), mas falhou ao registrar a movimentação. Por favor, registre manualmente um débito de ${valor.toFixed(2)} na conta ${nomeContaCompleto}.`,
                pixResult: resultadoPix 
            }, { status: 207 });
        }

        return NextResponse.json({ success: true, pixResult: resultadoPix }, { status: 201 });

    } catch (error) {
        console.error("Erro na API de Lançamento PIX:", error);
        return NextResponse.json({ message: error.message || 'Erro interno do servidor' }, { status: 500 });
    }
}