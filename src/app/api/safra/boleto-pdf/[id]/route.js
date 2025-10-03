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

        // Busca a operação completa, incluindo a linha_digitavel e as regras de juros/multa.
        const { data: duplicatas, error: dupError } = await supabase
            .from('duplicatas')
            .select('*, operacao:operacoes!inner(cliente:clientes!inner(*), tipo_operacao:tipos_operacao(*))')
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
            // Valida se os dados essenciais para o PDF existem.
            if (!duplicata.operacao || !duplicata.operacao.cliente || !duplicata.operacao.tipo_operacao || !duplicata.linha_digitavel) {
                console.warn(`[AVISO PDF] Duplicata ${duplicata.id} com dados incompletos ou sem código de barras. Será pulada.`);
                continue;
            }
            
            const { data: sacado, error: sacadoError } = await supabase
                .from('sacados')
                .select('*')
                .eq('id', duplicata.sacado_id)
                .single();
            
            if (sacadoError || !sacado) {
                console.warn(`[AVISO PDF] Sacado com ID ${duplicata.sacado_id} não encontrado. Será pulada.`);
                continue;
            }

            // Monta o objeto completo para a geração do PDF, incluindo a duplicata inteira.
            listaBoletos.push({
                ...duplicata,
                cedente: duplicata.operacao.cliente,
                sacado: sacado,
            });
        }
        
        if (listaBoletos.length === 0) {
            throw new Error("Não foi possível montar os dados para nenhum boleto da operação (verifique se já foram registrados).");
        }

        const pdfBuffer = gerarPdfBoletoSafra(listaBoletos);
        
        const tipoDocumento = duplicatas[0]?.operacao?.cliente?.ramo_de_atividade === 'Transportes' ? 'CTe' : 'NF';
        const numerosDocumento = [...new Set(duplicatas.map(d => d.nf_cte.split('.')[0]))].join('_');
        const filename = `Boletos ${tipoDocumento} ${numerosDocumento}.pdf`;
        
        const headers = new Headers();
        headers.append('Content-Type', 'application/pdf');
        headers.append('Content-Disposition', `attachment; filename="${filename}"`);

        return new Response(pdfBuffer, { headers });

    } catch (error) {
        console.error("Erro ao gerar PDF do boleto Safra:", error);
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}