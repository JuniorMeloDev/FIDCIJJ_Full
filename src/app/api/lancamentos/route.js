import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

export async function POST(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const body = await request.json();
        let movements = [];

        switch (body.tipo.toUpperCase()) {
            case 'DEBITO':
                movements.push({
                    data_movimento: body.data,
                    descricao: body.descricao,
                    valor: -Math.abs(body.valor),
                    conta_bancaria: body.contaOrigem,
                    empresa_associada: body.empresaAssociada,
                    // ALTERAÇÃO: Removemos a dependência de body.isDespesa
                    categoria: 'Movimentação Avulsa', 
                    natureza: body.natureza || 'Outras Despesas'
                });
                break;
            case 'CREDITO':
                // ... (igual ao anterior)
                movements.push({
                    data_movimento: body.data,
                    descricao: body.descricao,
                    valor: Math.abs(body.valor),
                    conta_bancaria: body.contaOrigem,
                    empresa_associada: body.empresaAssociada,
                    categoria: 'Receita Avulsa',
                    natureza: 'Receitas Financeiras'
                });
                break;
            // ... (TRANSFERENCIA igual)
            case 'TRANSFERENCIA':
                movements.push({
                    data_movimento: body.data,
                    descricao: `Transf. para ${body.contaDestino}`,
                    valor: -Math.abs(body.valor),
                    conta_bancaria: body.contaOrigem,
                    empresa_associada: body.empresaAssociada,
                    categoria: 'Transferencia Enviada',
                    natureza: 'Transferência Entre Contas'
                });
                movements.push({
                    data_movimento: body.data,
                    descricao: `Transf. de ${body.contaOrigem}`,
                    valor: Math.abs(body.valor),
                    conta_bancaria: body.contaDestino,
                    empresa_associada: body.empresaDestino,
                    categoria: 'Transferencia Recebida',
                    natureza: 'Transferência Entre Contas'
                });
                break;
            default:
                throw new Error('Tipo de lançamento inválido');
        }

        const { error } = await supabase.from('movimentacoes_caixa').insert(movements);
        if (error) throw error;

        return new NextResponse(null, { status: 201 });

    } catch (error) {
        console.error("Erro ao criar lançamento:", error);
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}