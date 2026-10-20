import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';
import { resolveContaBancaria } from '@/app/lib/contasBancarias';

export async function POST(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const body = await request.json();
        if (!Number.isFinite(Number(body.valor)) || Number(body.valor) <= 0) {
            return NextResponse.json({ message: 'Informe um valor maior que zero.' }, { status: 400 });
        }
        const { data: masterClient, error: clientError } = await supabase
            .from('clientes').select('id').order('id', { ascending: true }).limit(1).single();
        if (clientError) throw clientError;
        const { data: contas, error: contasError } = await supabase
            .from('contas_bancarias').select('banco, agencia, conta_corrente').eq('cliente_id', masterClient.id);
        if (contasError) throw contasError;
        const contasCanonicas = contas.map((conta) => ({
            contaBancaria: `${conta.banco} - ${conta.agencia}/${conta.conta_corrente}`,
        }));
        body.contaOrigem = resolveContaBancaria(body.contaOrigem, contasCanonicas);
        body.contaDestino = resolveContaBancaria(body.contaDestino, contasCanonicas);
        let movements = [];

        switch (body.tipo.toUpperCase()) {
            case 'DEBITO':
                movements.push({
                    data_movimento: body.data,
                    descricao: body.descricao,
                    valor: -Math.abs(body.valor),
                    conta_bancaria: body.contaOrigem,
                    ...(body.aplicacaoOrigemId ? { investimento_aplicacao_id: body.aplicacaoOrigemId } : {}),
                    empresa_associada: body.empresaAssociada,
                    categoria: 'Transferência',
                    natureza: 'Transferência Entre Contas'
                });
                break;
            case 'CREDITO':
                movements.push({
                    data_movimento: body.data,
                    descricao: body.descricao,
                    valor: Math.abs(body.valor),
                    conta_bancaria: body.contaOrigem,
                    ...(body.aplicacaoOrigemId ? { investimento_aplicacao_id: body.aplicacaoOrigemId } : {}),
                    empresa_associada: body.empresaAssociada,
                    categoria: 'Transferência',
                    natureza: 'Transferência Entre Contas'
                });
                break;
            case 'TRANSFERENCIA':
                movements.push({
                    data_movimento: body.data,
                    descricao: `Transf. para ${body.contaDestino}`,
                    valor: -Math.abs(body.valor),
                    conta_bancaria: body.contaOrigem,
                    ...(body.aplicacaoOrigemId ? { investimento_aplicacao_id: body.aplicacaoOrigemId } : {}),
                    empresa_associada: body.empresaAssociada,
                    categoria: 'Transferencia Enviada',
                    natureza: 'Transferência Entre Contas'
                });
                movements.push({
                    data_movimento: body.data,
                    descricao: `Transf. de ${body.contaOrigem}`,
                    valor: Math.abs(body.valor),
                    conta_bancaria: body.contaDestino,
                    ...(body.aplicacaoDestinoId ? { investimento_aplicacao_id: body.aplicacaoDestinoId } : {}),
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
