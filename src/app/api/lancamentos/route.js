import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';
import { nomeContaInvestimento, resolveContaBancaria } from '@/app/lib/contasBancarias';

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
        const tipo = body.tipo.toUpperCase();
        const aplicacaoOrigemId = body.aplicacaoOrigemId;
        const aplicacaoDestinoId = tipo === 'TRANSFERENCIA' ? body.aplicacaoDestinoId : null;
        const ids = [...new Set([aplicacaoOrigemId, aplicacaoDestinoId].filter(Boolean).map(String))];
        const nomesInvestimentos = new Map();
        if (ids.length) {
            const { data: aplicacoes, error } = await supabase
                .from('investimentos_aplicacoes')
                .select('id, nome, conta:investimentos_contas!inner(nome, ativa)')
                .in('id', ids)
                .eq('ativa', true)
                .eq('conta.ativa', true);
            if (error) throw error;
            if (aplicacoes.length !== ids.length) {
                return NextResponse.json({ message: 'Selecione uma aplicação de investimento ativa.' }, { status: 400 });
            }
            for (const aplicacao of aplicacoes) {
                nomesInvestimentos.set(String(aplicacao.id), nomeContaInvestimento(aplicacao));
            }
        }
        const contaOrigem = nomesInvestimentos.get(String(aplicacaoOrigemId)) ??
            resolveContaBancaria(body.contaOrigem, contasCanonicas);
        const contaDestino = nomesInvestimentos.get(String(aplicacaoDestinoId)) ??
            resolveContaBancaria(body.contaDestino, contasCanonicas);
        if (tipo === 'TRANSFERENCIA' && contaOrigem === contaDestino) {
            return NextResponse.json({ message: 'Selecione contas de origem e destino diferentes.' }, { status: 400 });
        }
        let movements = [];

        switch (tipo) {
            case 'DEBITO':
                movements.push({
                    data_movimento: body.data,
                    descricao: body.descricao,
                    valor: -Math.abs(body.valor),
                    conta_bancaria: contaOrigem,
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
                    conta_bancaria: contaOrigem,
                    ...(body.aplicacaoOrigemId ? { investimento_aplicacao_id: body.aplicacaoOrigemId } : {}),
                    empresa_associada: body.empresaAssociada,
                    categoria: 'Transferência',
                    natureza: 'Transferência Entre Contas'
                });
                break;
            case 'TRANSFERENCIA':
                movements.push({
                    data_movimento: body.data,
                    descricao: `Transf. para ${contaDestino}`,
                    valor: -Math.abs(body.valor),
                    conta_bancaria: contaOrigem,
                    ...(body.aplicacaoOrigemId ? { investimento_aplicacao_id: body.aplicacaoOrigemId } : {}),
                    empresa_associada: body.empresaAssociada,
                    categoria: 'Transferencia Enviada',
                    natureza: 'Transferência Entre Contas'
                });
                movements.push({
                    data_movimento: body.data,
                    descricao: `Transf. de ${contaOrigem}`,
                    valor: Math.abs(body.valor),
                    conta_bancaria: contaDestino,
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
