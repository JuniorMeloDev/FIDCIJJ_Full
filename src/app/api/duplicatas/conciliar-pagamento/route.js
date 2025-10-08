// src/app/api/duplicatas/conciliar-pagamento/route.js
import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

export async function POST(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const { duplicataIds, detalhesTransacao, contaBancaria } = await request.json();

        if (!duplicataIds || duplicataIds.length === 0 || !detalhesTransacao || !contaBancaria) {
            return NextResponse.json({ message: 'Dados insuficientes para conciliação.' }, { status: 400 });
        }

        // 1. Busca o nome completo da conta bancária de recebimento
        const { data: contaInfo, error: contaError } = await supabase
            .from('contas_bancarias')
            .select('banco, agencia, conta_corrente')
            .eq('conta_corrente', contaBancaria)
            .single();

        if (contaError) throw new Error(`Conta de destino com número ${contaBancaria} não encontrada no cadastro.`);
        
        const nomeContaCompleto = `${contaInfo.banco} - ${contaInfo.agencia}/${contaInfo.conta_corrente}`;

        // 2. Busca os detalhes completos das duplicatas a serem baixadas
        const { data: duplicatasParaBaixar, error: dupError } = await supabase
            .from('duplicatas')
            .select('id, nf_cte, valor_bruto')
            .in('id', duplicataIds);
        
        if (dupError) throw dupError;

        // 3. Prepara os lançamentos de caixa individuais
        const lancamentosParaInserir = duplicatasParaBaixar.map(dup => ({
            data_movimento: detalhesTransacao.data,
            descricao: `Recebimento ${dup.nf_cte}`,
            valor: dup.valor_bruto, // O valor de crédito é o valor bruto da duplicata
            conta_bancaria: nomeContaCompleto,
            categoria: 'Recebimento',
            transaction_id: detalhesTransacao.id, // Vincula ao ID da transação da API
            duplicata_id: dup.id // Vincula o lançamento diretamente à duplicata
        }));

        const { error: insertError } = await supabase
            .from('movimentacoes_caixa')
            .insert(lancamentosParaInserir);

        if (insertError) throw insertError;

        // 4. Dá baixa nas duplicatas selecionadas, agora incluindo a conta de liquidação
        const { error: updateError } = await supabase
            .from('duplicatas')
            .update({ 
                status_recebimento: 'Recebido', 
                data_liquidacao: detalhesTransacao.data,
                conta_liquidacao: nomeContaCompleto // Salva em qual conta foi recebido
            })
            .in('id', duplicataIds);

        if (updateError) throw updateError;
        
        return NextResponse.json({ message: 'Conciliação realizada com sucesso!' }, { status: 200 });

    } catch (error) {
        console.error('Erro na API de conciliação:', error);
        return NextResponse.json({ message: error.message || 'Erro interno do servidor.' }, { status: 500 });
    }
}