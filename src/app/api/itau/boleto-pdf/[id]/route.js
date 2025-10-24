import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';
import { gerarPdfBoletoItau, getNossoNumeroDAC } from '@/app/lib/itauPdfService';

// Marcar como async
export async function GET(request, { params }) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const { id: operacaoId } = params;
        if (!operacaoId) {
            return NextResponse.json({ message: 'ID da Operação é obrigatório.' }, { status: 400 });
        }

        console.log(`[LOG PDF ITAÚ API] Iniciando PDF para Operação ID: ${operacaoId}`);

        const { data: duplicatas, error: dupError } = await supabase
            .from('duplicatas')
            .select('*, operacao:operacoes!inner(cliente:clientes!inner(*), tipo_operacao:tipos_operacao(*))')
            .eq('operacao_id', operacaoId);

        if (dupError) throw new Error('Falha ao consultar duplicatas: ' + dupError.message);
        if (!duplicatas || duplicatas.length === 0) throw new Error(`Nenhuma duplicata encontrada para a operação #${operacaoId}.`);

        const listaBoletos = [];
        for (const duplicata of duplicatas) {
            // Adicionado log para linha_digitavel ausente
            if (!duplicata.operacao?.cliente || !duplicata.sacado_id || !duplicata.linha_digitavel) {
                 console.warn(`[AVISO PDF ITAÚ API] Duplicata ${duplicata.id} pulada (dados incompletos ou linha_digitavel=${duplicata.linha_digitavel}).`);
                continue;
            }

            const { data: sacado, error: sacadoErr } = await supabase.from('sacados').select('*').eq('id', duplicata.sacado_id).single();
            if (sacadoErr || !sacado) {
                 console.warn(`[AVISO PDF ITAÚ API] Sacado ID ${duplicata.sacado_id} não encontrado (Erro: ${sacadoErr?.message}). Pulando duplicata ${duplicata.id}.`);
                 continue;
            }

            const agencia = '0550';
            const conta = '99359';
            const carteira = '109';
            const nosso_numero = duplicata.id.toString().padStart(8, '0');
            const dac_nosso_numero = getNossoNumeroDAC(agencia, conta, carteira, nosso_numero);

            listaBoletos.push({
                ...duplicata,
                cedente: duplicata.operacao.cliente,
                sacado: sacado,
                agencia: agencia,
                conta: process.env.ITAU_PIX_CONTA_REAL || conta,
                carteira: carteira,
                nosso_numero: nosso_numero,
                dac_nosso_numero: dac_nosso_numero,
                numero_documento: duplicata.nf_cte,
                operacao: duplicata.operacao,
                abatimento: duplicata.valor_abatimento || 0
            });
        }

        if (listaBoletos.length === 0) throw new Error("Nenhum boleto válido para gerar PDF nesta operação.");

        console.log(`[LOG PDF ITAÚ API] Gerando PDF para ${listaBoletos.length} boleto(s)...`);
        const pdfBuffer = await gerarPdfBoletoItau(listaBoletos); // Usar await
        console.log(`[LOG PDF ITAÚ API] PDF Buffer gerado, tamanho: ${pdfBuffer.byteLength} bytes`);

        if (!pdfBuffer || pdfBuffer.byteLength < 100) { // Verifica se o buffer parece válido
             console.error("[ERRO PDF ITAÚ API] PDF Buffer gerado parece inválido ou vazio.");
             throw new Error("Erro interno: O conteúdo do PDF gerado está vazio ou inválido.");
        }

        const tipoDocumento = duplicatas[0]?.operacao?.cliente?.ramo_de_atividade === 'Transportes' ? 'CTe' : 'NF';
        const numerosDocumento = [...new Set(duplicatas.map(d => d.nf_cte.split('.')[0]))].join('_');
        const filename = `Boletos_${tipoDocumento}_${numerosDocumento}.pdf`;

        const headers = new Headers();
        headers.append('Content-Type', 'application/pdf');
        headers.append('Content-Disposition', `attachment; filename="${filename}"`);

        console.log(`[LOG PDF ITAÚ API] Enviando resposta PDF com nome: ${filename}`);
        return new Response(pdfBuffer, { headers });

    } catch (error) {
        // Log aprimorado
        console.error(`[ERRO FATAL PDF ITAÚ API] Falha na rota /api/itau/boleto-pdf/${params?.id}:`, error.message, error.stack);
        return NextResponse.json({ message: `Erro ao gerar PDF: ${error.message}` }, { status: 500 });
    }
}