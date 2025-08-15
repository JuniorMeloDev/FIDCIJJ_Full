import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const token = request.headers.get('Authorization')?.split(' ')[1];
    if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    jwt.verify(token, process.env.JWT_SECRET);

    const formData = await request.formData();
    const file = formData.get('file');
    if (!file) {
      return NextResponse.json({ message: 'Arquivo não encontrado' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const pdfParse = (await import('pdf-parse')).default;
    const pdfData = await pdfParse(buffer);
    const text = pdfData.text.replace(/\s+/g, ' ').trim();

    // Regex para pegar CNPJ do Emitente
    const emitenteMatch = text.match(/Emitente.*?(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/i);
    const emitenteCNPJ = emitenteMatch ? emitenteMatch[1].replace(/\D/g, '') : null;

    // Regex para pegar Tomador do Serviço (Sacado)
    const tomadorMatch = text.match(/Tomador.*?(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/i);
    const tomadorCNPJ = tomadorMatch ? tomadorMatch[1].replace(/\D/g, '') : null;

    if (!emitenteCNPJ || !tomadorCNPJ) {
      throw new Error('Não foi possível extrair CNPJs do CT-e.');
    }

    // Buscar no banco
    const { data: emitenteData } = await supabase.from('clientes').select('id, nome').eq('cnpj', emitenteCNPJ).single();
    const { data: sacadoData } = await supabase.from('sacados').select('id, nome').eq('cnpj', tomadorCNPJ).single();

    const responseData = {
      tipo: 'cte',
      numeroCte: text.match(/Conhecimento\s+(\d+)/i)?.[1] || '',
      dataEmissao: text.match(/Emissão.*?(\d{2}\/\d{2}\/\d{4})/)?.[1] || '',
      valorTotal: parseFloat(text.match(/Valor Total.*?(\d+,\d{2})/)?.[1]?.replace('.', '').replace(',', '.') || 0),
      dataDevolucao: '', // não tem vencimento
      emitente: {
        id: emitenteData?.id || null,
        nome: emitenteData?.nome || 'Emitente não encontrado',
        cnpj: emitenteCNPJ
      },
      emitenteExiste: !!emitenteData,
      sacado: {
        id: sacadoData?.id || null,
        nome: sacadoData?.nome || 'Sacado não encontrado',
        cnpj: tomadorCNPJ
      },
      sacadoExiste: !!sacadoData
    };

    return NextResponse.json(responseData, { status: 200 });

  } catch (error) {
    console.error('Erro ao processar PDF CT-e:', error);
    return NextResponse.json({ message: error.message || 'Erro interno do servidor' }, { status: 500 });
  }
}
