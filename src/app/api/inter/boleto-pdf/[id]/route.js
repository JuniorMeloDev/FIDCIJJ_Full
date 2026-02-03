import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';
import { PDFDocument } from 'pdf-lib';
import { getInterAccessToken, obterPdfCobrancaInter } from '@/app/lib/interService';

export async function GET(request, { params }) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const { id: operacaoId } = await params;
        if (!operacaoId) {
            return NextResponse.json({ message: 'ID da Operação é obrigatório.' }, { status: 400 });
        }

        const { searchParams } = new URL(request.url);
        const idsParam = searchParams.get('ids');
        const ids = idsParam ? idsParam.split(',').filter(Boolean) : [];

        let query = supabase
            .from('duplicatas')
            .select('*')
            .eq('operacao_id', operacaoId);

        if (ids.length > 0) {
            query = query.in('id', ids);
        }

        query = query
            .order('data_vencimento', { ascending: true })
            .order('nf_cte', { ascending: true });

        const { data: duplicatas, error: dupError } = await query;
        if (dupError) throw dupError;
        if (!duplicatas || duplicatas.length === 0) {
            throw new Error(`Nenhuma duplicata encontrada para a operação #${operacaoId}.`);
        }

        const contaCorrente = process.env.INTER_CONTA_CORRENTE;
        if (!contaCorrente) throw new Error('INTER_CONTA_CORRENTE não configurada.');

        const tokenData = await getInterAccessToken();
        const mergedPdf = await PDFDocument.create();
        let totalPages = 0;

        for (const duplicata of duplicatas) {
            const codigoSolicitacao = duplicata.codigo_solicitacao_inter;
            if (!codigoSolicitacao) {
                console.warn(`[AVISO PDF INTER] Duplicata ${duplicata.id} sem codigo_solicitacao_inter. Pulando.`);
                continue;
            }

            const pdfResponse = await obterPdfCobrancaInter(tokenData.access_token, contaCorrente, codigoSolicitacao);
            const pdfBase64 = (pdfResponse?.pdf || '').trim();
            if (!pdfBase64) {
                console.warn(`[AVISO PDF INTER] PDF vazio para duplicata ${duplicata.id}.`);
                continue;
            }

            const pdfBytes = Buffer.from(pdfBase64, 'base64');
            const pdfDoc = await PDFDocument.load(pdfBytes);
            const pages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
            pages.forEach(page => mergedPdf.addPage(page));
            totalPages += pages.length;
        }

        if (totalPages === 0) {
            throw new Error('Nenhum PDF válido foi recuperado para as duplicatas selecionadas.');
        }

        const mergedBytes = await mergedPdf.save();
        const filename = `Boletos_Inter_Operacao_${operacaoId}.pdf`;

        const headers = new Headers();
        headers.append('Content-Type', 'application/pdf');
        headers.append('Content-Disposition', `attachment; filename="${filename}"`);

        return new Response(Buffer.from(mergedBytes), { headers });
    } catch (error) {
        console.error('[ERRO PDF INTER]', error);
        return NextResponse.json({ message: error.message || 'Erro ao gerar PDF do Inter.' }, { status: 500 });
    }
}
