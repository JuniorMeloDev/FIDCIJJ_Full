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

        // --- EXPRESSÕES REGULARES CORRIGIDAS SEGUINDO A SUA LÓGICA DE NEGÓCIO ---

        // Cedente = Emitente (Transportadora, no topo do PDF)
        const cedenteMatch = pdfText.match(/TRANSREC TRANSPORTES E LOGISTICA\s*CNPJ:\s*([\d\.\/-]+)/i);

        // Sacado = Tomador do Serviço
        const sacadoMatch = pdfText.match(/TOMADOR DO SERVIÇO\s*(.*?)\s*CPF\/CNPJ\s*([\d\.\/-]+)/i);

        const numeroCteMatch = pdfText.match(/N DOCUMENTO\s+(\d+)/i) || pdfText.match(/NÚMERO\s+(\d+)\s+DATA/i);
        const dataEmissaoMatch = pdfText.match(/DATA E HORA DE EMISSÃO\s+(\d{2}\/\d{2}\/\d{4})/i);
        const valorTotalMatch = pdfText.match(/VALOR TOTAL DA PRESTAÇÃO DO SERVIÇO\s+([\d.,]+)/i);

        const cedenteCNPJ = cedenteMatch ? cedenteMatch[1].replace(/\D/g, '') : null;
        const sacadoCNPJ = sacadoMatch ? sacadoMatch[2].replace(/\D/g, '') : null;

        if (!cedenteCNPJ || !sacadoCNPJ) {
            console.error({cedenteMatch, sacadoMatch});
            throw new Error('Não foi possível extrair o CNPJ do Emitente (Cedente) ou do Tomador (Sacado) do CT-e.');
        }

        // Busca os dados no Supabase
        const { data: cedenteData } = await supabase.from('clientes').select('id, nome').eq('cnpj', cedenteCNPJ).single();
        const { data: sacadoData } = await supabase.from('sacados').select('id, nome').eq('cnpj', sacadoCNPJ).single();

        // Monta a resposta seguindo as suas regras de negócio
        const responseData = {
            numeroNf: numeroCteMatch ? numeroCteMatch[1] : '',
            dataNf: dataEmissaoMatch ? dataEmissaoMatch[1].split('/').reverse().join('-') : '', // Formata para AAAA-MM-DD
            valorNf: valorTotalMatch ? valorTotalMatch[1] : '0,00',
            parcelas: '1',
            prazos: '', // Vazio como pediu
            peso: '',   // Vazio como pediu
            clienteSacado: sacadoData?.nome || (sacadoMatch ? sacadoMatch[1].trim() : 'Sacado não encontrado'),
            emitente: {
                id: cedenteData?.id || null,
                nome: cedenteData?.nome || 'TRANSREC TRANSPORTES E LOGISTICA', // Usa o nome fixo se não encontrar
                cnpj: cedenteCNPJ
            },
            emitenteExiste: !!cedenteData,
            sacado: {
                id: sacadoData?.id || null,
                nome: sacadoData?.nome || (sacadoMatch ? sacadoMatch[1].trim() : 'Tomador não encontrado'),
                cnpj: sacadoCNPJ
            },
            sacadoExiste: !!sacadoData
        };

        return NextResponse.json(responseData, { status: 200 });

    } catch (error) {
        console.error('Erro ao processar PDF CT-e:', error);
        return NextResponse.json({ message: error.message || 'Erro interno do servidor' }, { status: 500 });
    }
}