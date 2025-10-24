import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatBRLNumber, formatDate } from '@/app/utils/formatters';
import fs from 'fs';
import path from 'path';

/**
 * Função Corrigida para Carregar o Logo (para PDF)
 * Caminho relativo da API para a pasta 'public'
 */
const getLogoBase64 = () => {
    try {
        // __dirname aqui é /var/task/.next/server/app/api/operacoes/[id]/enviar-email
        let imagePath = path.resolve(__dirname, '../../../../../../public', 'Logo.png');

        if (!fs.existsSync(imagePath)) {
            console.warn(`[Logo PDF/Email] Logo não encontrado em ${imagePath}. Tentando path via CWD.`);
            imagePath = path.resolve(process.cwd(), 'public', 'Logo.png');
        }

        if (fs.existsSync(imagePath)) {
            console.log(`[Logo PDF/Email] Logo.png carregado de: ${imagePath}`);
            const imageBuffer = fs.readFileSync(imagePath);
            return `data:image/png;base64,${imageBuffer.toString('base64')}`;
        } else {
             let fallbackPath = path.resolve(__dirname, '../../../../../../public', 'logo.png');
             if (!fs.existsSync(fallbackPath)) {
                fallbackPath = path.resolve(process.cwd(), 'public', 'logo.png');
             }
             if (fs.existsSync(fallbackPath)) {
                 console.log(`[Logo PDF/Email] Fallback 'logo.png' carregado de: ${fallbackPath}`);
                 const fallbackBuffer = fs.readFileSync(fallbackPath);
                 return `data:image/png;base64,${fallbackBuffer.toString('base64')}`;
             } else {
                 console.error(`[Logo PDF/Email] Logo.png ou logo.png NÃO encontrados.`);
                 return null;
             }
        }
    } catch (error) {
        console.error("Erro ao carregar logo para anexo de email:", error);
        return null;
    }
};

/**
 * Função Corrigida para encontrar o PATH do logo (para anexo CID)
 */
const getLogoPathForAttachment = () => {
    try {
        let imagePath = path.resolve(__dirname, '../../../../../../public', 'Logo.png');
        if (fs.existsSync(imagePath)) return imagePath;

        imagePath = path.resolve(process.cwd(), 'public', 'Logo.png');
        if (fs.existsSync(imagePath)) return imagePath;

         let fallbackPath = path.resolve(__dirname, '../../../../../../public', 'logo.png');
         if (fs.existsSync(fallbackPath)) return fallbackPath;

         fallbackPath = path.resolve(process.cwd(), 'public', 'logo.png');
         if (fs.existsSync(fallbackPath)) return fallbackPath;

         console.warn("[Logo Email Anexo] Nenhum arquivo de logo (Logo.png ou logo.png) encontrado para anexar.");
         return null;

    } catch (error) {
        console.error("Erro ao buscar path do logo para anexo:", error);
        return null;
    }
}

// ... (Funções getHeaderCell, sanitizeFilename, generatePdfBuffer permanecem as mesmas) ...
// ... (Certifique-se que generatePdfBuffer está usando getLogoBase64() como acima) ...

const getHeaderCell = (text) => ({
    content: text, styles: { fillColor: [31, 41, 55], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' }
});

const sanitizeFilename = (filename) => {
    return filename
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[ôõóò]/g, 'o')
        .replace(/[^\w\s.,-]/g, '_');
};

const generatePdfBuffer = (operacao) => {
    const doc = new jsPDF();
    const logoBase64 = getLogoBase64(); // Usa a função atualizada
    const pageWidth = doc.internal.pageSize.getWidth();

    if (logoBase64) {
        // Ajuste as dimensões se necessário
        doc.addImage(logoBase64, 'PNG', 14, 12, 40, 15); 
    }
    // ... (Resto da sua função de gerar PDF) ...
    doc.setFontSize(18);
    doc.text("BORDERO ANALITICO", pageWidth - 14, 22, { align: 'right' });
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
    // ... (Fim da função de gerar PDF) ...
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

        // Busca dados da operação
        const { data: operacaoData, error: operacaoError } = await supabase.from('operacoes').select('*, cliente:clientes(*), tipo_operacao:tipos_operacao(*)').eq('id', id).single();
        if (operacaoError) throw new Error("Operação não encontrada.");
        const { data: duplicatasData } = await supabase.from('duplicatas').select('*').eq('operacao_id', id);
        const { data: descontosData } = await supabase.from('descontos').select('*').eq('operacao_id', id);
        const operacao = { ...operacaoData, duplicatas: duplicatasData || [], descontos: descontosData || [] };

        // Gera o PDF
        const pdfBuffer = generatePdfBuffer(operacao);

        // --- Configura o transporter (VOLTANDO PARA GMAIL) ---
        const transporter = nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 465,
            secure: true,
            auth: {
                user: process.env.EMAIL_USERNAME,
                pass: process.env.EMAIL_PASSWORD, // Lembre-se da "Senha de App"
            },
        });
        // --- FIM DA MUDANÇA ---

        // Assunto e nome do arquivo
        const tipoDocumento = operacao.cliente?.ramo_de_atividade === 'Transportes' ? 'CTe' : 'NF';
        const numeros = [...new Set(operacao.duplicatas.map(d => d.nf_cte.split('.')[0]))].join('_');
        const subject = `Borderô ${tipoDocumento} ${numeros}`;
        const filename = sanitizeFilename(`${subject}.pdf`);

        // Corpo do e-mail
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

        // Busca o caminho do logo para anexar com CID (Função Corrigida)
        const logoPath = getLogoPathForAttachment();

        // Prepara os anexos
        const attachments = [
            { filename: filename, content: pdfBuffer, contentType: 'application/pdf' },
        ];
        if (logoPath) {
            attachments.push({ filename: 'Logo.png', path: logoPath, cid: 'logoImage' });
        } else {
             console.warn("[Enviar Email] Não foi possível anexar o logo (CID) pois o path não foi encontrado.");
        }

        // Envia o e-mail
        await transporter.sendMail({
            from: `"FIDC IJJ" <${process.env.EMAIL_USERNAME}>`, // Usa o seu e-mail do Gmail
            to: destinatarios.join(', '),
            subject,
            html: emailBody,
            attachments: attachments,
        });

        return NextResponse.json({ message: 'E-mail enviado com sucesso!' }, { status: 200 });

    } catch (error) {
        console.error("Erro ao enviar e-mail do borderô:", error);
        return NextResponse.json({ message: error.message || 'Erro interno do servidor' }, { status: 500 });
    }
}