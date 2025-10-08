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

        // 1. Busca o nome completo da conta bancária
        const { data: contaInfo, error: contaError } = await supabase
            .from('contas_bancarias')
            .select('banco, agencia, conta_corrente')
            .eq('conta_corrente', contaBancaria)
            .single();

        if (contaError) throw new Error(`Conta com número ${contaBancaria} não encontrada.`);
        
        const nomeContaCompleto = `${contaInfo.banco} - ${contaInfo.agencia}/${contaInfo.conta_corrente}`;

        // 2. Busca as duplicatas para obter os números das notas
        const { data: duplicatasInfo, error: dupError } = await supabase
            .from('duplicatas')
            .select('nf_cte')
            .in('id', duplicataIds);
        if (dupError) throw dupError;
        
        const nfsConciliadas = duplicatasInfo.map(d => d.nf_cte.split('.')[0]).join(', ');
        const novaDescricao = `${detalhesTransacao.descricao} (Conciliado: ${nfsConciliadas})`;
        
        // 3. Cria o novo lançamento de caixa interno
        const { error: insertError } = await supabase.from('movimentacoes_caixa').insert({
            data_movimento: detalhesTransacao.data,
            descricao: novaDescricao,
            valor: detalhesTransacao.valor,
            conta_bancaria: nomeContaCompleto,
            categoria: 'Recebimento',
            transaction_id: detalhesTransacao.id
        });

        if (insertError) throw insertError;

        // 4. Dá baixa nas duplicatas selecionadas
        const { error: updateError } = await supabase
            .from('duplicatas')
            .update({ status_recebimento: 'Recebido', data_liquidacao: detalhesTransacao.data, conta_liquidacao: nomeContaCompleto })
            .in('id', duplicataIds);

        if (updateError) throw updateError;
        
        return NextResponse.json({ message: 'Conciliação realizada com sucesso!' }, { status: 200 });

    } catch (error) {
        console.error('Erro na API de conciliação:', error);
        return NextResponse.json({ message: error.message || 'Erro interno do servidor.' }, { status: 500 });
    }
}