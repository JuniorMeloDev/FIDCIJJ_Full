import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatBRLNumber, formatDate } from '@/app/utils/formatters';
import fs from 'fs';
import path from 'path';

// Função para carregar a imagem e converter para Base64
const getLogoBase64 = () => {
    try {
        const imagePath = path.resolve(process.cwd(), 'public', 'Logo.png');
        const imageBuffer = fs.readFileSync(imagePath);
        return `data:image/png;base64,${imageBuffer.toString('base64')}`;
    } catch (error) {
        console.error("Erro ao carregar a imagem do logo:", error);
        return null;
    }
};

const generatePdfBuffer = (operacao) => {
    const doc = new jsPDF();
    const logoBase64 = getLogoBase64();
    if (logoBase64) {
        doc.addImage(logoBase64, 'PNG', 14, 10, 35, 15);
    }

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

        const { data: operacao, error } = await supabase
            .from('operacoes')
            .select('*, cliente:clientes(*), duplicatas(*)')
            .eq('id', id)
            .single();

        if (error) throw new Error("Operação não encontrada.");

        const pdfBuffer = generatePdfBuffer(operacao);

        const transporter = nodemailer.createTransport({
            host: 'smtp.gmail.com', port: 587, secure: false,
            auth: { user: process.env.EMAIL_USERNAME, pass: process.env.EMAIL_PASSWORD },
        });

        const numerosNfs = [...new Set(operacao.duplicatas.map(d => d.nf_cte.split('.')[0]))].join(', ');
        const tipoDocumento = operacao.cliente?.ramo_de_atividade === 'Transportes' ? 'CTe' : 'NF';
        const subject = `Borderô ${tipoDocumento} ${numerosNfs}`;

        // --- CORPO DO E-MAIL CORRIGIDO ---
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
            to: destinatarios.join(', '),
            subject: subject,
            html: emailBody,
            attachments: [
                {
                    filename: `${subject}.pdf`,
                    content: pdfBuffer,
                    contentType: 'application/pdf'
                },
                // Anexa a imagem com um Content-ID (cid) para ser usada no corpo do e-mail
                {
                    filename: 'Logo.png',
                    path: logoPath,
                    cid: 'logoImage' 
                }
            ],
        });

        return NextResponse.json({ message: 'E-mail enviado com sucesso!' }, { status: 200 });

    } catch (error) {
        console.error("Erro ao enviar e-mail:", error);
        return NextResponse.json({ message: error.message || 'Erro interno do servidor' }, { status: 500 });
    }
}