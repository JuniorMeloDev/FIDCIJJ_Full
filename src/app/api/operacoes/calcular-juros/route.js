import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

export async function POST(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const body = await request.json();
        const { dataOperacao, tipoOperacaoId, valorNf, parcelas, prazos, dataNf, peso } = body;

        // Busca os dados do tipo de operação, incluindo os novos campos
        const { data: tipoOp, error } = await supabase
            .from('tipos_operacao')
            .select('*')
            .eq('id', tipoOperacaoId)
            .single();

        if (error) throw new Error('Tipo de operação não encontrado.');

        let totalJuros = 0;
        const valorParcelaBase = valorNf / parcelas;
        const prazosArray = prazos.split('/').map(p => parseInt(p.trim(), 10));
        const parcelasCalculadas = [];

        if (tipoOp.valor_fixo > 0) {

            if (tipoOp.usar_peso_no_valor_fixo && peso > 0) {
                totalJuros = peso * tipoOp.valor_fixo; // Multiplica pelo peso se o check estiver marcado
            } else {
                totalJuros = tipoOp.valor_fixo; // Senão, usa o valor fixo diretamente
            }
            const jurosPorParcela = totalJuros / parcelas;

            for (let i = 0; i < prazosArray.length; i++) {
                const dataVencimento = new Date(dataNf);
                dataVencimento.setDate(dataVencimento.getDate() + prazosArray[i]);
                parcelasCalculadas.push({
                    numeroParcela: i + 1,
                    dataVencimento: dataVencimento.toISOString().split('T')[0],
                    valorParcela: valorParcelaBase,
                    jurosParcela: jurosPorParcela,
                });
            }
        } else {
            // LÓGICA DA TAXA DE JUROS ATUALIZADA
            for (let i = 0; i < prazosArray.length; i++) {
                const prazoDias = prazosArray[i];
                const dataVenc = new Date(dataNf);
                dataVenc.setDate(dataVenc.getDate() + prazoDias);

                // Se o check "Usar prazo do sacado" estiver marcado, os dias corridos são fixos.
                // Senão, calcula a diferença entre a data da operação e o vencimento.
                const diasCorridos = tipoOp.usar_prazo_sacado 
                    ? prazoDias 
                    : Math.ceil((dataVenc - new Date(dataOperacao)) / (1000 * 60 * 60 * 24));

                const jurosParcela = (valorParcelaBase * (tipoOp.taxa_juros / 100) / 30) * diasCorridos;

                totalJuros += jurosParcela;
                parcelasCalculadas.push({
                    numeroParcela: i + 1,
                    dataVencimento: dataVenc.toISOString().split('T')[0],
                    valorParcela: valorParcelaBase,
                    jurosParcela: jurosParcela,
                });
            }
        }

        const valorLiquido = valorNf - totalJuros;

        return NextResponse.json({ totalJuros, valorLiquido, parcelasCalculadas }, { status: 200 });

    } catch (error) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}