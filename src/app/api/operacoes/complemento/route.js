import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

export async function POST(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const body = await request.json();
        const { valor, data, operacao_id, conta_bancaria, empresa_associada } = body;

        if (!valor || !data || !operacao_id || !conta_bancaria) {
            return NextResponse.json({ message: 'Dados insuficientes para criar o complemento.' }, { status: 400 });
        }
        
        let descricaoLancamento = `Complemento Borderô #${operacao_id}`; 

        // Busca dados para melhorar a descrição (CTe/NF)
        const { data: operacaoData, error: operacaoError } = await supabase
            .from('operacoes')
            .select('*, cliente:clientes(ramo_de_atividade)')
            .eq('id', operacao_id)
            .single();

        if (!operacaoError && operacaoData) {
            const { data: duplicatas, error: dupError } = await supabase
                .from('duplicatas')
                .select('nf_cte')
                .eq('operacao_id', operacao_id);

            if (!dupError && duplicatas && duplicatas.length > 0) {
                const docType = operacaoData.cliente?.ramo_de_atividade === 'Transportes' ? 'CTe' : 'NF';
                const numerosDoc = [...new Set(duplicatas.map(d => d.nf_cte.split('.')[0]))].join(', ');
                descricaoLancamento = `Complemento Borderô ${docType} ${numerosDoc}`;
            }
        }

        // INSERÇÃO NO BANCO COM NATUREZA CORRETA
        const { error } = await supabase.from('movimentacoes_caixa').insert({
            data_movimento: data,
            descricao: descricaoLancamento,
            valor: -Math.abs(valor),
            conta_bancaria: conta_bancaria,
            categoria: 'Pagamento de Borderô',
            natureza: 'Aquisição de Direitos Creditórios',
            operacao_id: operacao_id,
            empresa_associada: empresa_associada,
        });

        if (error) {
            console.error("Erro ao inserir complemento no Supabase:", error);
            throw error;
        }

        return new NextResponse(null, { status: 201 });

    } catch (error) {
        console.error("Erro na API de complemento de borderô:", error);
        return NextResponse.json({ message: error.message || 'Erro interno do servidor' }, { status: 500 });
    }
}