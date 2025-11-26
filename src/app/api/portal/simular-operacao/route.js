import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';
import { parseStringPromise } from 'xml2js';

// Função auxiliar segura
const getVal = (obj, path) => path.split('.').reduce((acc, key) => acc?.[key]?.[0], obj);

// Função auxiliar para limpar CNPJ/CPF (remove não-números)
const clearDoc = (doc) => doc ? doc.replace(/\D/g, '') : '';

const parseXmlAndSimulate = async (xmlText, clienteCnpj, tipoOperacaoId) => {
    const parsedXml = await parseStringPromise(xmlText, { 
        explicitArray: true, 
        ignoreAttrs: false,
        tagNameProcessors: [name => name.replace(/^.*:/, ''), name => name.replace(/{.*}/, '')] 
    });

    let numeroDoc, valorTotal, parcelas = [], emitNode, sacadoNode, dataEmissao, prazosString, chaveNfe;

    // Tenta ler como NF-e
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

    // Tenta ler como CT-e
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

    if (!chaveNfe) throw new Error("Não foi possível extrair a Chave de Acesso do XML.");

    // VALIDAÇÃO DE CNPJ CORRIGIDA (Remove formatação antes de comparar)
    const cnpjEmitenteXml = clearDoc(getVal(emitNode, 'CNPJ'));
    const cnpjClienteDb = clearDoc(clienteCnpj);

    if (cnpjEmitenteXml !== cnpjClienteDb) {
        throw new Error(`O CNPJ do emitente no XML (${numeroDoc}) não corresponde ao seu cadastro.`);
    }
    
    // VERIFICA SE A OPERAÇÃO JÁ EXISTE
    const { data: existingOperation } = await supabase.from('operacoes').select('id').eq('chave_nfe', chaveNfe).maybeSingle();
    if (existingOperation) return { chave_nfe: chaveNfe, nfCte: numeroDoc, isDuplicate: true };

    const destCnpjCpf = getVal(sacadoNode, 'CNPJ') || getVal(sacadoNode, 'CPF');
    const nomeSacadoXml = getVal(sacadoNode, 'xNome');
    
    // Busca Sacado
    const { data: sacadoData } = await supabase.from('sacados').select('*, condicoes_pagamento(*)').eq('cnpj', destCnpjCpf).single();
    
    if (!sacadoData) throw new Error(`Sacado com CNPJ/CPF ${destCnpjCpf} (${nomeSacadoXml}) não está cadastrado.`);
    
    // LÓGICA DE PRAZOS
    // Se tiver parcelas no XML (ou a padrão do CTe), usamos elas para calcular os prazos.
    // Se não tiver parcelas (ex: NFe sem cobrança), tentamos usar a condição de pagamento do sacado.
    if ((!parcelas || parcelas.length === 0) && sacadoData.condicoes_pagamento?.length > 0) {
        const condicaoPadrao = sacadoData.condicoes_pagamento[0];
        prazosString = condicaoPadrao.prazos;
        parcelas = Array(condicaoPadrao.parcelas).fill({}); // Cria array vazio só para contagem
    } else {
        // Garante que parcelas não seja vazio para o CTe
        const listaParcelas = (parcelas && parcelas.length > 0) ? parcelas : [{ dataVencimento: dataEmissao }];
        
        prazosString = listaParcelas.map(p => {
            const dVenc = new Date(p.dataVencimento);
            const dEmis = new Date(dataEmissao);
            // Diferença em dias
            return Math.ceil(Math.abs(dVenc - dEmis) / (1000 * 60 * 60 * 24));
        }).join('/');
    }

    const { data: tipoOp } = await supabase.from('tipos_operacao').select('*').eq('id', tipoOperacaoId).single();
    if (!tipoOp) throw new Error('Tipo de operação não encontrado.');

    let totalJuros = 0;
    // Divide pelo número real de prazos gerados
    const prazosArray = prazosString.length > 0 ? prazosString.split('/').map(p => parseInt(p.trim(), 10)) : [0];
    const numParcelas = prazosArray.length;
    const valorParcelaBase = valorTotal / numParcelas;
    
    const parcelasCalculadas = [];
    const dataOperacao = new Date().toISOString().split('T')[0];

    if (tipoOp.valor_fixo > 0) {
        totalJuros = tipoOp.valor_fixo;
        const jurosPorParcela = totalJuros / numParcelas;
        for (let i = 0; i < prazosArray.length; i++) {
            const dataVencimento = new Date(dataEmissao + 'T12:00:00Z');
            dataVencimento.setUTCDate(dataVencimento.getUTCDate() + prazosArray[i]);
            parcelasCalculadas.push({ numeroParcela: i + 1, dataVencimento: dataVencimento.toISOString().split('T')[0], valorParcela: valorParcelaBase, jurosParcela: jurosPorParcela });
        }
    } else {
        for (let i = 0; i < prazosArray.length; i++) {
            const prazoDias = prazosArray[i];
            const dataVenc = new Date(dataEmissao + 'T12:00:00Z'); 
            dataVenc.setUTCDate(dataVenc.getUTCDate() + prazoDias);
            
            // Ajuste da data base para juros (Data Operação vs Data Emissão)
            const diasCorridos = tipoOp.usar_prazo_sacado ? prazoDias : Math.ceil((dataVenc - new Date(dataOperacao)) / (1000 * 60 * 60 * 24));
            
            // Evita juros negativos se dataOperacao for anterior à emissão (raro, mas possível em testes)
            const diasEfetivos = Math.max(0, diasCorridos);
            
            const jurosParcela = (valorParcelaBase * (tipoOp.taxa_juros / 100) / 30) * diasEfetivos;
            totalJuros += jurosParcela;
            parcelasCalculadas.push({ numeroParcela: i + 1, dataVencimento: dataVenc.toISOString().split('T')[0], valorParcela: valorParcelaBase, jurosParcela: jurosParcela });
        }
    }

    return {
        chave_nfe: chaveNfe,
        nfCte: numeroDoc,
        dataNf: dataEmissao,
        valorNf: valorTotal,
        clienteSacado: sacadoData.nome,
        sacadoId: sacadoData.id,
        jurosCalculado: totalJuros,
        valorLiquidoCalculado: valorTotal - totalJuros,
        parcelasCalculadas,
        isDuplicate: false,
    };
};

