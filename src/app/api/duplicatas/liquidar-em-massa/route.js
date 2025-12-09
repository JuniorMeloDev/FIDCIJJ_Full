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

        // <<<<<< LOG 1: VERIFICAR VALOR RECEBIDO >>>>>>
        console.log('API liquidar-em-massa RECEBEU contaBancariaId:', contaBancariaId);


        if (!liquidacoes || !Array.isArray(liquidacoes) || liquidacoes.length === 0) {
            return NextResponse.json({ message: 'Nenhuma duplicata selecionada.' }, { status: 400 });
        }

        if (contaBancariaId) {
            // <<<<<< LOG 2: CONFIRMAR QUE ENTROU NO 'IF' >>>>>>
            console.log('API liquidar-em-massa: Entrou no bloco IF (com contaBancariaId)');

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
                 // <<<<<< LOG 3: VERIFICAR NOME FORMATADO >>>>>>
                 console.log('API liquidar-em-massa: Nome formatado:', nomeContaFormatado);
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

            // Garante que totalValorBruto seja sempre um número
            const totalValorBruto = duplicatasInfo.reduce((sum, d) => sum + (d.valor_bruto || 0), 0);
            const isMultiple = liquidacoes.length > 1; // Definindo isMultiple aqui

            for (const item of liquidacoes) {
                const duplicata = duplicatasInfo.find(d => d.id === item.id);
                if (!duplicata) {
                    console.warn(`Duplicata ID ${item.id} não encontrada nos dados buscados, pulando.`);
                    continue;
                }

                let jurosPorItem = 0;
                let descontoPorItem = 0;

                // Cálculo proporcional
                if (isMultiple && totalValorBruto > 0) {
                    const proporcao = (duplicata.valor_bruto || 0) / totalValorBruto;
                    jurosPorItem = (jurosMora || 0) * proporcao;
                    descontoPorItem = (desconto || 0) * proporcao;
                } else if (!isMultiple) { // Se for apenas uma duplicata
                    jurosPorItem = jurosMora || 0;
                    descontoPorItem = desconto || 0;
                }


                // 3. Chamar a RPC com o NOVO parâmetro
                const { error: rpcError } = await supabase.rpc('liquidar_duplicata', {
                    p_duplicata_id: item.id,
                    p_data_liquidacao: dataLiquidacao || new Date().toISOString().split('T')[0], // Garante data
                    p_juros_mora: jurosPorItem,
                    p_desconto: descontoPorItem,
                    p_conta_bancaria_id: contaBancariaId,
                    p_nome_conta_formatado: nomeContaFormatado // <-- NOVO PARÂMETRO
                });

                if (rpcError) {
                    if (rpcError.message.includes("function liquidar_duplicata(") && rpcError.message.includes("does not exist")) {
                         throw new Error('A função RPC "liquidar_duplicata" no Supabase ainda não foi atualizada para aceitar o novo parâmetro "p_nome_conta_formatado". Verifique a função SQL.');
                    }
                    throw new Error(`Falha ao processar a baixa da duplicata ${duplicata.nf_cte || item.id} via RPC.`);
                }

                // --- FIX FOR BUG: INCORRECT NATURE ---
                // The RPC liquidar_duplicata likely defaults to 'Outras Despesas'. We force an update here.
                const { error: fixNaturezaError } = await supabase
                    .from('movimentacoes_caixa')
                    .update({ natureza: 'Recebimento de Duplicatas' })
                    .eq('duplicata_id', item.id)
                    .eq('categoria', 'Recebimento')
                    .eq('natureza', 'Outras Despesas');
                
                if (fixNaturezaError) {
                   console.error(`Erro ao corrigir natureza da duplicata ${item.id}:`, fixNaturezaError);
                   // We don't throw here to avoid failing the whole batch if just the fix fails, 
                   // but it's good to log.
                }
                // --- END FIX ---
            }
        } else {
             // <<<<<< LOG 4: CONFIRMAR QUE ENTROU NO 'ELSE' >>>>>>
            console.log('API liquidar-em-massa: Entrou no bloco ELSE (Apenas Baixa, sem contaBancariaId)');

            // Sua lógica de "Apenas Baixa" (inalterada)
            const idsParaAtualizar = liquidacoes.map(item => item.id);
            const dataParaAtualizar = dataLiquidacao || new Date().toISOString().split('T')[0];

            const { error: updateError } = await supabase
                .from('duplicatas')
                .update({
                    status_recebimento: 'Recebido',
                    data_liquidacao: dataParaAtualizar,
                    juros_mora: 0, // Zera juros/mora na baixa simples
                    desconto: 0,  // Zera desconto na baixa simples
                    conta_liquidacao: null // Garante que a conta fique nula
                })
                .in('id', idsParaAtualizar);

            if (updateError) {
                console.error('Erro ao tentar dar baixa simples nas duplicatas:', updateError);
                throw updateError;
            }
        }

        return new NextResponse(null, { status: 200 }); // Sucesso

    } catch (error) {
         // <<<<<< LOG 5: ERRO >>>>>>
        console.error('Erro no endpoint de liquidação em massa:', error);
        // Retorna a mensagem de erro específica, se disponível
        return NextResponse.json({ message: error.message || 'Falha ao processar a baixa da(s) duplicata(s).' }, { status: 500 });
    }
}