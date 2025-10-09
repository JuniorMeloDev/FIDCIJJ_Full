// src/app/api/duplicatas/liquidar-em-massa/route.js
import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

export async function POST(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        // --- CORREÇÃO APLICADA AQUI ---
        const { liquidacoes, dataLiquidacao, jurosMora, desconto, contaBancariaId } = await request.json();

        if (!liquidacoes || !Array.isArray(liquidacoes) || liquidacoes.length === 0) {
            return NextResponse.json({ message: 'Nenhuma duplicata selecionada.' }, { status: 400 });
        }
        
        // Distribui os valores totais de juros e desconto entre os itens selecionados
        const totalItems = liquidacoes.length;
        const jurosPorItem = (jurosMora || 0) / totalItems;
        const descontoPorItem = (desconto || 0) / totalItems;

        const promises = liquidacoes.map(item => 
            supabase.rpc('liquidar_duplicata', {
                p_duplicata_id: item.id,
                p_data_liquidacao: dataLiquidacao,
                p_juros_mora: jurosPorItem + (item.juros_a_somar || 0),
                p_desconto: descontoPorItem, // NOVO: Passando o desconto para a função do banco
                p_conta_bancaria_id: contaBancariaId
            })
        );
        // --- FIM DA CORREÇÃO ---
        
        const results = await Promise.all(promises);
        
        const firstError = results.find(res => res.error);
        if (firstError) {
            console.error('Erro ao liquidar uma ou mais duplicatas via RPC:', firstError.error);
            throw new Error('Falha ao processar a baixa da(s) duplicata(s).');
        }

        // Lógica para registrar data em baixas manuais (sem conta)
        if (!contaBancariaId) {
            const idsParaAtualizar = liquidacoes.map(item => item.id);
            const dataParaAtualizar = dataLiquidacao || new Date().toISOString().split('T')[0];

            const { error: updateError } = await supabase
                .from('duplicatas')
                .update({ data_liquidacao: dataParaAtualizar })
                .in('id', idsParaAtualizar);

            if (updateError) {
                console.error('ERRO CRÍTICO: A baixa foi realizada, mas falhou ao registrar a data explicitamente.', updateError);
                // Não lança erro aqui para não assustar o usuário, pois a baixa principal funcionou.
            }
        }

        return new NextResponse(null, { status: 200 });
    } catch (error) {
        console.error('Erro no endpoint de liquidação em massa:', error);
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}