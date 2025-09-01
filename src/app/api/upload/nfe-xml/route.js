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
      tagNameProcessors: [name => name.replace(/^.*:/, '')]
    });

    let inf, docType, numeroDoc, valorTotal, parcelas = [], emitNode, sacadoNode;

    // --- LÓGICA DE DETECÇÃO (NF-e ou CT-e) ---
    if (getVal(parsedXml, 'nfeProc.NFe.infNFe')) {
        docType = 'nfe';
        inf = getVal(parsedXml, 'nfeProc.NFe.infNFe');
        
        numeroDoc = getVal(inf, 'ide.nNF');
        valorTotal = parseFloat(getVal(inf, 'total.ICMSTot.vNF'));
        emitNode = getVal(inf, 'emit');
        sacadoNode = getVal(inf, 'dest'); // Na NF-e o sacado é sempre o destinatário
        
        const cobr = getVal(inf, 'cobr');
        parcelas = cobr?.dup?.map(p => ({
            numero: getVal(p, 'nDup'),
            dataVencimento: getVal(p, 'dVenc'),
            valor: parseFloat(getVal(p, 'vDup')),
        })) || [];

    } else if (getVal(parsedXml, 'cteProc.CTe.infCte')) {
        docType = 'cte';
        inf = getVal(parsedXml, 'cteProc.CTe.infCte');

        numeroDoc = getVal(inf, 'ide.nCT');
        valorTotal = parseFloat(getVal(inf, 'vPrest.vTPrest'));
        emitNode = getVal(inf, 'emit');

        // No CT-e, o "sacado" (pagador do frete) é o "Tomador do Serviço"
        const tomador = getVal(inf, 'ide.toma3.toma'); // 0=Remetente, 1=Expedidor, 2=Recebedor, 3=Destinatário
        switch (tomador) {
            case '0': sacadoNode = getVal(inf, 'rem'); break;
            case '1': sacadoNode = getVal(inf, 'exped'); break;
            case '2': sacadoNode = getVal(inf, 'receb'); break;
            case '3': sacadoNode = getVal(inf, 'dest'); break;
            default:  sacadoNode = getVal(inf, 'rem') || getVal(inf, 'dest'); // Fallback comum
        }
        // CT-e geralmente não tem detalhamento de parcelas no XML
        parcelas = [];

    } else {
        throw new Error("Estrutura do XML (NF-e ou CT-e) inválida ou não suportada.");
    }
    // --- FIM DA LÓGICA DE DETECÇÃO ---

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