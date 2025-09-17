import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';
import { gerarPdfBoletoSafra } from '@/app/lib/safraPdfService';

export async function GET(request, { params }) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const { id: operacaoId } = params;
        if (!operacaoId) {
            return NextResponse.json({ message: 'ID da Operação é obrigatório.' }, { status: 400 });
        }
        
        console.log(`[LOG PDF] Iniciando geração de PDF para Operação ID: ${operacaoId}`);

        const { data: duplicatas, error: dupError } = await supabase
            .from('duplicatas')
            .select('*, operacao:operacoes!inner(cliente:clientes!inner(*))')
            .eq('operacao_id', operacaoId);

        if (dupError) {
            console.error('[ERRO PDF] Erro ao buscar duplicatas no Supabase:', dupError);
            throw new Error('Falha ao consultar duplicatas no banco de dados.');
        }
        if (!duplicatas || duplicatas.length === 0) {
            throw new Error(`Nenhuma duplicata encontrada para a operação #${operacaoId}.`);
        }
        console.log(`[LOG PDF] ${duplicatas.length} duplicata(s) encontrada(s).`);

        const listaBoletos = [];
        for (const duplicata of duplicatas) {
            if (!duplicata.operacao || !duplicata.operacao.cliente) {
                console.warn(`[AVISO PDF] Duplicata ${duplicata.id} sem dados de operação ou cliente. Será pulada.`);
                continue;
            }
            
            const { data: sacado } = await supabase
                .from('sacados')
                .select('*')
                .eq('nome', duplicata.cliente_sacado)
                .single();
            
            if (!sacado) {
                console.warn(`[AVISO PDF] Sacado "${duplicata.cliente_sacado}" não encontrado para duplicata ${duplicata.id}. Será pulada.`);
                continue;
            }

            listaBoletos.push({
                agencia: "12400",
                conta: "008554440",
                cedente: duplicata.operacao.cliente,
                documento: {
                    numero: duplicata.id.toString().padStart(9, '0'),
                    numeroCliente: duplicata.nf_cte,
                    dataVencimento: duplicata.data_vencimento,
                    dataEmissao: duplicata.data_operacao,
                    valor: duplicata.valor_bruto,
                    especie: 'DM',
                    pagador: {
                        nome: sacado.nome,
                        numeroDocumento: sacado.cnpj,
                        endereco: {
                            logradouro: sacado.endereco,
                            bairro: sacado.bairro,
                            cidade: sacado.municipio,
                            uf: sacado.uf,
                            cep: sacado.cep,
                        }
                    }
                }
            });
        }
        
        if (listaBoletos.length === 0) {
            throw new Error("Não foi possível montar os dados para nenhum boleto da operação.");
        }

        const pdfBuffer = gerarPdfBoletoSafra(listaBoletos);
        
        const headers = new Headers();
        headers.append('Content-Type', 'application/pdf');
        headers.append('Content-Disposition', `attachment; filename="boletos_op_${operacaoId}.pdf"`);

        return new Response(pdfBuffer, { headers });

    } catch (error) {
        console.error("Erro ao gerar PDF do boleto Safra:", error);
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}