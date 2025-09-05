import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';
import { parseStringPromise } from 'xml2js';
import PDFParser from "pdf2json";

// Funções de parsing de XML e PDF (adaptadas das suas rotas existentes)
const getVal = (obj, path) => path.split('.').reduce((acc, key) => acc?.[key]?.[0], obj);

const parseXml = async (xmlText) => {
    const parsedXml = await parseStringPromise(xmlText, { 
        explicitArray: true, 
        ignoreAttrs: true, 
        tagNameProcessors: [name => name.replace(/^.*:/, ''), name => name.replace(/{.*}/, '')] 
    });

    let numeroDoc, valorTotal, parcelas = [], emitNode, sacadoNode, dataEmissao, prazosString;

    // --- Lógica para NF-e ---
    const infNFe = parsedXml?.NFe?.infNFe?.[0] || parsedXml?.nfeProc?.[0]?.NFe?.[0]?.infNFe?.[0];
    if (infNFe) {
        numeroDoc = getVal(infNFe, 'ide.nNF');
        valorTotal = parseFloat(getVal(infNFe, 'total.ICMSTot.vNF') || 0);
        emitNode = infNFe.emit?.[0];
        sacadoNode = infNFe.dest?.[0];
        dataEmissao = getVal(infNFe, 'ide.dhEmi')?.substring(0, 10);
        
        const cobr = infNFe.cobr?.[0];
        parcelas = cobr?.dup?.map(p => ({
            dataVencimento: getVal(p, 'dVenc'),
        })) || [];
    }

    // --- Lógica para CT-e ---
    const infCte = parsedXml?.cteProc?.CTe?.[0]?.infCte?.[0] || parsedXml?.CTe?.infCte?.[0];
    if (!infNFe && infCte) {
        numeroDoc = getVal(infCte, 'ide.nCT');
        valorTotal = parseFloat(getVal(infCte, 'vPrest.vTPrest') || 0);
        emitNode = infCte.emit?.[0];
        dataEmissao = getVal(infCte, 'ide.dhEmi')?.substring(0, 10);

        const toma = getVal(infCte, 'ide.toma3.toma') || getVal(infCte, 'ide.toma4.toma');
        switch (toma) {
            case '0': sacadoNode = infCte.rem?.[0]; break;
            case '1': sacadoNode = infCte.exped?.[0]; break;
            case '2': sacadoNode = infCte.receb?.[0]; break;
            case '3': sacadoNode = infCte.dest?.[0]; break;
            default:  sacadoNode = infCte.rem?.[0];
        }
        parcelas = [];
    }

    if (!infNFe && !infCte) {
        throw new Error("Estrutura do XML inválida ou não suportada.");
    }

    const emitCnpj = getVal(emitNode, 'CNPJ');
    const destCnpjCpf = getVal(sacadoNode, 'CNPJ') || getVal(sacadoNode, 'CPF');

    const { data: sacadoData } = await supabase.from('sacados').select('*, condicoes_pagamento(*)').eq('cnpj', destCnpjCpf).single();
    if (!sacadoData) throw new Error(`Sacado com CNPJ/CPF ${destCnpjCpf} não encontrado no sistema.`);
    
    if (parcelas.length === 0 && sacadoData.condicoes_pagamento && sacadoData.condicoes_pagamento.length > 0) {
        const condicaoPadrao = sacadoData.condicoes_pagamento[0];
        prazosString = condicaoPadrao.prazos;
        parcelas = Array(condicaoPadrao.parcelas).fill({});
    } else {
        prazosString = parcelas.map(p => 
            Math.ceil(Math.abs(new Date(p.dataVencimento) - new Date(dataEmissao)) / (1000 * 60 * 60 * 24))
        ).join('/');
    }

    return {
        nfCte: numeroDoc,
        dataNf: dataEmissao,
        valorNf: valorTotal,
        clienteSacado: sacadoData.nome,
        parcelas: parcelas.length > 0 ? String(parcelas.length) : "1",
        prazos: prazosString || "0",
        cedenteCnpjVerificado: emitCnpj
    };
};