export async function POST(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const clienteId = decoded.cliente_id; // Confirme se seu token usa 'cliente_id' ou busca user->cliente
        
        // Busca CNPJ do cliente logado
        const { data: clienteAtual } = await supabase.from('clientes').select('cnpj').eq('id', clienteId).single();
        
        // Se não achar direto pelo token, tenta buscar via User ID (caso o token tenha user_id)
        let cnpjCliente = clienteAtual?.cnpj;
        if (!cnpjCliente && decoded.id) {
             const { data: userProfile } = await supabase.from('users').select('clientes(cnpj)').eq('id', decoded.id).single();
             cnpjCliente = userProfile?.clientes?.cnpj;
        }

        if (!cnpjCliente) throw new Error('Cliente não encontrado ou sem CNPJ cadastrado.');

        const formData = await request.formData();
        const files = formData.getAll('files');
        const tipoOperacaoId = formData.get('tipoOperacaoId');
        
        if (!files || files.length === 0 || !tipoOperacaoId) {
            return NextResponse.json({ message: 'Arquivos e tipo de operação são obrigatórios.' }, { status: 400 });
        }
        
        const simulationPromises = files.map(async file => {
            try {
                const fileBuffer = Buffer.from(await file.arrayBuffer());
                const xmlText = fileBuffer.toString('utf-8');
                return await parseXmlAndSimulate(xmlText, cnpjCliente, tipoOperacaoId);
            } catch (error) {
                return { error: error.message, fileName: file.name };
            }
        });

        const results = await Promise.all(simulationPromises);

        const totals = results.reduce((acc, res) => {
            if (res && !res.isDuplicate && !res.error) {
                acc.totalBruto += res.valorNf;
                acc.totalJuros += res.jurosCalculado;
                acc.totalLiquido += res.valorLiquidoCalculado;
            }
            return acc;
        }, { totalBruto: 0, totalJuros: 0, totalLiquido: 0 });

        return NextResponse.json({ results, totals }, { status: 200 });

    } catch (error) {
        console.error("Erro na simulação:", error);
        return NextResponse.json({ message: error.message || 'Erro interno do servidor' }, { status: 500 });
    }
}