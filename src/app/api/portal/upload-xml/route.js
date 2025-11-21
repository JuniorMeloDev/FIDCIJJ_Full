import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';
import { parseStringPromise } from 'xml2js';

// Função auxiliar
const getVal = (obj, path) => path.split('.').reduce((acc, key) => acc?.[key]?.[0], obj);

export async function POST(request) {
  try {
    // 1. Autenticação do Cliente
    const token = request.headers.get('Authorization')?.split(' ')[1];
    if (!token) {
      return NextResponse.json({ message: 'Token não fornecido' }, { status: 401 });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.id || decoded.sub; // Ajuste conforme seu payload JWT
    
    // Busca o CNPJ do cliente logado para validar se o XML é dele
    const { data: userProfile, error: profileError } = await supabase
        .from('users') // Ou tabela de perfis vinculada
        .select('cliente_id, clientes(cnpj)')
        .eq('id', userId)
        .single();
        
    if (profileError || !userProfile?.clientes?.cnpj) {
        return NextResponse.json({ message: 'Perfil de cliente não encontrado.' }, { status: 403 });
    }
    
    const cnpjClienteLogado = userProfile.clientes.cnpj.replace(/\D/g, '');

    // 2. Processamento do Arquivo
    const formData = await request.formData();
    const file = formData.get('file');
    if (!file) {
      return NextResponse.json({ message: 'Arquivo XML não encontrado.' }, { status: 400 });
    }

    const xmlText = await file.text();
    const parsedXml = await parseStringPromise(xmlText, {
      explicitArray: true,
      ignoreAttrs: false,
      tagNameProcessors: [name => name.replace(/^.*:/, '')] // Remove namespaces (ns2:, cfe:, etc)
    });

    let numeroDoc, valorTotal, parcelas = [], emitNode, sacadoNode, dataEmissao, chaveDoc;
    let tipoDocumento = '';

    // --- LÓGICA INTELIGENTE (Igual ao Admin) ---

    // Tenta ler como NF-e
    const infNFe = parsedXml?.NFe?.infNFe?.[0] || parsedXml?.nfeProc?.[0]?.NFe?.[0]?.infNFe?.[0];
    
    // Tenta ler como CT-e
    const infCte = parsedXml?.cteProc?.CTe?.[0]?.infCte?.[0] || parsedXml?.CTe?.infCte?.[0];

    if (infNFe) {
      tipoDocumento = 'NFe';
      chaveDoc = infNFe.$?.Id?.replace('NFe', '');
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

    } else if (infCte) {
      tipoDocumento = 'CTe';
      chaveDoc = infCte.$?.Id?.replace('CTe', '');
      numeroDoc = getVal(infCte, 'ide.nCT');
      valorTotal = parseFloat(getVal(infCte, 'vPrest.vTPrest') || 0);
      emitNode = infCte.emit?.[0];
      dataEmissao = getVal(infCte, 'ide.dhEmi')?.substring(0, 10);

      // Lógica complexa do Tomador do CT-e
      const toma = getVal(infCte, 'ide.toma3.toma') || getVal(infCte, 'ide.toma4.toma');
      switch (toma) {
        case '0': sacadoNode = infCte.rem?.[0]; break;   // Remetente
        case '1': sacadoNode = infCte.exped?.[0]; break; // Expedidor
        case '2': sacadoNode = infCte.receb?.[0]; break; // Recebedor
        case '3': sacadoNode = infCte.dest?.[0]; break;  // Destinatário
        default:  sacadoNode = infCte.rem?.[0];          // Fallback
      }
      
      // CT-e geralmente não tem duplicatas explícitas, criamos uma parcela única por padrão
      // O front-end deve permitir editar isso
      parcelas = [{
          numero: '1',
          dataVencimento: dataEmissao, // CTe à vista ou negociado a parte
          valor: valorTotal
      }];
    } else {
      return NextResponse.json({ message: 'Formato de XML não reconhecido (Apenas NFe ou CTe).' }, { status: 400 });
    }

    // 3. Validação de Segurança
    const cnpjEmitenteXml = getVal(emitNode, 'CNPJ')?.replace(/\D/g, '');
    
    // Descomente a linha abaixo se quiser impedir que o cliente suba XMLs de outras empresas
    // if (cnpjEmitenteXml !== cnpjClienteLogado) {
    //    return NextResponse.json({ message: 'Este XML não pertence à sua empresa.' }, { status: 403 });
    // }

    // 4. Prepara o retorno (Sacado)
    const sacadoCnpjCpf = getVal(sacadoNode, 'CNPJ') || getVal(sacadoNode, 'CPF');
    const nomeSacadoXml = getVal(sacadoNode, 'xNome');

    // Tenta buscar sacado no banco para completar dados (opcional no portal, mas útil)
    const { data: sacadoDb } = await supabase
        .from('sacados')
        .select('*')
        .eq('cnpj', sacadoCnpjCpf)
        .single();

    return NextResponse.json({
      success: true,
      xmlData: {
        tipo: tipoDocumento,
        chave: chaveDoc,
        numero: numeroDoc,
        emissao: dataEmissao,
        valor: valorTotal,
        emitente: {
            cnpj: cnpjEmitenteXml,
            nome: getVal(emitNode, 'xNome')
        },
        sacado: {
            nome: sacadoDb?.nome || nomeSacadoXml,
            cnpj: sacadoCnpjCpf,
            existeNoBanco: !!sacadoDb
        },
        parcelas: parcelas
      }
    });

  } catch (error) {
    console.error('Erro no upload portal:', error);
    return NextResponse.json({ message: 'Erro ao processar o arquivo XML: ' + error.message }, { status: 500 });
  }
}