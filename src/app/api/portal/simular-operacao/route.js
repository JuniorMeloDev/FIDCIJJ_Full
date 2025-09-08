import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';
import { parseStringPromise } from 'xml2js';

// Funções auxiliares de parsing de XML
const getVal = (obj, path) => path.split('.').reduce((acc, key) => acc?.[key]?.[0], obj);

const parseXml = async (xmlText) => {
    const parsedXml = await parseStringPromise(xmlText, { 
        explicitArray: true, 
        ignoreAttrs: false,
        tagNameProcessors: [name => name.replace(/^.*:/, ''), name => name.replace(/{.*}/, '')] 
    });

    let numeroDoc, valorTotal, parcelas = [], emitNode, sacadoNode, dataEmissao, prazosString, chaveNfe;

    const infNFe = parsedXml?.NFe?.infNFe?.[0] || parsedXml?.nfeProc?.[0]?.NFe?.[0]?.infNFe?.[0];
    if (infNFe) {
        chaveNfe = infNFe.$?.Id.replace('NFe', '');
        numeroDoc = getVal(infNFe, 'ide.nNF');
        valorTotal = parseFloat(getVal(infNFe, 'total.ICMSTot.vNF') || 0);
        emitNode = infNFe.emit?.[0];
        sacadoNode = infNFe.dest?.[0];
        dataEmissao = getVal(infNFe, 'ide.dhEmi')?.substring(0, 10);
        
        const cobr = infNFe.cobr?.[0];
        parcelas = cobr?.dup?.map(p => ({ dataVencimento: getVal(p, 'dVenc') })) || [];
    }

    const infCte = parsedXml?.cteProc?.CTe?.[0]?.infCte?.[0] || parsedXml?.CTe?.infCte?.[0];
    if (!infNFe && infCte) {
        chaveNfe = infCte.$?.Id.replace('CTe', '');
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

    if (!chaveNfe) {
        throw new Error("Não foi possível extrair a Chave de Acesso do documento XML.");
    }

    const destCnpjCpf = getVal(sacadoNode, 'CNPJ') || getVal(sacadoNode, 'CPF');
    const nomeSacadoXml = getVal(sacadoNode, 'xNome');

    const { data: sacadoData } = await supabase.from('sacados').select('*, condicoes_pagamento(*)').eq('cnpj', destCnpjCpf).single();
    
    if (!sacadoData) {
        throw new Error(`Sacado com CNPJ/CPF ${destCnpjCpf} (${nomeSacadoXml}) não está registado no sistema. Por favor, peça ao administrador para o registar.`);
    }
    
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
        chave_nfe: chaveNfe,
        nfCte: numeroDoc,
        dataNf: dataEmissao,
        valorNf: valorTotal,
        clienteSacado: sacadoData.nome,
        parcelas: parcelas.length > 0 ? String(parcelas.length) : "1",
        prazos: prazosString || "0",
        cedenteCnpjVerificado: getVal(emitNode, 'CNPJ')
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
        } else {
            throw new Error("Formato de arquivo não suportado. Por favor, envie um ficheiro XML.");
        }
        
        if (parsedData.cedenteCnpjVerificado !== clienteAtual.cnpj) {
            throw new Error('O CNPJ do emitente no arquivo não corresponde ao seu registo.');
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
                const dataVenc = new Date(parsedData.dataNf + 'T12:00:00Z'); 
                dataVenc.setUTCDate(dataVenc.getUTCDate() + prazoDias);

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

