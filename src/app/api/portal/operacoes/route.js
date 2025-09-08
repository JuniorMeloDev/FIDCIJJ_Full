import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';
import { sendOperationSubmittedEmail } from '@/app/lib/emailService';

// GET (sem alterações)
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


// POST: Salva uma nova operação E NOTIFICA ADMINS
export async function POST(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const clienteId = decoded.cliente_id;
        const clienteNome = decoded.cliente_nome;
        const userRoles = decoded.roles || [];

        if (!userRoles.includes('ROLE_CLIENTE') || !clienteId) {
             return NextResponse.json({ message: 'Ação não permitida para este usuário.' }, { status: 403 });
        }

        const body = await request.json();
        const notaFiscal = body.notasFiscais[0];
        const chaveNfe = notaFiscal.chave_nfe;

        if (!chaveNfe) {
            throw new Error("A Chave de Acesso da NF-e/CT-e é obrigatória para submeter a operação.");
        }

        // VERIFICA SE A OPERAÇÃO JÁ EXISTE com base na chave única
        const { data: existingOperation, error: existingError } = await supabase
            .from('operacoes')
            .select('id, status')
            .eq('chave_nfe', chaveNfe)
            .maybeSingle(); // Use maybeSingle para não dar erro se não encontrar nada

        if (existingError) {
            console.error("Erro ao verificar operação existente:", existingError);
            throw existingError;
        }

        if (existingOperation) {
            // Se já existe, retorna uma mensagem de erro clara para o cliente.
            throw new Error(`XML processado na Operação #${existingOperation.id} e seu Status é: ${existingOperation.status}). Não é possível enviar novamente`);
        }
        
        const valorTotalBruto = notaFiscal.valorNf;
        const valorTotalJuros = notaFiscal.jurosCalculado;
        const valorLiquido = notaFiscal.valorLiquidoCalculado;

        const { data: newOperacao, error: operacaoError } = await supabase
            .from('operacoes')
            .insert({
                data_operacao: body.dataOperacao,
                tipo_operacao_id: body.tipoOperacaoId,
                cliente_id: clienteId,
                valor_total_bruto: valorTotalBruto,
                valor_total_juros: valorTotalJuros,
                valor_total_descontos: 0,
                valor_liquido: valorLiquido,
                status: 'Pendente',
                conta_bancaria_id: null,
                chave_nfe: chaveNfe // Salva a chave da NFe
            })
            .select()
            .single();

        if (operacaoError) {
            console.error("Erro ao inserir nova operação:", operacaoError);
            // Verifica se o erro é de violação de chave única
            if (operacaoError.code === '23505') {
                 throw new Error(`Este documento (Chave: ...${chaveNfe.slice(-6)}) já foi enviado e está sendo processado.`);
            }
            throw new Error("Não foi possível criar o registro da operação.");
        }

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

        const { error: duplicatasError } = await supabase.from('duplicatas').insert(duplicatasParaSalvar);

        if (duplicatasError) {
            // Rollback: se der erro ao salvar as duplicatas, remove a operação criada.
            await supabase.from('operacoes').delete().eq('id', newOperacao.id);
            throw new Error("Não foi possível salvar os detalhes das parcelas. A operação foi cancelada.");
        }

        // --- LÓGICA DE NOTIFICAÇÃO ---
        const { data: admins } = await supabase.from('users').select('id, email').eq('roles', 'ROLE_ADMIN');
        
        if (admins && admins.length > 0) {
            const notifications = admins.map(admin => ({
                user_id: admin.id,
                title: `Nova Operação para Análise`,
                message: `O cliente ${clienteNome} enviou a operação #${newOperacao.id} no valor de R$ ${valorLiquido.toFixed(2)}.`,
                link: '/analise'
            }));
            await supabase.from('notifications').insert(notifications);

            const adminEmails = admins.map(a => a.email).filter(Boolean);
            if (adminEmails.length > 0) {
                await sendOperationSubmittedEmail({
                    clienteNome,
                    operacaoId: newOperacao.id,
                    valorLiquido,
                    adminEmails
                });
            }
        }
        // --- FIM DA LÓGICA DE NOTIFICAÇÃO ---

        return NextResponse.json({ operacaoId: newOperacao.id, message: 'Operação enviada para análise com sucesso!' }, { status: 201 });

    } catch (error) {
        console.error('Erro ao submeter operação:', error);
        return NextResponse.json({ message: error.message || 'Erro interno do servidor' }, { status: 500 });
    }
}

