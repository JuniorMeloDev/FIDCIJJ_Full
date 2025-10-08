// src/app/api/duplicatas/conciliar-pagamento/route.js
import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

export async function POST(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const { duplicataIds, detalhesTransacao, contaBancaria, juros, descontos } = await request.json();

        if (!duplicataIds || duplicataIds.length === 0 || !detalhesTransacao || !contaBancaria) {
            return NextResponse.json({ message: 'Dados insuficientes para conciliação.' }, { status: 400 });
        }

        const { data: contaInfo, error: contaError } = await supabase
            .from('contas_bancarias')
            .select('banco, agencia, conta_corrente')
            .eq('conta_corrente', contaBancaria)
            .single();
        if (contaError) throw new Error(`Conta de destino com número ${contaBancaria} não encontrada no cadastro.`);
        const nomeContaCompleto = `${contaInfo.banco} - ${contaInfo.agencia}/${contaInfo.conta_corrente}`;

        const { data: duplicatasParaBaixar, error: dupError } = await supabase
            .from('duplicatas')
            .select('id, nf_cte, valor_bruto, operacao:operacoes(cliente:clientes(ramo_de_atividade))')
            .in('id', duplicataIds);
        if (dupError) throw dupError;

        const lancamentosParaInserir = [];

        // Lançamento para cada duplicata
        for (const dup of duplicatasParaBaixar) {
            const ramo = dup.operacao?.cliente?.ramo_de_atividade;
            const docType = ramo === 'Transportes' ? 'CTe' : 'NF';
            const docNumber = dup.nf_cte.split('.')[0]; // Remove a parcela da descrição

            lancamentosParaInserir.push({
                data_movimento: detalhesTransacao.data,
                descricao: `Recebimento ${docType} ${docNumber}`,
                valor: dup.valor_bruto,
                conta_bancaria: nomeContaCompleto,
                categoria: 'Recebimento',
                transaction_id: detalhesTransacao.id,
                duplicata_id: dup.id
            });
        }

        const nfsConciliadas = duplicatasParaBaixar.map(d => d.nf_cte.split('.')[0]).join(', ');

        // Lançamento para Juros/Multa (se houver)
        if (juros > 0) {
            lancamentosParaInserir.push({
                data_movimento: detalhesTransacao.data,
                descricao: `Juros/Multa Receb. ref. NF/CTe: ${nfsConciliadas}`,
                valor: juros,
                conta_bancaria: nomeContaCompleto,
                categoria: 'Receita Avulsa',
                transaction_id: detalhesTransacao.id,
            });
        }

        // Lançamento para Descontos/Abatimentos (se houver)
        if (descontos > 0) {
            lancamentosParaInserir.push({
                data_movimento: detalhesTransacao.data,
                descricao: `Desconto Concedido ref. NF/CTe: ${nfsConciliadas}`,
                valor: -Math.abs(descontos),
                conta_bancaria: nomeContaCompleto,
                categoria: 'Despesa Avulsa',
                transaction_id: detalhesTransacao.id,
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
        
        return NextResponse.json({ message: 'Conciliação realizada com sucesso!' }, { status: 200 });

    } catch (error) {
        console.error('Erro na API de conciliação:', error);
        return NextResponse.json({ message: error.message || 'Erro interno do servidor.' }, { status: 500 });
    }
}