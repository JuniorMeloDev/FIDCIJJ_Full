import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { parse } from 'ofx-js';

// Função auxiliar para converter data do OFX (YYYYMMDD) para ISO (YYYY-MM-DD)
function formatOfxDate(ofxDate) {
    if (!ofxDate || ofxDate.length < 8) return new Date().toISOString().split('T')[0];
    const year = ofxDate.substring(0, 4);
    const month = ofxDate.substring(4, 6);
    const day = ofxDate.substring(6, 8);
    return `${year}-${month}-${day}`;
}

export async function POST(request) {
    try {
        // 1. Autenticação (padrão do seu projeto)
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        // 2. Obter o arquivo
        const formData = await request.formData();
        const file = formData.get('file');
        if (!file) {
            return NextResponse.json({ message: 'Nenhum arquivo enviado.' }, { status: 400 });
        }

        // 3. Ler e Processar o arquivo com ofx-js
        const fileContent = await file.text();
        
        const data = await parse(fileContent);
        
        // 4. Extrair e formatar as transações
        // A estrutura exata pode variar ligeiramente dependendo do banco
        const statement = data.OFX?.BANKMSGSRSV1?.STMTTRNRS?.STMTRS;
        if (!statement) {
            throw new Error('Formato OFX inválido ou não reconhecido.');
        }

        const transactions = statement.BANKTRANLIST?.STMTTRN || [];
        
        const formattedTransactions = transactions.map(t => ({
            idTransacao: t.FITID, // ID único da transação
            dataEntrada: formatOfxDate(t.DTPOSTED), // Data
            descricao: t.MEMO, // Descrição
            valor: parseFloat(t.TRNAMT), // Valor
            tipoOperacao: parseFloat(t.TRNAMT) >= 0 ? 'C' : 'D', // Tipo (Crédito/Débito)
        }));

        // 5. Retornar os dados formatados (similar à sua API do Inter)
        return NextResponse.json({
            transacoes: formattedTransactions 
        }, { status: 200 });

    } catch (error) {
        console.error('Erro ao processar arquivo OFX:', error);
        return NextResponse.json({ message: error.message || 'Erro interno do servidor' }, { status: 500 });
    }
}