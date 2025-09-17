import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

export async function GET(request, { params }) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const { operacaoId } = params;

        const { data, error } = await supabase
            .from('duplicatas')
            .select(`
                *,
                operacao:operacoes (
                    cliente:clientes ( nome )
                )
            `)
            .eq('operacao_id', operacaoId)
            .order('data_vencimento', { ascending: true });

        if (error) throw error;
        
        // Formata os dados para o frontend
        const formattedData = data.map(d => ({
            id: d.id,
            operacaoId: d.operacao_id,
            nfCte: d.nf_cte,
            empresaCedente: d.operacao?.cliente?.nome,
            clienteSacado: d.cliente_sacado,
            valorBruto: d.valor_bruto,
            dataVencimento: d.data_vencimento,
        }));

        return NextResponse.json(formattedData, { status: 200 });

    } catch (error) {
        return NextResponse.json({ message: error.message || 'Erro interno do servidor' }, { status: 500 });
    }
}