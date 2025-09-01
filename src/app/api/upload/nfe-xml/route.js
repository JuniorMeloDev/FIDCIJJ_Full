import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';
import { parseStringPromise } from 'xml2js';

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
      tagNameProcessors: [name => name.replace(/^.*:/, '')] // remove namespace
    });

    let numeroDoc, valorTotal, parcelas = [], emitNode, sacadoNode, dataEmissao;

    // --- NF-e ---
    const infNFe = parsedXml?.NFe?.infNFe?.[0] || parsedXml?.nfeProc?.[0]?.NFe?.[0]?.infNFe?.[0];
    if (infNFe) {
      numeroDoc = infNFe.ide?.[0]?.nNF?.[0];
      valorTotal = parseFloat(infNFe.total?.[0]?.ICMSTot?.[0]?.vNF?.[0] || 0);
      emitNode = infNFe.emit?.[0];
      sacadoNode = infNFe.dest?.[0];
      dataEmissao = infNFe.ide?.[0]?.dhEmi?.[0]?.substring(0, 10);

      const cobr = infNFe.cobr?.[0];
      parcelas = cobr?.dup?.map(p => ({
        numero: p.nDup?.[0],
        dataVencimento: p.dVenc?.[0],
        valor: parseFloat(p.vDup?.[0] || 0),
      })) || [];
    }

    // --- CT-e ---
    const infCte = parsedXml?.cteProc?.CTe?.[0]?.infCte?.[0] || parsedXml?.CTe?.infCte?.[0];
    if (!infNFe && infCte) {
      numeroDoc = infCte.ide?.[0]?.nCT?.[0];
      valorTotal = parseFloat(infCte.vPrest?.[0]?.vTPrest?.[0] || 0);
      emitNode = infCte.emit?.[0];
      dataEmissao = infCte.ide?.[0]?.dhEmi?.[0]?.substring(0, 10);

      // Tomador (quem paga o frete)
      const toma = infCte.ide?.[0]?.toma3?.[0]?.toma?.[0] || infCte.ide?.[0]?.toma4?.[0]?.toma?.[0];
      switch (toma) {
        case '0': sacadoNode = infCte.rem?.[0]; break; // remetente
        case '1': sacadoNode = infCte.exped?.[0]; break; // expedidor
        case '2': sacadoNode = infCte.receb?.[0]; break; // recebedor
        case '3': sacadoNode = infCte.dest?.[0]; break; // destinatário
        default:  sacadoNode = infCte.rem?.[0]; // fallback
      }

      parcelas = []; // CT-e geralmente não tem parcelas
    }

    // Se nenhum dos dois foi detectado
    if (!infNFe && !infCte) {
      throw new Error("Estrutura do XML (NF-e ou CT-e) inválida ou não suportada.");
    }

    // --- Emitente e Sacado ---
    const emitCnpj = emitNode?.CNPJ?.[0];
    const sacadoCnpjCpf = sacadoNode?.CNPJ?.[0] || sacadoNode?.CPF?.[0];

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

    const enderSacado = sacadoNode?.enderDest?.[0] || sacadoNode?.enderReme?.[0];

    const responseData = {
      numeroNf: numeroDoc,
      dataEmissao,
      valorTotal,
      parcelas,
      emitente: {
        id: emitenteData?.id || null,
        nome: emitNode?.xNome?.[0],
        cnpj: emitCnpj,
        ramo_de_atividade: emitenteData?.ramo_de_atividade
      },
      emitenteExiste: !!emitenteData,
      sacado: {
        id: sacadoData?.id || null,
        nome: sacadoNode?.xNome?.[0],
        cnpj: sacadoCnpjCpf,
        ie: sacadoNode?.IE?.[0],
        endereco: enderSacado?.xLgr?.[0],
        bairro: enderSacado?.xBairro?.[0],
        municipio: enderSacado?.xMun?.[0],
        uf: enderSacado?.UF?.[0],
        cep: enderSacado?.CEP?.[0],
        fone: enderSacado?.fone?.[0],
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
