// src/app/api/duplicatas/liquidar-em-massa/route.js

import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';
// 1. Importar o formatador
import { formatDisplayConta } from '@/app/utils/formatters';

export async function POST(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const { liquidacoes, dataLiquidacao, jurosMora, desconto, contaBancariaId } = await request.json();

        if (!liquidacoes || !Array.isArray(liquidacoes) || liquidacoes.length === 0) {
            return NextResponse.json({ message: 'Nenhuma duplicata selecionada.' }, { status: 400 });
        }

        if (contaBancariaId) {
            // --- INÍCIO DA MODIFICAÇÃO ---
            // 2. Buscar os detalhes da conta e formatar o nome
            let nomeContaFormatado = null;
            const { data: contaInfo, error: contaError } = await supabase
                .from('contas_bancarias')
                .select('banco, agencia, conta_corrente')
                .eq('id', contaBancariaId)
                .single();
            
            if (contaError) {
                console.error("Erro ao buscar conta bancária:", contaError);
                throw new Error(`Conta bancária com ID ${contaBancariaId} não encontrada.`);
            }

            if (contaInfo) {
                const contaCompleta = `${contaInfo.banco} - ${contaInfo.agencia}/${contaInfo.conta_corrente}`;
                // Usa a função de formatação importada
                nomeContaFormatado = formatDisplayConta(contaCompleta);
            } else {
                throw new Error("Conta bancária não encontrada (sem info).");
            }
            // --- FIM DA MODIFICAÇÃO ---

            // A lógica original de proporção é mantida
            const duplicataIds = liquidacoes.map(item => item.id);
            const { data: duplicatasInfo, error: dupError } = await supabase
                .from('duplicatas')
                .select('id, valor_bruto')
                .in('id', duplicataIds);
            if (dupError) throw dupError;

            const totalValorBruto = duplicatasInfo.reduce((sum, d) => sum + d.valor_bruto, 0);

            for (const item of liquidacoes) {
                const duplicata = duplicatasInfo.find(d => d.id === item.id);
                if (!duplicata) continue;

                const proporcao = totalValorBruto > 0 ? (duplicata.valor_bruto / totalValorBruto) : (1 / liquidacoes.length);
                const jurosPorItem = (jurosMora || 0) * proporcao;
                const descontoPorItem = (desconto || 0) * proporcao;

                // 3. Chamar a RPC com o NOVO parâmetro
                const { error: rpcError } = await supabase.rpc('liquidar_duplicata', {
                    p_duplicata_id: item.id,
                    p_data_liquidacao: dataLiquidacao,
                    p_juros_mora: jurosPorItem,
                    p_desconto: descontoPorItem,
                    p_conta_bancaria_id: contaBancariaId,
                    p_nome_conta_formatado: nomeContaFormatado // <-- NOVO PARÂMETRO
                });

                if (rpcError) {
                    console.error(`Erro ao liquidar duplicata ID ${item.id}:`, rpcError);
                    // Mensagem de erro útil se a RPC não for atualizada
                    if (rpcError.message.includes("function liquidar_duplicata(") && rpcError.message.includes("does not exist")) {
                         throw new Error('A função RPC "liquidar_duplicata" no Supabase ainda não foi atualizada para aceitar o novo parâmetro "p_nome_conta_formatado".');
                    }
                    throw new Error('Falha ao processar a baixa de uma das duplicatas.');
                }
            }
        } else {
            // Sua lógica de "Apenas Baixa" (inalterada)
            const idsParaAtualizar = liquidacoes.map(item => item.id);
            const dataParaAtualizar = dataLiquidacao || new Date().toISOString().split('T')[0];

            const { error: updateError } = await supabase
                .from('duplicatas')
                .update({ 
                    status_recebimento: 'Recebido', 
                    data_liquidacao: dataParaAtualizar,
                    juros_mora: 0,
                    desconto: 0, 
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
        return NextResponse.json({ message: error.message || 'Falha ao processar a baixa da(s) duplicata(s).' }, { status: 500 });
    }
}