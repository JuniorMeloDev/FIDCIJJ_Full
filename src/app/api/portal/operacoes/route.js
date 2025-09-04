import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

// GET: Busca as operações APENAS do cliente logado
export async function GET(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userRoles = decoded.roles || [];

        if (!userRoles.includes('ROLE_CLIENTE')) {
            return NextResponse.json({ message: 'Acesso negado' }, { status: 403 });
        }
        
        // Pega o ID do cliente que está dentro do token
        const clienteId = decoded.cliente_id;
        
        // Validação extra para garantir que um cliente tenha um ID associado
        if (!clienteId) {
            return NextResponse.json({ message: 'Usuário cliente sem empresa associada.' }, { status: 403 });
        }

        // Adiciona o filtro .eq('cliente_id', clienteId) à consulta
        const { data, error } = await supabase
            .from('operacoes')
            .select('*, duplicatas(*)')
            .eq('cliente_id', clienteId) // <-- FILTRA APENAS PELO ID DO CLIENTE LOGADO
            .order('data_operacao', { ascending: false });

        if (error) throw error;

        return NextResponse.json(data, { status: 200 });

    } catch (error) {
        console.error("Erro ao buscar operações do cliente:", error);
        return NextResponse.json({ message: error.message || 'Erro interno do servidor' }, { status: 500 });
    }
}

// A sua função POST para o cliente enviar operações continua igual e está correta.
export async function POST(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const clienteId = decoded.cliente_id;
        const userRoles = decoded.roles || [];

        if (!userRoles.includes('ROLE_CLIENTE') || !clienteId) {
             return NextResponse.json({ message: 'Ação não permitida para este usuário.' }, { status: 403 });
        }

        const body = await request.json();
        const valorTotalBruto = body.notasFiscais.reduce((acc, nf) => acc + nf.valorNf, 0);
        const valorTotalJuros = body.notasFiscais.reduce((acc, nf) => acc + nf.jurosCalculado, 0);
        
        const duplicatasParaSalvar = body.notasFiscais.flatMap(nf => 
            nf.parcelasCalculadas.map(p => ({
                nfCte: `${nf.nfCte}.${p.numeroParcela}`,
                clienteSacado: nf.clienteSacado,
                valorParcela: p.valorParcela,
                jurosParcela: p.jurosParcela,
                dataVencimento: p.dataVencimento,
            }))
        );

        const { data: operacaoId, error } = await supabase.rpc('salvar_operacao_completa', {
            p_data_operacao: body.dataOperacao,
            p_tipo_operacao_id: body.tipoOperacaoId,
            p_cliente_id: clienteId,
            p_conta_bancaria_id: null,
            p_valor_total_bruto: valorTotalBruto,
            p_valor_total_juros: valorTotalJuros,
            p_valor_total_descontos: 0,
            p_duplicatas: duplicatasParaSalvar,
            p_descontos: [],
            p_valor_debito_parcial: null, 
            p_data_debito_parcial: null
        });

        if (error) {
            console.error('Erro RPC ao salvar operação do cliente:', error);
            throw error;
        }

        return NextResponse.json({ operacaoId, message: 'Operação enviada para análise com sucesso!' }, { status: 201 });

    } catch (error) {
        console.error('Erro ao submeter operação:', error);
        return NextResponse.json({ message: error.message || 'Erro interno do servidor' }, { status: 500 });
    }
}