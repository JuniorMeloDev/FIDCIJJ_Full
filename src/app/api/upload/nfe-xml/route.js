import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';
import { parseStringPromise } from 'xml2js';

// Função auxiliar para extrair valores do XML parseado
const getVal = (obj, path) => path.split('.').reduce((acc, key) => acc?.[key]?.[0], obj);

export async function POST(request) {
  try {
    const token = request.headers.get('Authorization')?.split(' ')[1];
    if (!token) {
      return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    }
    jwt.verify(token, process.env.JWT_SECRET);

    const formData = await request.formData();
    const file = formData.get('file');
    if (!file) {
      return NextResponse.json({ message: 'Arquivo não encontrado' }, { status: 400 });
    }

    const xmlText = await file.text();
    const parsedXml = await parseStringPromise(xmlText, {
      explicitArray: true,
      ignoreAttrs: false, // Alterado para false para ler atributos como o 'Id'
      tagNameProcessors: [name => name.replace(/^.*:/, '')]
    });

    let numeroDoc, valorTotal, parcelas = [], emitNode, sacadoNode, dataEmissao, chaveNfe;

    // --- NF-e ---
    const infNFe = parsedXml?.NFe?.infNFe?.[0] || parsedXml?.nfeProc?.[0]?.NFe?.[0]?.infNFe?.[0];
    if (infNFe) {
      chaveNfe = infNFe.$?.Id.replace('NFe', '');
      numeroDoc = getVal(infNFe, 'ide.nNF');
      valorTotal = parseFloat(getVal(infNFe, 'total.ICMSTot.vNF') || 0);
      emitNode = infNFe.emit?.[0];
      sacadoNode = infNFe.dest?.[0];
      dataEmissao = getVal(infNFe, 'ide.dhEmi')?.substring(0, 10);

      const cobr = infNFe.cobr?.[0];
      parcelas = cobr?.dup?.map(p => ({
        numero: getVal(p, 'nDup'),
        dataVencimento: getVal(p, 'dVenc'),
        valor: parseFloat(getVal(p, 'vDup') || 0),
      })) || [];
    }

    // --- CT-e ---
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
    
    // --- VALIDAÇÃO DE DUPLICIDADE ---
    const { data: existingOperation, error: checkError } = await supabase
        .from('operacoes')
        .select('id, status')
        .eq('chave_nfe', chaveNfe)
        .maybeSingle();

    if (checkError) throw checkError;

    if (existingOperation) {
        throw new Error(`Este documento já foi processado (Operação #${existingOperation.id}, Status: ${existingOperation.status}).`);
    }

    // --- Emitente e Sacado ---
    const emitCnpj = getVal(emitNode, 'CNPJ');
    const sacadoCnpjCpf = getVal(sacadoNode, 'CNPJ') || getVal(sacadoNode, 'CPF');

    const { data: emitenteData } = await supabase
      .from('clientes')
      .select('id, nome, ramo_de_atividade')
      .eq('cnpj', emitCnpj)
      .single();

    const { data: sacadoData } = await supabase
      .from('sacados')
      .select('id, nome')
      .eq('cnpj', sacadoCnpjCpf)
      .single();

    const enderSacado = sacadoNode?.enderDest?.[0] || sacadoNode?.enderToma?.[0] || sacadoNode?.enderReme?.[0];

    const responseData = {
      numeroNf: numeroDoc,
      dataEmissao,
      valorTotal,
      parcelas,
      emitente: {
        id: emitenteData?.id || null,
        nome: getVal(emitNode, 'xNome'),
        cnpj: emitCnpj,
        ramo_de_atividade: emitenteData?.ramo_de_atividade
      },
      emitenteExiste: !!emitenteData,
      sacado: {
        id: sacadoData?.id || null,
        nome: getVal(sacadoNode, 'xNome'),
        cnpj: sacadoCnpjCpf,
        ie: getVal(sacadoNode, 'IE'),
        endereco: getVal(enderSacado, 'xLgr'),
        bairro: getVal(enderSacado, 'xBairro'),
        municipio: getVal(enderSacado, 'xMun'),
        uf: getVal(enderSacado, 'UF'),
        cep: getVal(enderSacado, 'CEP'),
        fone: getVal(enderSacado, 'fone'),
      },
      sacadoExiste: !!sacadoData
    };

    return NextResponse.json(responseData, { status: 200 });

  } catch (error) {
    console.error("Erro ao processar XML:", error.stack || error);
    return NextResponse.json(
      { message: error.message || 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
