import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatBRLNumber, formatDate } from '@/app/utils/formatters';

// (Esta função de gerar PDF é uma cópia da que criámos para o endpoint de PDF)
const generatePdfBuffer = (operacao) => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text("BORDERÔ ANALÍTICO", 14, 22);
    doc.setFontSize(10);
    doc.text(`Data Assinatura: ${formatDate(operacao.data_operacao)}`, 200, 22, { align: 'right' });
    doc.text(`Empresa: ${operacao.cliente.nome}`, 14, 30);

    const head = [['Nº. Do Título', 'Venc. Parcelas', 'Sacado/Emitente', 'Juros Parcela', 'Valor']];
    const body = operacao.duplicatas.map(dup => [ dup.nf_cte, formatDate(dup.data_vencimento), dup.cliente_sacado, formatBRLNumber(dup.valor_juros), formatBRLNumber(dup.valor_bruto) ]);

    autoTable(doc, {
        startY: 40, head, body, theme: 'grid',
        foot: [[{ content: 'TOTAIS', colSpan: 3, styles: { fontStyle: 'bold' } }, formatBRLNumber(operacao.valor_total_juros), formatBRLNumber(operacao.valor_total_bruto) ]],
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

        // Busca os dados da operação para montar o PDF
        const { data: operacao, error } = await supabase
            .from('operacoes')
            .select('*, cliente:clientes(*), duplicatas(*)')
            .eq('id', id)
            .single();

        if (error) throw new Error("Operação não encontrada.");

        const pdfBuffer = generatePdfBuffer(operacao);

        // Configura o transportador de e-mail (Nodemailer)
        const transporter = nodemailer.createTransport({
            host: 'smtp.gmail.com', // Ou o host do seu provedor
            port: 587,
            secure: false, // true para 465, false para outras portas
            auth: {
                user: process.env.EMAIL_USERNAME,
                pass: process.env.EMAIL_PASSWORD,
            },
        });

        const numerosNfs = [...new Set(operacao.duplicatas.map(d => d.nf_cte.split('.')[0]))].join(', ');
        const subject = `Borderô NF ${numerosNfs}`;

        // Envia o e-mail
        await transporter.sendMail({
            from: `"FIDC IJJ" <${process.env.EMAIL_USERNAME}>`,
            to: destinatarios.join(', '),
            subject: subject,
            html: `<p>Prezados,</p><p>Segue em anexo o borderô referente à operação.</p><p>Atenciosamente,<br/>FIDC IJJ</p>`,
            attachments: [{
                filename: `${subject}.pdf`,
                content: pdfBuffer,
                contentType: 'application/pdf'
            }],
        });

        return NextResponse.json({ message: 'E-mail enviado com sucesso!' }, { status: 200 });

    } catch (error) {
        console.error("Erro ao enviar e-mail:", error);
        return NextResponse.json({ message: error.message || 'Erro interno do servidor' }, { status: 500 });
    }
}