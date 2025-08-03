import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

export async function POST(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const body = await request.json();

        // Lógica para calcular os totais
        let valorTotalBruto = 0;
        let valorTotalJuros = 0;
        const duplicatasParaSalvar = [];

        body.notasFiscais.forEach(nf => {
            valorTotalBruto += nf.valorNf;
            valorTotalJuros += nf.jurosCalculado;
            nf.parcelasCalculadas.forEach(p => {
                duplicatasParaSalvar.push({
                    nfCte: `${nf.nfCte}.${p.numeroParcela}`,
                    clienteSacado: nf.clienteSacado,
                    valorParcela: p.valorParcela,
                    jurosParcela: p.jurosParcela,
                    dataVencimento: p.dataVencimento,
                });
            });
        });

        const valorTotalDescontos = body.descontos.reduce((acc, d) => acc + d.valor, 0);
        const valorLiquido = valorTotalBruto - valorTotalJuros - valorTotalDescontos;

        const { data: operacaoId, error } = await supabase.rpc('salvar_operacao_completa', {
            p_data_operacao: body.dataOperacao,
            p_tipo_operacao_id: body.tipoOperacaoId,
            p_cliente_id: body.clienteId,
            p_conta_bancaria_id: body.contaBancariaId,
            p_valor_total_bruto: valorTotalBruto,
            p_valor_total_juros: valorTotalJuros,
            p_valor_total_descontos: valorTotalDescontos,
            p_valor_liquido: valorLiquido,
            p_duplicatas: JSON.stringify(duplicatasParaSalvar),
            p_descontos: JSON.stringify(body.descontos)
        });

        if (error) throw error;

        return NextResponse.json(operacaoId, { status: 201 });

    } catch (error) {
        console.error('Erro ao salvar operação:', error);
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}