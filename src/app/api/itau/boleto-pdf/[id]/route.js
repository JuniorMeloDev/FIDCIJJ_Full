import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';
import { gerarPdfBoletoItau, getNossoNumeroDAC } from '@/app/lib/itauPdfService';

// Função HELPER para obter a URL base (mantida da correção anterior)
const getBaseURL = () => {
    let baseURL = process.env.NEXT_PUBLIC_APP_URL;
    if (!baseURL && process.env.VERCEL_URL) {
        baseURL = `https://${process.env.VERCEL_URL}`;
    }
    if (!baseURL) {
        baseURL = 'http://localhost:3000';
    }
    return baseURL.replace(/\/$/, '');
};

// Função getItauLogoBase64 (mantida da correção anterior)
const getItauLogoBase64 = async () => {
    const baseURL = getBaseURL();
    const logoURL = `${baseURL}/itau.png`;
    console.log(`[LOG ITAÚ PDF] Tentando buscar logo de: ${logoURL}`);
    try {
        const response = await fetch(logoURL, { cache: 'no-store' });
        console.log(`[LOG ITAÚ PDF] Fetch status: ${response.status}`);
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[ERRO ITAÚ PDF] Fetch falhou com status ${response.status}: ${errorText}`);
            throw new Error(`Falha ao buscar logo Itaú (${response.status}) - URL: ${logoURL}`);
        }
        const contentType = response.headers.get('content-type');
        console.log(`[LOG ITAÚ PDF] Fetch content-type: ${contentType}`);
        if (!contentType || !contentType.startsWith('image/')) {
             throw new Error(`Tipo de conteúdo inesperado (${contentType}) recebido de ${logoURL}`);
        }
        const imageBuffer = await response.arrayBuffer();
        console.log(`[LOG ITAÚ PDF] Buffer da imagem recebido, tamanho: ${imageBuffer.byteLength} bytes`);
        if (imageBuffer.byteLength === 0) {
            throw new Error(`Buffer da imagem vazio recebido de ${logoURL}`);
        }
        const base64String = Buffer.from(imageBuffer).toString('base64');
        console.log(`[LOG ITAÚ PDF] Logo convertido para base64 com sucesso.`);
        return `data:image/png;base64,${base64String}`;
    } catch (error) {
        console.error("[ERRO ITAÚ PDF] Exceção durante busca/conversão do logo:", error);
        return null;
    }
};


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

        // --- ACESSANDO VARIÁVEIS DE AMBIENTE ---
        const agencia = process.env.ITAU_AGENCIA;
        const contaCompleta = process.env.ITAU_CONTA; // Ex: "99359-6"
        const carteira = process.env.ITAU_BOLETO_CARTEIRA || '109'; // Padrão 109 se não definida

        if (!agencia || !contaCompleta) {
            console.error("[ERRO PDF ITAÚ API] Variáveis de ambiente ITAU_BOLETO_AGENCIA ou ITAU_BOLETO_CONTA_COMPLETA não definidas.");
            throw new Error("Configuração de conta Itaú para boletos incompleta no servidor.");
        }
        // Deriva a conta sem o dígito a partir da conta completa
        const contaSemDac = contaCompleta.split('-')[0].replace(/\D/g, '');
        // --- FIM VARIÁVEIS DE AMBIENTE ---

        const { data: duplicatas, error: dupError } = await supabase
            .from('duplicatas')
            .select('*, operacao:operacoes!inner(cliente:clientes!inner(*), tipo_operacao:tipos_operacao(*))')
            .eq('operacao_id', operacaoId);

        if (dupError) throw new Error('Falha ao consultar duplicatas: ' + dupError.message);
        if (!duplicatas || duplicatas.length === 0) throw new Error(`Nenhuma duplicata encontrada para a operação #${operacaoId}.`);

        const listaBoletos = [];
        for (const duplicata of duplicatas) {
            if (!duplicata.operacao?.cliente || !duplicata.sacado_id || !duplicata.linha_digitavel) {
                 console.warn(`[AVISO PDF ITAÚ API] Duplicata ${duplicata.id} pulada (dados incompletos ou linha_digitavel=${duplicata.linha_digitavel}).`);
                continue;
            }

            const { data: sacado, error: sacadoErr } = await supabase.from('sacados').select('*').eq('id', duplicata.sacado_id).single();
            if (sacadoErr || !sacado) {
                 console.warn(`[AVISO PDF ITAÚ API] Sacado ID ${duplicata.sacado_id} não encontrado (Erro: ${sacadoErr?.message}). Pulando duplicata ${duplicata.id}.`);
                 continue;
            }

            const nosso_numero = duplicata.id.toString().padStart(8, '0');
            // Calcula o DAC usando a conta SEM dígito
            const dac_nosso_numero = getNossoNumeroDAC(agencia, contaSemDac, carteira, nosso_numero);

            listaBoletos.push({
                ...duplicata,
                cedente: duplicata.operacao.cliente,
                sacado: sacado,
                agencia: agencia, // <-- Usa a variável
                conta: contaCompleta, // <-- Usa a variável para exibição
                carteira: carteira, // <-- Usa a variável
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

        if (!pdfBuffer || pdfBuffer.byteLength < 100) {
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
        console.error(`[ERRO FATAL PDF ITAÚ API] Falha na rota /api/itau/boleto-pdf/${params?.id}:`, error.message, error.stack);
        return NextResponse.json({ message: `Erro ao gerar PDF: ${error.message}` }, { status: 500 });
    }
}