const parsePdf = async (buffer) => {
    // ... (esta função não precisa de alterações)
    const normalize = (str) => (str || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
    const CNPJ_ANY_RE = /(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}|\d{14})(?!\d)/;

    const findCnpjAround = (normText, idx, winFwd = 1200, winBack = 500) => {
      const forward = normText.slice(idx, idx + winFwd);
      const f = forward.match(CNPJ_ANY_RE);
      if (f) return f[1].replace(/\D/g, "");
      const back = normText.slice(Math.max(0, idx - winBack), idx + 50);
      const allBack = [...back.matchAll(new RegExp(CNPJ_ANY_RE, "g"))];
      if (allBack.length) return allBack[allBack.length - 1][1].replace(/\D/g, "");
      return null;
    }
    const cnpjNearLabel = (originalText, labels, winFwd = 1200, winBack = 500) => {
        const norm = normalize(originalText);
        for (const rawLabel of labels) {
            const label = normalize(rawLabel);
            const idx = norm.indexOf(label);
            if (idx !== -1) {
            const found = findCnpjAround(norm, idx + label.length, winFwd, winBack);
            if (found) return found;
            }
        }
        return null;
    }
    const extrairCnpjEmitente = (text) => {
        const m = text.match(/CNPJ[:\s]*([\d./-]{14,18})/i);
        return m ? m[1].replace(/\D/g, "") : null;
    }
    const pdfParser = new PDFParser(this, 1);
    let pdfText = "";
    await new Promise((resolve, reject) => {
        pdfParser.on("pdfParser_dataError", (err) => reject(new Error("Erro ao ler o ficheiro PDF.")));
        pdfParser.on("pdfParser_dataReady", () => {
            pdfText = pdfParser.getRawTextContent().replace(/[ \t]+/g, " ").trim();
            resolve();
        });
        pdfParser.parseBuffer(buffer);
    });
    const cnpjEmitente = extrairCnpjEmitente(pdfText);
    let cnpjSacado = cnpjNearLabel(pdfText, ["TOMADOR DO SERVIÇO", "TOMADOR DO SERVICO"], 1400, 600) || cnpjNearLabel(pdfText, ["REMETENTE"], 1400, 600);
    if (!cnpjSacado) throw new Error("Não foi possível extrair o CNPJ do Tomador ou Remetente do CT-e.");
    const { data: sacadoData } = await supabase.from('sacados').select('id, nome').eq('cnpj', cnpjSacado).single();
    if (!sacadoData) throw new Error(`Sacado com CNPJ ${cnpjSacado} não encontrado no sistema.`);
    const numeroCteMatch = pdfText.match(/N[ÚU]MERO\s*([0-9]{1,10})\s*DATA E HORA DE EMISS[ÃA]O/i);
    const dataEmissaoMatch = pdfText.match(/DATA E HORA DE EMISS[ÃA]O\s*([0-3]?\d\/[01]?\d\/\d{4})/i);
    const valorTotalMatch = pdfText.match(/VALOR TOTAL DA PRESTA[ÇC][ÃA]O DO SERVI[ÇC]O\s*([\d.,]+)/i);
    return {
        nfCte: numeroCteMatch ? numeroCteMatch[1] : "",
        dataNf: dataEmissaoMatch ? dataEmissaoMatch[1].split('/').reverse().join('-') : "",
        valorNf: valorTotalMatch ? parseFloat(valorTotalMatch[1].replace(/\./g, "").replace(",", ".")) : 0,
        clienteSacado: sacadoData.nome,
        parcelas: "1",
        prazos: "0",
        cedenteCnpjVerificado: cnpjEmitente
    };
};

