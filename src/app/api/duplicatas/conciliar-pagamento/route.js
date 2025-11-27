// src/app/api/duplicatas/conciliar-pagamento/route.js
import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

export async function POST(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const body = await request.json();
        
        // MODIFICAÇÃO: Aceita 'contaBancaria' (da API Inter) ou 'contaDestino' (do OFX via ConciliacaoModal)
        const { items, detalhesTransacao } = body;
        const contaBancaria = body.contaBancaria || body.contaDestino; 

        if (!items || items.length === 0 || !detalhesTransacao || !contaBancaria) {
            return NextResponse.json({ message: 'Dados insuficientes para conciliação.' }, { status: 400 });
        }

        const nomeContaCompleto = contaBancaria;


        const duplicataIds = items.map(item => item.id);
        const { data: duplicatasInfo, error: dupError } = await supabase
            .from('duplicatas')
            .select('id, nf_cte, valor_bruto, operacao:operacoes(cliente:clientes(ramo_de_atividade))')
            .in('id', duplicataIds);
        if (dupError) throw dupError;

        const lancamentosParaInserir = [];

        for (const dup of duplicatasInfo) {
            const itemPayload = items.find(i => i.id === dup.id);
            if (!itemPayload) continue;

            const ramo = dup.operacao?.cliente?.ramo_de_atividade;
            const docType = ramo === 'Transportes' ? 'CTe' : 'NF';
            const docNumber = dup.nf_cte.split('.')[0];
            const nfCteCompleto = dup.nf_cte;

            // Lançamento principal (valor da duplicata)
            lancamentosParaInserir.push({
                data_movimento: detalhesTransacao.data,
                descricao: `Recebimento ${ramo === 'Transportes' ? docType + ' ' + docNumber : nfCteCompleto}`,
                valor: dup.valor_bruto,
                conta_bancaria: nomeContaCompleto, // Usa a variável
                categoria: 'Recebimento',
                natureza: 'Recebimento de Duplicatas',
                transaction_id: detalhesTransacao.id, // Usa o ID da transação OFX/API
                duplicata_id: dup.id
            });

            // Lançamento de Juros
            if (itemPayload.juros > 0) {
                lancamentosParaInserir.push({
                    data_movimento: detalhesTransacao.data,
                    descricao: `Juros/Multa Receb. ref. ${docType} ${docNumber}`,
                    valor: itemPayload.juros,
                    conta_bancaria: nomeContaCompleto, // Usa a variável
                    categoria: 'Receita Avulsa',
                    natureza: 'Receitas Financeiras',
                    transaction_id: detalhesTransacao.id,
                });
            }

            // Lançamento de Desconto
            if (itemPayload.desconto > 0) {
                lancamentosParaInserir.push({
                    data_movimento: detalhesTransacao.data,
                    descricao: `Desconto Concedido ref. ${docType} ${docNumber}`,
                    valor: -Math.abs(itemPayload.desconto),
                    conta_bancaria: nomeContaCompleto, // Usa a variável
                    categoria: 'Despesa Avulsa',
                    natureza: 'Despesas Financeiras',
                    transaction_id: detalhesTransacao.id,
                });
            }
        }

        const { error: insertError } = await supabase.from('movimentacoes_caixa').insert(lancamentosParaInserir);
        if (insertError) throw insertError;

        const { error: updateError } = await supabase
            .from('duplicatas')
            .update({ 
                status_recebimento: 'Recebido', 
                data_liquidacao: detalhesTransacao.data,
                conta_liquidacao: nomeContaCompleto // Usa a variável
            })
            .in('id', duplicataIds);
        if (updateError) throw updateError;
        
        return NextResponse.json({ message: 'Conciliação realizada com sucesso!' }, { status: 200 });

    } catch (error) {
        console.error('Erro na API de conciliação:', error);
        return NextResponse.json({ message: error.message || 'Erro interno do servidor.' }, { status: 500 });
    }
}