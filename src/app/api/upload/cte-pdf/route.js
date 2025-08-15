import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';
import PDFParser from "pdf2json"; 

export const runtime = 'nodejs';

export async function POST(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const formData = await request.formData();
        const file = formData.get('file');
        if (!file) {
            return NextResponse.json({ message: 'Arquivo não encontrado' }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());

        const pdfParser = new PDFParser(this, 1);
        let pdfText = '';

        await new Promise((resolve, reject) => {
            pdfParser.on("pdfParser_dataError", errData => {
                console.error(errData.parserError);
                reject(new Error("Erro ao ler o ficheiro PDF."));
            });
            pdfParser.on("pdfParser_dataReady", () => {
                pdfText = pdfParser.getRawTextContent().replace(/\s+/g, ' ').trim();
                resolve();
            });
            pdfParser.parseBuffer(buffer);
        });

        // --- EXPRESSÕES REGULARES CORRIGIDAS E MAIS ROBUSTAS ---
        const emitenteMatch = pdfText.match(/REMETENTE\s*(.*?)\s*CPF\/CNPJ\s*([\d\.\/-]+)/i);
        const tomadorMatch = pdfText.match(/TOMADOR DO SERVIÇO\s*(.*?)\s*CPF\/CNPJ\s*([\d\.\/-]+)/i);
        const numeroCteMatch = pdfText.match(/N DOCUMENTO\s+(\d+)/i) || pdfText.match(/CT-e\s+Nº\s+(\d+)/i);
        const dataEmissaoMatch = pdfText.match(/EMISSÃO\s+(\d{2}\/\d{2}\/\d{4})/i) || pdfText.match(/Data e Hora de Emissão\s+(\d{2}\/\d{2}\/\d{4})/i);
        const valorTotalMatch = pdfText.match(/VALOR TOTAL DA PRESTAÇÃO DO SERVIÇO\s+([\d.,]+)/i);

        const emitenteCNPJ = emitenteMatch ? emitenteMatch[2].replace(/\D/g, '') : null;
        const tomadorCNPJ = tomadorMatch ? tomadorMatch[2].replace(/\D/g, '') : null;

        if (!emitenteCNPJ || !tomadorCNPJ) {
            console.error({emitenteMatch, tomadorMatch});
            throw new Error('Não foi possível extrair o CNPJ do Remetente (Cedente) ou do Tomador (Sacado) do CT-e.');
        }

        // Busca os dados no Supabase
        const { data: emitenteData } = await supabase.from('clientes').select('id, nome').eq('cnpj', emitenteCNPJ).single();
        const { data: sacadoData } = await supabase.from('sacados').select('id, nome').eq('cnpj', tomadorCNPJ).single();

        const responseData = {
            tipo: 'cte',
            numeroNf: numeroCteMatch ? numeroCteMatch[1] : '',
            dataEmissao: dataEmissaoMatch ? dataEmissaoMatch[1].split('/').reverse().join('-') : '', // Formata para AAAA-MM-DD
            valorTotal: valorTotalMatch ? parseFloat(valorTotalMatch[1].replace(/\./g, '').replace(',', '.')) : 0,
            parcelas: [], // CT-e geralmente não tem parcelas
            emitente: {
                id: emitenteData?.id || null,
                nome: emitenteData?.nome || (emitenteMatch ? emitenteMatch[1].trim() : 'Remetente não encontrado'),
                cnpj: emitenteCNPJ
            },
            emitenteExiste: !!emitenteData,
            sacado: {
                id: sacadoData?.id || null,
                nome: sacadoData?.nome || (tomadorMatch ? tomadorMatch[1].trim() : 'Tomador não encontrado'),
                cnpj: tomadorCNPJ
            },
            sacadoExiste: !!sacadoData
        };

        return NextResponse.json(responseData, { status: 200 });

    } catch (error) {
        console.error('Erro ao processar PDF CT-e:', error);
        return NextResponse.json({ message: error.message || 'Erro interno do servidor' }, { status: 500 });
    }
}