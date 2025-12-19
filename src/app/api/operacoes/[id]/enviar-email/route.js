import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatBRLNumber, formatDate } from '@/app/utils/formatters';
// Removidos 'fs' e 'path'

const getBaseURL = () => {
    // 1. Prioriza a variavel de ambiente publica
    if (process.env.NEXT_PUBLIC_APP_URL) {
        return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
    }
    // 2. Vercel URL (sempre https em produção)
    if (process.env.VERCEL_URL) {
        return `https://${process.env.VERCEL_URL}`;
    }
    // 3. Fallback local
    return 'http://localhost:3000';
};


// Função atualizada para buscar logo via URL com tratamento de erro robusto
const getLogoBase64 = async () => {
    try {
        const baseURL = getBaseURL();
        const logoURL = `${baseURL}/Logo.png`;
        
        const response = await fetch(logoURL);
        if (!response.ok) {
            console.warn(`[AVISO LOGO] Falha ao buscar logo: ${response.status} ${response.statusText} - ${logoURL}`);
            return null; // Retorna null sem quebrar a execução
        }
        
        const imageBuffer = await response.arrayBuffer();
        const base64String = Buffer.from(imageBuffer).toString('base64');
        return `data:image/png;base64,${base64String}`;

    } catch (error) {
        console.error("[ERRO LOGO] Erro ao buscar/converter logo via URL (Ignorando logo):", error.message);
        return null; // Retorna null se falhar, permitindo que o email seja enviado sem logo
    }
};

