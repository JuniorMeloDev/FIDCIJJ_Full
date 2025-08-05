import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';
import { parseStringPromise } from 'xml2js';

const getVal = (obj, path) => path.split('.').reduce((acc, key) => acc?.[key]?.[0], obj);

export async function POST(request) {
  try {
    const token = request.headers.get('Authorization')?.split(' ')[1];
    if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    jwt.verify(token, process.env.JWT_SECRET);

    const formData = await request.formData();
    const file = formData.get('file');
    if (!file) return NextResponse.json({ message: 'Arquivo não encontrado' }, { status: 400 });

    const xmlText = await file.text();

    // 🚀 Configuração para ignorar namespaces e atributos
    const parsedXml = await parseStringPromise(xmlText, {
      explicitArray: true,
      ignoreAttrs: true,
      tagNameProcessors: [name => name.replace(/^.*:/, '')]
    });

    // Tenta acessar com ou sem nfeProc
    const infNFe =
      getVal(parsedXml, 'nfeProc.NFe.infNFe') ||
      getVal(parsedXml, 'NFe.infNFe');

    if (!infNFe) {
      throw new Error("Estrutura do XML inválida ou não suportada.");
    }

    const emitCnpj = getVal(infNFe, 'emit.CNPJ');
    const destCnpjCpf = getVal(infNFe, 'dest.CNPJ') || getVal(infNFe, 'dest.CPF');

    const { data: emitenteData } = await supabase
      .from('clientes')
      .select('id, nome')
      .eq('cnpj', emitCnpj)
      .single();

    const { data: sacadoData } = await supabase
      .from('sacados')
      .select('id, nome')
      .eq('cnpj', destCnpjCpf)
      .single();

    const cobr = getVal(infNFe, 'cobr');
    const parcelas = cobr?.dup?.map(p => ({
      numero: getVal(p, 'nDup'),
      dataVencimento: getVal(p, 'dVenc'),
      valor: parseFloat(getVal(p, 'vDup')),
    })) || [];

    const responseData = {
      numeroNf: getVal(infNFe, 'ide.nNF'),
      dataEmissao: getVal(infNFe, 'ide.dhEmi')?.substring(0, 10),
      valorTotal: parseFloat(getVal(infNFe, 'total.ICMSTot.vNF')),
      parcelas,
      emitente: {
        id: emitenteData?.id || null,
        nome: getVal(infNFe, 'emit.xNome'),
        cnpj: emitCnpj,
      },
      emitenteExiste: !!emitenteData,
      sacado: {
        nome: getVal(infNFe, 'dest.xNome'),
        cnpj: destCnpjCpf,
        ie: getVal(infNFe, 'dest.IE'),
        endereco: getVal(infNFe, 'dest.enderDest.xLgr'),
        bairro: getVal(infNFe, 'dest.enderDest.xBairro'),
        municipio: getVal(infNFe, 'dest.enderDest.xMun'),
        uf: getVal(infNFe, 'dest.enderDest.UF'),
        cep: getVal(infNFe, 'dest.enderDest.CEP'),
        fone: getVal(infNFe, 'dest.enderDest.fone'),
      },
      sacadoExiste: !!sacadoData
    };

    return NextResponse.json(responseData, { status: 200 });

  } catch (error) {
    console.error("Erro ao processar XML:", error.stack || error);
    return NextResponse.json({ message: error.message || 'Erro interno do servidor' }, { status: 500 });
  }
}
