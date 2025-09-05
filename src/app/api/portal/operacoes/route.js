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
        
        const clienteId = decoded.cliente_id;
        
        if (!clienteId) {
            return NextResponse.json({ message: 'Usuário cliente sem empresa associada.' }, { status: 403 });
        }

        const { data, error } = await supabase
            .from('operacoes')
            .select('*, duplicatas(*)')
            .eq('cliente_id', clienteId)
            .order('data_operacao', { ascending: false });

        if (error) throw error;

        return NextResponse.json(data, { status: 200 });

    } catch (error) {
        console.error("Erro ao buscar operações do cliente:", error);
        return NextResponse.json({ message: error.message || 'Erro interno do servidor' }, { status: 500 });
    }
}


// POST: Salva uma nova operação enviada pelo cliente com status 'Pendente'
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
        const notaFiscal = body.notasFiscais[0]; // Portal envia uma de cada vez
        
        const valorTotalBruto = notaFiscal.valorNf;
        const valorTotalJuros = notaFiscal.jurosCalculado;
        const valorLiquido = notaFiscal.valorLiquidoCalculado;

        // 1. Inserir a operação principal com status "Pendente"
        const { data: newOperacao, error: operacaoError } = await supabase
            .from('operacoes')
            .insert({
                data_operacao: body.dataOperacao,
                tipo_operacao_id: body.tipoOperacaoId,
                cliente_id: clienteId,
                valor_total_bruto: valorTotalBruto,
                valor_total_juros: valorTotalJuros,
                valor_total_descontos: 0, // Descontos são adicionados pelo admin
                valor_liquido: valorLiquido,
                status: 'Pendente', // Status inicial é sempre pendente
                conta_bancaria_id: null // Conta será definida na aprovação
            })
            .select()
            .single();

        if (operacaoError) {
            console.error("Erro do Supabase ao inserir operação:", operacaoError);
            throw new Error("Não foi possível criar o registro da operação.");
        }

        // 2. Preparar e inserir as duplicatas associadas à nova operação
        const duplicatasParaSalvar = notaFiscal.parcelasCalculadas.map(p => ({
            operacao_id: newOperacao.id,
            data_operacao: body.dataOperacao,
            nf_cte: `${notaFiscal.nfCte}.${p.numeroParcela}`,
            cliente_sacado: notaFiscal.clienteSacado,
            valor_bruto: p.valorParcela,
            valor_juros: p.jurosParcela,
            data_vencimento: p.dataVencimento,
            status_recebimento: 'Pendente'
        }));

        const { error: duplicatasError } = await supabase
            .from('duplicatas')
            .insert(duplicatasParaSalvar);

        if (duplicatasError) {
            console.error("Erro do Supabase ao inserir duplicatas:", duplicatasError);
            // Idealmente, aqui se faria o rollback da operação inserida, mas para simplicidade, lançamos o erro.
            await supabase.from('operacoes').delete().eq('id', newOperacao.id);
            throw new Error("Não foi possível salvar os detalhes das parcelas (duplicatas). A operação foi cancelada.");
        }

        return NextResponse.json({ operacaoId: newOperacao.id, message: 'Operação enviada para análise com sucesso!' }, { status: 201 });

    } catch (error) {
        console.error('Erro ao submeter operação:', error);
        return NextResponse.json({ message: error.message || 'Erro interno do servidor' }, { status: 500 });
    }
}