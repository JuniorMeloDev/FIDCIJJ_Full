import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';
import { parseStringPromise } from 'xml2js';

// Função para simplificar o acesso a campos do XML
const getVal = (obj, path) => path.split('.').reduce((acc, key) => acc && acc[key] ? acc[key][0] : null, obj);

export async function POST(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const formData = await request.formData();
        const file = formData.get('file');

        if (!file) {
            return NextResponse.json({ message: 'Ficheiro não encontrado' }, { status: 400 });
        }

        const xmlText = await file.text();
        const parsedXml = await parseStringPromise(xmlText);

        const infNFe = getVal(parsedXml, 'nfeProc.NFe.0.infNFe.0') || getVal(parsedXml, 'NFe.0.infNFe.0');
        if (!infNFe) {
             throw new Error("Estrutura do XML de NF-e inválida ou não suportada.");
        }

        const emitCnpj = getVal(infNFe, 'emit.0.CNPJ.0');

        // --- CORREÇÃO AQUI: Procura por CNPJ ou CPF no destinatário ---
        const destCnpjCpf = getVal(infNFe, 'dest.0.CNPJ.0') || getVal(infNFe, 'dest.0.CPF.0');

        if (!emitCnpj || !destCnpjCpf) {
            throw new Error("Não foi possível encontrar o CNPJ do emitente ou o CNPJ/CPF do destinatário no XML.");
        }

        // Verifica se emitente e sacado existem no banco de dados
        const { data: emitenteData } = await supabase.from('clientes').select('id, nome').eq('cnpj', emitCnpj).single();
        const { data: sacadoData } = await supabase.from('sacados').select('id, nome').eq('cnpj', destCnpjCpf).single();

        const cobr = getVal(infNFe, 'cobr.0');
        const parcelas = cobr && cobr.dup ? cobr.dup.map(p => ({
            numero: getVal(p, 'nDup.0'),
            dataVencimento: getVal(p, 'dVenc.0'),
            valor: parseFloat(getVal(p, 'vDup.0')),
        })) : [];

        const responseData = {
            numeroNf: getVal(infNFe, 'ide.0.nNF.0'),
            dataEmissao: getVal(infNFe, 'ide.0.dhEmi.0').substring(0, 10),
            valorTotal: parseFloat(getVal(infNFe, 'total.0.ICMSTot.0.vNF.0')),
            parcelas: parcelas,
            emitente: {
                id: emitenteData?.id || null,
                nome: getVal(infNFe, 'emit.0.xNome.0'),
                cnpj: emitCnpj,
            },
            emitenteExiste: !!emitenteData,
            sacado: {
                nome: getVal(infNFe, 'dest.0.xNome.0'),
                cnpj: destCnpjCpf,
                ie: getVal(infNFe, 'dest.0.IE.0'),
                endereco: getVal(infNFe, 'dest.0.enderDest.0.xLgr.0'),
                bairro: getVal(infNFe, 'dest.0.enderDest.0.xBairro.0'),
                municipio: getVal(infNFe, 'dest.0.enderDest.0.xMun.0'),
                uf: getVal(infNFe, 'dest.0.enderDest.0.UF.0'),
                cep: getVal(infNFe, 'dest.0.enderDest.0.CEP.0'),
                fone: getVal(infNFe, 'dest.0.enderDest.0.fone.0'),
            },
            sacadoExiste: !!sacadoData
        };

        return NextResponse.json(responseData, { status: 200 });

    } catch (error) {
        console.error("Erro ao processar XML:", error);
        return NextResponse.json({ message: error.message || 'Erro interno do servidor' }, { status: 500 });
    }
}