// Rota Principal
export async function POST(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const clienteId = decoded.cliente_id;
        
        const { data: clienteAtual } = await supabase.from('clientes').select('cnpj').eq('id', clienteId).single();
        if (!clienteAtual) throw new Error('Cliente não encontrado.');

        const formData = await request.formData();
        const file = formData.get('file');
        const tipoOperacaoId = formData.get('tipoOperacaoId');
        
        if (!file || !tipoOperacaoId) return NextResponse.json({ message: 'Arquivo e tipo de operação são obrigatórios.' }, { status: 400 });

        let parsedData;
        const fileBuffer = Buffer.from(await file.arrayBuffer());

        if (file.type === 'text/xml' || file.name.endsWith('.xml')) {
            parsedData = await parseXml(fileBuffer.toString('utf-8'));
        } else if (file.type === 'application/pdf') {
            parsedData = await parsePdf(fileBuffer);
        } else {
            throw new Error("Formato de arquivo não suportado.");
        }

        if (parsedData.cedenteCnpjVerificado !== clienteAtual.cnpj) {
            throw new Error('O CNPJ do emitente no arquivo não corresponde ao seu cadastro.');
        }

        const { data: tipoOp, error: tipoOpError } = await supabase.from('tipos_operacao').select('*').eq('id', tipoOperacaoId).single();
        if (tipoOpError) throw new Error('Tipo de operação não encontrado.');

        let totalJuros = 0;
        const parcelas = parseInt(parsedData.parcelas) || 1;
        const valorParcelaBase = parsedData.valorNf / parcelas;
        const prazosArray = parsedData.prazos.split('/').map(p => parseInt(p.trim(), 10));
        const parcelasCalculadas = [];
        const dataOperacao = new Date().toISOString().split('T')[0];

        if (tipoOp.valor_fixo > 0) {
            totalJuros = tipoOp.valor_fixo;
            const jurosPorParcela = totalJuros / parcelas;
            for (let i = 0; i < prazosArray.length; i++) {
                const dataVencimento = new Date(parsedData.dataNf + 'T12:00:00Z');
                dataVencimento.setUTCDate(dataVencimento.getUTCDate() + prazosArray[i]);
                parcelasCalculadas.push({ numeroParcela: i + 1, dataVencimento: dataVencimento.toISOString().split('T')[0], valorParcela: valorParcelaBase, jurosParcela: jurosPorParcela });
            }
        } else {
            for (let i = 0; i < prazosArray.length; i++) {
                const prazoDias = prazosArray[i];
                
                // --- CORREÇÃO APLICADA AQUI ---
                // Cria a data em UTC para evitar problemas de fuso horário
                const dataVenc = new Date(parsedData.dataNf + 'T12:00:00Z'); 
                // Adiciona os dias do prazo
                dataVenc.setUTCDate(dataVenc.getUTCDate() + prazoDias);
                // --- FIM DA CORREÇÃO ---

                const diasCorridos = tipoOp.usar_prazo_sacado ? prazoDias : Math.ceil((dataVenc - new Date(dataOperacao)) / (1000 * 60 * 60 * 24));
                const jurosParcela = (valorParcelaBase * (tipoOp.taxa_juros / 100) / 30) * diasCorridos;
                totalJuros += jurosParcela;
                parcelasCalculadas.push({ numeroParcela: i + 1, dataVencimento: dataVenc.toISOString().split('T')[0], valorParcela: valorParcelaBase, jurosParcela: jurosParcela });
            }
        }

        const simulationResult = {
            ...parsedData,
            jurosCalculado: totalJuros,
            valorLiquidoCalculado: parsedData.valorNf - totalJuros,
            parcelasCalculadas,
        };

        return NextResponse.json(simulationResult, { status: 200 });

    } catch (error) {
        console.error("Erro na simulação:", error);
        return NextResponse.json({ message: error.message || 'Erro interno do servidor' }, { status: 500 });
    }
}