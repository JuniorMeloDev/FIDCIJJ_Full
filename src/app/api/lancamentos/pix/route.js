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

        let chaveFinal = pix.chave;
        if (pix.tipo === 'Telefone') {
            const numeros = pix.chave.replace(/\D/g, '');
            if (numeros.length >= 10 && !numeros.startsWith('55')) {
                chaveFinal = `+55${numeros}`;
            } else if (numeros.length >= 10 && !numeros.startsWith('+')) {
                 chaveFinal = `+${numeros}`;
            }
        }

        // ================== INÍCIO DA CORREÇÃO DEFINITIVA ==================
        // Ajusta o payload para corresponder exatamente à documentação do Inter,
        // incluindo dataPagamento e o nome correto do campo 'descricao'.
        const dadosPix = {
            valor: parseFloat(valor.toFixed(2)),
            dataPagamento: format(new Date(), 'yyyy-MM-dd'), // A API exige a data do pagamento
            descricao: descricao, // O nome correto do campo é 'descricao'
            destinatario: {
                tipo: "CHAVE",
                chave: chaveFinal
            }
        };
        // =================== FIM DA CORREÇÃO DEFINITIVA ====================

        const tokenInter = await getInterAccessToken();
        const resultadoPix = await enviarPixInter(tokenInter.access_token, dadosPix, contaOrigem);

        const descricaoLancamento = `PIX Enviado - ${descricao}`;
        
        const { error: insertError } = await supabase.from('movimentacoes_caixa').insert({
            data_movimento: new Date().toISOString().split('T')[0],
            descricao: descricaoLancamento,
            valor: -Math.abs(valor),
            // ATENÇÃO: A conta de origem no lançamento é o NOME COMPLETO, não apenas o número.
            // Precisamos buscar o nome completo da conta a partir do número.
            conta_bancaria: contaOrigem, // Assumindo que contaOrigem já vem no formato 'BANCO - AG/CC'
            categoria: 'Pagamento PIX',
            empresa_associada: empresaAssociada,
            transaction_id: resultadoPix.endToEndId,
        });

        if (insertError) {
            console.error("ERRO CRÍTICO: PIX enviado mas falhou ao registrar no banco de dados.", insertError);
            // Busca a conta completa para exibir na mensagem de erro
            const { data: contaInfo } = await supabase.from('contas_bancarias').select('banco, agencia, conta_corrente').eq('conta_corrente', contaOrigem.split('-')[0]).single();
            const contaCompleta = contaInfo ? `${contaInfo.banco} - ${contaInfo.agencia}/${contaInfo.conta_corrente}` : contaOrigem;

            return NextResponse.json({ 
                message: `PIX enviado com sucesso (ID: ${resultadoPix.endToEndId}), mas falhou ao registrar a movimentação. Por favor, registre manualmente um débito de ${valor.toFixed(2)} na conta ${contaCompleta}.`,
                pixResult: resultadoPix 
            }, { status: 207 });
        }

        return NextResponse.json({ success: true, pixResult: resultadoPix }, { status: 201 });

    } catch (error) {
        console.error("Erro na API de Lançamento PIX:", error);
        return NextResponse.json({ message: error.message || 'Erro interno do servidor' }, { status: 500 });
    }
}