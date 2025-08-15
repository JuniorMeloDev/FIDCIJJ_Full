// /app/api/upload/cte-pdf/route.js

import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import pdf from 'pdf-parse';
import { supabase } from '@/app/utils/supabaseClient';

export async function POST(request) {
    try {
        // Valida token
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const formData = await request.formData();
        const file = formData.get('file');
        if (!file) {
            return NextResponse.json({ message: 'Arquivo não enviado' }, { status: 400 });
        }

        // Converte PDF para texto
        const buffer = Buffer.from(await file.arrayBuffer());
        const data = await pdf(buffer);
        const texto = data.text;

        // Extrair CNPJ Emitente
        const emitenteCnpjMatch = texto.match(/CNPJ\s+Emitente\s+(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/);
        const emitenteCnpj = emitenteCnpjMatch ? emitenteCnpjMatch[1].replace(/\D/g, '') : null;

        // Extrair Nome Emitente (opcional)
        const emitenteNomeMatch = texto.match(/Emitente\s+([\w\s&\-\.\,]+)/);
        const emitenteNome = emitenteNomeMatch ? emitenteNomeMatch[1].trim() : null;

        // Extrair Tomador do serviço
        const tomadorMatch = texto.match(/Tomador\s+do\s+Serviço\s+(.+?)\s+CNPJ\s+(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/);
        const sacadoNome = tomadorMatch ? tomadorMatch[1].trim() : null;
        const sacadoCnpj = tomadorMatch ? tomadorMatch[2].replace(/\D/g, '') : null;

        // Extrair número CT-e
        const numeroCteMatch = texto.match(/CT-e\s+(\d{8,})/);
        const numeroCte = numeroCteMatch ? numeroCteMatch[1] : null;

        // Extrair data emissão (formato dd/mm/yyyy)
        const dataEmissaoMatch = texto.match(/Data\s+de\s+Emissão\s+(\d{2}\/\d{2}\/\d{4})/);
        const dataEmissao = dataEmissaoMatch ? dataEmissaoMatch[1].split('/').reverse().join('-') : null;

        // Extrair valor do frete
        const valorMatch = texto.match(/Valor\s+do\s+Frete\s+R\$\s*([\d\.,]+)/);
        const valorFrete = valorMatch ? parseFloat(valorMatch[1].replace(/\./g, '').replace(',', '.')) : null;

        if (!emitenteCnpj || !sacadoCnpj) {
            throw new Error("Não foi possível extrair Emitente ou Tomador do CT-e");
        }

        // Verifica no banco
        const { data: emitenteData } = await supabase.from('clientes').select('id, nome').eq('cnpj', emitenteCnpj).single();
        const { data: sacadoData } = await supabase.from('sacados').select('id, nome').eq('cnpj', sacadoCnpj).single();

        // Monta resposta
        const responseData = {
            numeroNf: numeroCte,
            dataEmissao,
            valorTotal: valorFrete,
            parcelas: [], // CT-e não tem parcelas
            emitente: {
                id: emitenteData?.id || null,
                nome: emitenteNome,
                cnpj: emitenteCnpj
            },
            emitenteExiste: !!emitenteData,
            sacado: {
                nome: sacadoNome,
                cnpj: sacadoCnpj
            },
            sacadoExiste: !!sacadoData,
            dataDevolucao: null // sem vencimento pré-definido
        };

        return NextResponse.json(responseData, { status: 200 });

    } catch (error) {
        console.error("Erro ao processar CT-e PDF:", error);
        return NextResponse.json({ message: error.message || 'Erro interno do servidor' }, { status: 500 });
    }
}
