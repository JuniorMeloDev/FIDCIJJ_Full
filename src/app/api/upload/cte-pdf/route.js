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

        const tomadorMatch = pdfText.match(/TOMADOR DO SERVIÇO\s*(.*?)\s*CPF\/CNPJ/i);
        const numeroCteMatch = pdfText.match(/NÚMERO\s+(\d+)\s+DATA E HORA DE EMISSÃO/i);
        const dataEmissaoMatch = pdfText.match(/DATA E HORA DE EMISSÃO\s+(\d{2}\/\d{2}\/\d{4})/i);
        const valorTotalMatch = pdfText.match(/VALOR TOTAL DA PRESTAÇÃO DO SERVIÇO\s+([\d.,]+)/i);

        // --- LÓGICA DO CEDENTE FIXO E BUSCA DO SACADO ---
        const cedenteNomeFixo = "TRANSREC CARGAS LTDA";
        const sacadoNomeExtraido = tomadorMatch ? tomadorMatch[1].trim() : null;

        if (!sacadoNomeExtraido) {
            throw new Error('Não foi possível extrair o nome do Tomador (Sacado) do CT-e.');
        }

        // Busca os dados do Cedente Fixo e do Sacado (pelo nome) no Supabase
        const { data: cedenteData } = await supabase.from('clientes').select('id, nome, cnpj').eq('nome', cedenteNomeFixo).single();
        const { data: sacadoData, error: sacadoError } = await supabase
            .from('sacados')
            .select('*, condicoes_pagamento(*)') // Pede para trazer as condições de pagamento
            .eq('nome', sacadoNomeExtraido)
            .single();

        if (!cedenteData) {
            throw new Error(`O cedente padrão "${cedenteNomeFixo}" não foi encontrado no seu cadastro de clientes.`);
        }

        const responseData = {
            numeroNf: numeroCteMatch ? numeroCteMatch[1] : '',
            dataNf: dataEmissaoMatch ? dataEmissaoMatch[1].split('/').reverse().join('-') : '',
            valorNf: valorTotalMatch ? valorTotalMatch[1] : '0,00',
            parcelas: '1', // Padrão
            prazos: '',    // Padrão
            peso: '',      // Padrão
            clienteSacado: sacadoNomeExtraido,
            // Dados do Cedente (fixo)
            emitente: {
                id: cedenteData.id,
                nome: cedenteData.nome,
                cnpj: cedenteData.cnpj
            },
            emitenteExiste: true,
            // Dados do Sacado (extraído)
            sacado: {
                id: sacadoData?.id || null,
                nome: sacadoNomeExtraido,
                cnpj: sacadoData?.cnpj || '',
                // Adiciona as condições de pagamento encontradas
                condicoes_pagamento: sacadoData?.condicoes_pagamento || []
            },
            sacadoExiste: !!sacadoData
        };

        return NextResponse.json(responseData, { status: 200 });

    } catch (error) {
        console.error('Erro ao processar PDF CT-e:', error);
        return NextResponse.json({ message: error.message || 'Erro interno do servidor' }, { status: 500 });
    }
}