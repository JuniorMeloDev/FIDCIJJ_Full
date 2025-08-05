import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatBRLNumber, formatDate } from '@/app/utils/formatters';
import fs from 'fs';
import path from 'path';

const getLogoBase64 = () => {
    try {
        const imagePath = path.resolve(process.cwd(), 'public', 'Logo.png');
        const imageBuffer = fs.readFileSync(imagePath);
        return `data:image/png;base64,${imageBuffer.toString('base64')}`;
    } catch (error) { return null; }
};

const getHeaderCell = (text) => ({
    content: text,
    styles: { fillColor: [31, 41, 55], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' }
});

const generatePdfBuffer = (operacao) => {
    const doc = new jsPDF();
    const logoBase64 = getLogoBase64();
    const pageWidth = doc.internal.pageSize.getWidth();

    if (logoBase64) {
        doc.addImage(logoBase64, 'PNG', 14, 12, 35, 15);
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
        foot: [[
            { content: 'TOTAIS', colSpan: 3, styles: { fontStyle: 'bold', halign: 'right' } }, 
            { content: formatBRLNumber(operacao.valor_total_juros), styles: { halign: 'right', fontStyle: 'bold' } }, 
            { content: formatBRLNumber(operacao.valor_total_bruto), styles: { halign: 'right', fontStyle: 'bold' } }
        ]],
        theme: 'grid', headStyles: { fillColor: [31, 41, 55] },
    });

    const finalY = doc.lastAutoTable.finalY + 10;
    const totaisBody = [
        ['Valor total dos Títulos:', { content: formatBRLNumber(operacao.valor_total_bruto), styles: { halign: 'right' } }],
        [`Deságio (${operacao.tipo_operacao.nome}):`, { content: `-${formatBRLNumber(operacao.valor_total_juros)}`, styles: { halign: 'right' } }],
        ...operacao.descontos.map(d => [ `${d.descricao}:`, { content: `-${formatBRLNumber(d.valor)}`, styles: { halign: 'right' } } ]),
        [{ content: 'Líquido da Operação:', styles: { fontStyle: 'bold' } }, { content: formatBRLNumber(operacao.valor_liquido), styles: { halign: 'right', fontStyle: 'bold' } }]
    ];

    autoTable(doc, {
        startY: finalY, body: totaisBody, theme: 'plain', tableWidth: 'wrap',
        margin: { left: pageWidth / 2 }, styles: { cellPadding: 1, fontSize: 10 }
    });

    return Buffer.from(doc.output('arraybuffer'));
};

export async function POST(request, { params }) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const { id } = params;
        const { destinatarios } = await request.json();

        if (!destinatarios || destinatarios.length === 0) {
            return NextResponse.json({ message: 'Nenhum destinatário fornecido.' }, { status: 400 });
        }

        const { data: operacaoData, error: operacaoError } = await supabase
            .from('operacoes').select('*, cliente:clientes(*), tipo_operacao:tipos_operacao(*)').eq('id', id).single();
        if (operacaoError) throw new Error("Operação não encontrada.");

        const { data: duplicatasData } = await supabase.from('duplicatas').select('*').eq('operacao_id', id);
        const { data: descontosData } = await supabase.from('descontos').select('*').eq('operacao_id', id);

        const operacao = { ...operacaoData, duplicatas: duplicatasData || [], descontos: descontosData || [] };

        const pdfBuffer = generatePdfBuffer(operacao);

        const transporter = nodemailer.createTransport({
            host: 'smtp.gmail.com', port: 587, secure: false,
            auth: { user: process.env.EMAIL_USERNAME, pass: process.env.EMAIL_PASSWORD },
        });

        const numerosNfs = [...new Set(operacao.duplicatas.map(d => d.nf_cte.split('.')[0]))].join(', ');
        const tipoDocumento = operacao.cliente?.ramo_de_atividade === 'Transportes' ? 'CTe' : 'NF';
        const subject = `Borderô ${tipoDocumento} ${numerosNfs}`;

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

        const logoPath = path.resolve(process.cwd(), 'public', 'Logo.png');

        await transporter.sendMail({
            from: `"FIDC IJJ" <${process.env.EMAIL_USERNAME}>`,
            to: destinatarios.join(', '), subject, html: emailBody,
            attachments: [
                { filename: `${subject}.pdf`, content: pdfBuffer, contentType: 'application/pdf' },
                { filename: 'Logo.png', path: logoPath, cid: 'logoImage' }
            ],
        });

        return NextResponse.json({ message: 'E-mail enviado com sucesso!' }, { status: 200 });

    } catch (error) {
        console.error("Erro ao enviar e-mail:", error);
        return NextResponse.json({ message: error.message || 'Erro interno do servidor' }, { status: 500 });
    }
}