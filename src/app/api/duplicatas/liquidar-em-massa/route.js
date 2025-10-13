// src/app/api/duplicatas/liquidar-em-massa/route.js
import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

export async function POST(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const { liquidacoes, dataLiquidacao, jurosMora, desconto, contaBancariaId } = await request.json();

        if (!liquidacoes || !Array.isArray(liquidacoes) || liquidacoes.length === 0) {
            return NextResponse.json({ message: 'Nenhuma duplicata selecionada.' }, { status: 400 });
        }

        // --- CORREÇÃO APLICADA: Lógica separada para baixa com e sem crédito ---

        if (contaBancariaId) {
            // LÓGICA PARA LIQUIDAÇÃO COM CRÉDITO EM CONTA
            const duplicataIds = liquidacoes.map(item => item.id);
            const { data: duplicatasInfo, error: dupError } = await supabase
                .from('duplicatas')
                .select('id, valor_bruto')
                .in('id', duplicataIds);
            if (dupError) throw dupError;

            const totalValorBruto = duplicatasInfo.reduce((sum, d) => sum + d.valor_bruto, 0);

            const promises = liquidacoes.map(item => {
                const duplicata = duplicatasInfo.find(d => d.id === item.id);
                const proporcao = totalValorBruto > 0 ? (duplicata.valor_bruto / totalValorBruto) : (1 / liquidacoes.length);
                const jurosPorItem = (jurosMora || 0) * proporcao;
                const descontoPorItem = (desconto || 0) * proporcao;

                return supabase.rpc('liquidar_duplicata', {
                    p_duplicata_id: item.id,
                    p_data_liquidacao: dataLiquidacao,
                    p_juros_mora: jurosPorItem + (item.juros_a_somar || 0),
                    p_desconto: descontoPorItem,
                    p_conta_bancaria_id: contaBancariaId
                });
            });
            
            const results = await Promise.all(promises);
            const firstError = results.find(res => res.error);
            if (firstError) {
                console.error('Erro ao liquidar uma ou mais duplicatas via RPC:', firstError.error);
                throw new Error('Falha ao processar a baixa da(s) duplicata(s).');
            }

        } else {
            // LÓGICA PARA "APENAS DAR BAIXA" (SEM CONTA)
            const idsParaAtualizar = liquidacoes.map(item => item.id);
            const dataParaAtualizar = dataLiquidacao || new Date().toISOString().split('T')[0];

            const { error: updateError } = await supabase
                .from('duplicatas')
                .update({ 
                    status_recebimento: 'Recebido', 
                    data_liquidacao: dataParaAtualizar,
                    // Zera valores financeiros pois não há transação
                    juros_mora: 0,
                    valor_abatimento: 0,
                    conta_liquidacao: null
                })
                .in('id', idsParaAtualizar);

            if (updateError) {
                console.error('Erro ao tentar dar baixa simples nas duplicatas:', updateError);
                throw updateError;
            }
        }

        return new NextResponse(null, { status: 200 });

    } catch (error) {
        console.error('Erro no endpoint de liquidação em massa:', error);
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}