import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';
import PDFParser from "pdf2json";

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

        // --- EXPRESSÕES REGULARES CORRIGIDAS ---
        // Sacado = Tomador do Serviço
        const tomadorMatch = pdfText.match(/TOMADOR DO SERVIÇO\s*(.*?)\s*([\d\.\/-]+)\s*IE/i);
        const numeroCteMatch = pdfText.match(/NÚMERO\s+(\d+)\s+DATA E HORA DE EMISSÃO/i);
        const dataEmissaoMatch = pdfText.match(/DATA E HORA DE EMISSÃO\s+(\d{2}\/\d{2}\/\d{4})/i);
        const valorTotalMatch = pdfText.match(/VALOR TOTAL DA PRESTAÇÃO DO SERVIÇO\s+([\d.,]+)/i);

        // --- LÓGICA DO CEDENTE FIXO ---
        const cedenteNomeFixo = "TRANSREC CARGAS LTDA";
        const sacadoNome = tomadorMatch ? tomadorMatch[1].trim().replace(/CPF\/CNPJ/i, '').trim() : null;
        const sacadoCNPJ = tomadorMatch ? tomadorMatch[2].replace(/\D/g, '') : null;

        if (!sacadoCNPJ) {
            console.error({tomadorMatch});
            throw new Error('Não foi possível extrair o CNPJ do Tomador (Sacado) do CT-e.');
        }

        // Busca os dados do Cedente Fixo e do Sacado no Supabase
        const { data: cedenteData } = await supabase.from('clientes').select('id, nome, cnpj').eq('nome', cedenteNomeFixo).single();
        const { data: sacadoData } = await supabase.from('sacados').select('id, nome').eq('cnpj', sacadoCNPJ).single();

        if (!cedenteData) {
            throw new Error(`O cedente padrão "${cedenteNomeFixo}" não foi encontrado no cadastro de clientes.`);
        }

        // Monta a resposta seguindo as suas regras de negócio
        const responseData = {
            numeroNf: numeroCteMatch ? numeroCteMatch[1] : '',
            dataNf: dataEmissaoMatch ? dataEmissaoMatch[1].split('/').reverse().join('-') : '',
            valorNf: valorTotalMatch ? valorTotalMatch[1] : '0,00',
            parcelas: '1',
            prazos: '',
            peso: '',
            clienteSacado: sacadoData?.nome || sacadoNome,
            emitente: { // O emitente agora é o nosso Cedente Fixo
                id: cedenteData.id,
                nome: cedenteData.nome,
                cnpj: cedenteData.cnpj
            },
            emitenteExiste: true,
            sacado: {
                id: sacadoData?.id || null,
                nome: sacadoData?.nome || sacadoNome,
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