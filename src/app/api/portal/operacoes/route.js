import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

// Função para obter o cliente_id a partir do token de autenticação
const getClienteIdFromToken = (request) => {
    const token = request.headers.get('Authorization')?.split(' ')[1];
    if (!token) return null;
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        // O cliente_id foi adicionado ao token no momento do login
        return decoded.cliente_id || null; 
    } catch (error) {
        return null;
    }
};

// GET: Busca as operações do cliente logado
export async function GET(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userRoles = decoded.roles || [];

        if (!userRoles.includes('ROLE_CLIENTE')) {
            return NextResponse.json({ message: 'Acesso negado' }, { status: 403 });
        }
        
        // A RLS (Row Level Security) já garante que o cliente só veja suas próprias operações.
        // A função get_cliente_id() no Supabase usa o cliente_id do token.
        const { data, error } = await supabase
            .from('operacoes')
            .select('*, duplicatas(*)')
            .order('data_operacao', { ascending: false });

        if (error) throw error;

        return NextResponse.json(data, { status: 200 });

    } catch (error) {
        console.error("Erro ao buscar operações do cliente:", error);
        return NextResponse.json({ message: error.message || 'Erro interno do servidor' }, { status: 500 });
    }
}

// POST: Cliente submete uma nova operação para aprovação
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

        // Reutiliza a função de salvar, mas com dados controlados
        // e o status default 'Pendente' da tabela será aplicado.
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
            p_cliente_id: clienteId, // USA O ID DO CLIENTE DO TOKEN
            p_conta_bancaria_id: null, // Admin definirá isso na aprovação
            p_valor_total_bruto: valorTotalBruto,
            p_valor_total_juros: valorTotalJuros,
            p_valor_total_descontos: 0, // Descontos são adicionados pelo admin
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
