// src/app/api/duplicatas/conciliar-pagamento/route.js
import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

export async function POST(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Nao autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const body = await request.json();
        const { items, detalhesTransacao } = body;
        const contaBancaria = body.contaBancaria || body.contaDestino;

        if (!items || items.length === 0 || !detalhesTransacao || !contaBancaria) {
            return NextResponse.json({ message: 'Dados insuficientes para conciliacao.' }, { status: 400 });
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

            const jurosBase = Number(itemPayload.jurosBase || 0);
            const jurosAdicionais = Number(itemPayload.juros || 0);
            const jurosTotal = jurosBase + jurosAdicionais;
            const desconto = Number(itemPayload.desconto || 0);
            const valorRecebidoTotal = Number(dup.valor_bruto || 0) + jurosTotal - desconto;
            const ramo = dup.operacao?.cliente?.ramo_de_atividade;
            const docType = ramo === 'Transportes' ? 'CTe' : 'NF';
            const docNumber = String(dup.nf_cte || '').split('.')[0];
            const nfCteCompleto = dup.nf_cte;

            lancamentosParaInserir.push({
                data_movimento: detalhesTransacao.data,
                descricao: `Recebimento ${ramo === 'Transportes' ? `${docType} ${docNumber}` : nfCteCompleto}`,
                valor: valorRecebidoTotal,
                conta_bancaria: nomeContaCompleto,
                categoria: 'Recebimento',
                natureza: 'Recebimento de Duplicatas',
                transaction_id: detalhesTransacao.id,
                duplicata_id: dup.id
            });
        }

        const { error: insertError } = await supabase.from('movimentacoes_caixa').insert(lancamentosParaInserir);
        if (insertError) throw insertError;

        const { error: updateError } = await supabase
            .from('duplicatas')
            .update({
                status_recebimento: 'Recebido',
                data_liquidacao: detalhesTransacao.data,
                conta_liquidacao: nomeContaCompleto
            })
            .in('id', duplicataIds);

        if (updateError) throw updateError;

        return NextResponse.json({ message: 'Conciliacao realizada com sucesso!' }, { status: 200 });
    } catch (error) {
        console.error('Erro na API de conciliacao:', error);
        return NextResponse.json({ message: error.message || 'Erro interno do servidor.' }, { status: 500 });
    }
}
