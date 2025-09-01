import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';
import { parseStringPromise } from 'xml2js';

// Função auxiliar para extrair valores de forma segura do XML convertido
const getVal = (obj, path) =>
  path.split('.').reduce((acc, key) => acc?.[key]?.[0], obj);

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
      ignoreAttrs: true,
      // Garante que os namespaces (como <nfeProc> e <cteProc>) sejam removidos
      tagNameProcessors: [name => name.replace(/^.*:/, '')]
    });

    let inf, numeroDoc, valorTotal, parcelas = [], emitNode, sacadoNode;

    // --- LÓGICA DE DETECÇÃO CORRIGIDA E MAIS ROBUSTA ---
    if (parsedXml.nfeProc && getVal(parsedXml, 'nfeProc.NFe.infNFe')) {
        inf = getVal(parsedXml, 'nfeProc.NFe.infNFe');
        
        numeroDoc = getVal(inf, 'ide.nNF');
        valorTotal = parseFloat(getVal(inf, 'total.ICMSTot.vNF'));
        emitNode = getVal(inf, 'emit');
        sacadoNode = getVal(inf, 'dest');
        
        const cobr = getVal(inf, 'cobr');
        parcelas = cobr?.dup?.map(p => ({
            numero: getVal(p, 'nDup'),
            dataVencimento: getVal(p, 'dVenc'),
            valor: parseFloat(getVal(p, 'vDup')),
        })) || [];

    } else if (parsedXml.cteProc && getVal(parsedXml, 'cteProc.CTe.infCte')) {
        inf = getVal(parsedXml, 'cteProc.CTe.infCte');

        numeroDoc = getVal(inf, 'ide.nCT');
        valorTotal = parseFloat(getVal(inf, 'vPrest.vTPrest'));
        emitNode = getVal(inf, 'emit');

        const tomadorTipo = getVal(inf, 'ide.toma3.toma');
        switch (tomadorTipo) {
            case '0': sacadoNode = getVal(inf, 'rem'); break;
            case '1': sacadoNode = getVal(inf, 'exped'); break;
            case '2': sacadoNode = getVal(inf, 'receb'); break;
            case '3': sacadoNode = getVal(inf, 'dest'); break;
            default:  sacadoNode = getVal(inf, 'rem'); // Fallback para o remetente
        }
        parcelas = [];

    } else {
        // Se não encontrar nem nfeProc nem cteProc, o XML é inválido
        throw new Error("Estrutura do XML (NF-e ou CT-e) inválida ou não suportada.");
    }
    // --- FIM DA CORREÇÃO ---

    const emitCnpj = getVal(emitNode, 'CNPJ');
    const sacadoCnpjCpf = getVal(sacadoNode, 'CNPJ') || getVal(sacadoNode, 'CPF');

    const { data: emitenteData } = await supabase.from('clientes').select('id, nome, ramo_de_atividade').eq('cnpj', emitCnpj).single();
    const { data: sacadoData } = await supabase.from('sacados').select('id, nome').eq('cnpj', sacadoCnpjCpf).single();
    
    const enderSacado = getVal(sacadoNode, 'enderDest') || getVal(sacadoNode, 'enderReme');

    const responseData = {
      numeroNf: numeroDoc,
      dataEmissao: getVal(inf, 'ide.dhEmi')?.substring(0, 10),
      valorTotal: valorTotal,
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