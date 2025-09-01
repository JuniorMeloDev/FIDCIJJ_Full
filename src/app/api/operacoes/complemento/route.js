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
        
        // --- LÓGICA ADICIONADA PARA BUSCAR NF/CTE ---
        let descricaoLancamento = `COMPLEMENTO BORDERO #${operacao_id}`; // Fallback

        const { data: duplicatas, error: dupError } = await supabase
            .from('duplicatas')
            .select('nf_cte')
            .eq('operacao_id', operacao_id);

        if (dupError) {
            console.error("Erro ao buscar duplicatas para descrição do complemento:", dupError);
        } else if (duplicatas && duplicatas.length > 0) {
            // Pega os números base das notas (ex: de '2180.1' e '2180.2' pega apenas '2180')
            // e cria uma string única.
            const numerosNf = [...new Set(duplicatas.map(d => d.nf_cte.split('.')[0]))].join(', ');
            descricaoLancamento = `COMPLEMENTO BORDERO NF ${numerosNf}`;
        }
        // --- FIM DA LÓGICA ADICIONADA ---

        const { error } = await supabase.from('movimentacoes_caixa').insert({
            data_movimento: data,
            // MODIFICADO: Usa a nova descrição dinâmica
            descricao: descricaoLancamento,
            valor: -Math.abs(valor),
            conta_bancaria: conta_bancaria,
            categoria: 'Pagamento de Borderô',
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