const getHeaderCell = (text) => ({
    content: text,
    styles: { fillColor: [31, 41, 55], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' }
});

// Marcar como async
const generatePdfBuffer = async (operacao) => {
    const doc = new jsPDF();
    const logoBase64 = await getLogoBase64(); // Usar await
    const pageWidth = doc.internal.pageSize.getWidth();

    if (logoBase64) {
        doc.addImage(logoBase64, 'PNG', 14, 12, 50, 15);
    } else {
        console.warn("[AVISO PDF] Logo não disponível para adicionar ao PDF.");
    }

    doc.setFontSize(18);
    doc.text("BORDERÔ ANALÍTICO", pageWidth - 14, 22, { align: 'right' });
    doc.setFontSize(10);
    doc.text(`Data Assinatura: ${formatDate(operacao.data_operacao)}`, pageWidth - 14, 28, { align: 'right' });

    doc.text(`Empresa: ${operacao.cliente.nome}`, 14, 40);

    const head = [[getHeaderCell('Nº. Do Título'), getHeaderCell('Venc. Parcelas'), getHeaderCell('Sacado/Emitente'), getHeaderCell('Juros Parcela'), getHeaderCell('Valor')]];
    const body = operacao.duplicatas.map(dup => [ dup.nf_cte, formatDate(dup.data_vencimento), dup.cliente_sacado, { content: formatBRLNumber(dup.valor_juros), styles: { halign: 'right' } }, { content: formatBRLNumber(dup.valor_bruto), styles: { halign: 'right' } } ]);

    autoTable(doc, {
        startY: 50, head: head, body: body,
        foot: [[{ content: 'TOTAIS', colSpan: 3, styles: { fontStyle: 'bold', halign: 'right' } }, { content: formatBRLNumber(operacao.valor_total_juros), styles: { halign: 'right', fontStyle: 'bold' } }, { content: formatBRLNumber(operacao.valor_total_bruto), styles: { halign: 'right', fontStyle: 'bold' } }]],
        theme: 'grid', headStyles: { fillColor: [31, 41, 55] },
    });

    const finalY = doc.lastAutoTable.finalY + 10;
    const totaisBody = [
        ['Valor total dos Títulos:', { content: formatBRLNumber(operacao.valor_total_bruto), styles: { halign: 'right' } }],
        [`Deságio (${operacao.tipo_operacao.nome}):`, { content: `-${formatBRLNumber(operacao.valor_total_juros)}`, styles: { halign: 'right' } }],
        ...operacao.descontos.map(d => [
            `${d.descricao}:`,
            { content: d.valor < 0 ? `+${formatBRLNumber(Math.abs(d.valor))}` : `-${formatBRLNumber(d.valor)}`, styles: { halign: 'right' } }
        ]),
        [{ content: 'Líquido da Operação:', styles: { fontStyle: 'bold' } }, { content: formatBRLNumber(operacao.valor_liquido), styles: { halign: 'right', fontStyle: 'bold' } }]
    ];

    autoTable(doc, {
        startY: finalY, body: totaisBody, theme: 'plain', tableWidth: 'wrap',
        margin: { left: pageWidth / 2 }, styles: { cellPadding: 1, fontSize: 10 }
    });

    return Buffer.from(doc.output('arraybuffer'));
};

// Marcar como async
export async function POST(request, { params }) {
    try {
        const { id } = await params; // Aguarda params (Next.js 15+)
        
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);
        
        const { destinatarios } = await request.json();

        if (!destinatarios || destinatarios.length === 0) {
            return NextResponse.json({ message: 'Nenhum destinatário fornecido.' }, { status: 400 });
        }

        const { data: operacaoData, error: operacaoError } = await supabase
            .from('operacoes')
            .select('*, cliente:clientes(*), tipo_operacao:tipos_operacao(*), descontos(*)')
            .eq('id', id)
            .single();
        
        if (operacaoError) {
             console.error(`[DEBUG API] Erro ao buscar operação ${id}:`, operacaoError);
             throw new Error(`Operação não encontrada (Erro: ${operacaoError.message || operacaoError.code})`);
        }

        const { data: duplicatasData, error: duplicatasError } = await supabase
            .from('duplicatas')
            .select('*')
            .eq('operacao_id', id);
        if (duplicatasError) throw new Error("Erro ao buscar duplicatas da operação.");

        const operacao = { ...operacaoData, duplicatas: duplicatasData || [] };
        const pdfBuffer = await generatePdfBuffer(operacao); // Usar await

        const transporter = nodemailer.createTransport({
            host: 'smtp.gmail.com', port: 587, secure: false,
            auth: { user: process.env.EMAIL_USERNAME, pass: process.env.EMAIL_PASSWORD },
        });

        const tipoDocumento = operacao.cliente?.ramo_de_atividade === 'Transportes' ? 'CTe' : 'NF';
        const numeros = [...new Set(operacao.duplicatas.map(d => d.nf_cte.split('.')[0]))].join(', ');
        const subject = `Borderô ${tipoDocumento} ${numeros}`;

        const emailBody = `
            <p>Prezados,</p>
            <p>Segue em anexo o borderô referente à operação.</p>
            <br>
            <p>Atenciosamente,</p>
            <p>
                <strong>Junior Melo</strong><br>
                Analista Financeiro<br>
                <strong>FIDC IJJ</strong><br>
                (81) 9 7339-0292
            </p>
            <br>
            <img src="cid:logoImage" width="140">
        `;

        const logoBase64ForEmail = await getLogoBase64();
        const attachments = [
             { filename: `${subject}.pdf`, content: pdfBuffer, contentType: 'application/pdf' }
        ];
        
        if(logoBase64ForEmail) {
            attachments.push({ filename: 'Logo.png', content: logoBase64ForEmail.split("base64,")[1], encoding: 'base64', cid: 'logoImage' });
        }

        await transporter.sendMail({
            from: `"FIDC IJJ" <${process.env.EMAIL_USERNAME}>`,
            to: destinatarios.join(', '), subject, html: emailBody,
            attachments: attachments,
        });

        return NextResponse.json({ message: 'E-mail enviado com sucesso!' }, { status: 200 });

    } catch (error) {
        console.error("Erro ao enviar e-mail:", error);
        return NextResponse.json({ message: error.message || 'Erro interno do servidor' }, { status: 500 });
    }
}