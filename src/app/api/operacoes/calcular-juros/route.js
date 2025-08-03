import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

// Função para calcular os juros, replicando a lógica do backend Java
export async function POST(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const body = await request.json();
        const { dataOperacao, tipoOperacaoId, valorNf, parcelas, prazos, dataNf, peso } = body;

        // Busca os dados do tipo de operação
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

        if (tipoOp.valor_fixo > 0 && peso > 0) {
            // Lógica para valor fixo (ex: CTe)
            totalJuros = peso * tipoOp.valor_fixo;
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
            // Lógica para taxa de juros
            for (let i = 0; i < prazosArray.length; i++) {
                const dataVenc = new Date(dataNf);
                dataVenc.setDate(dataVenc.getDate() + prazosArray[i]);

                const diasCorridos = Math.ceil((dataVenc - new Date(dataOperacao)) / (1000 * 60 * 60 * 24));
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