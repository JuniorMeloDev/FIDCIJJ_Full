import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';
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

const getHeaderCell = (text) => ({
    content: text,
    styles: { fillColor: [31, 41, 55], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' }
});

export async function GET(request, { params }) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const { id } = params;

        const { data: operacao, error } = await supabase
            .from('operacoes')
            .select('*, cliente:clientes(*), tipo_operacao:tipos_operacao(*), duplicatas(*), descontos(*)')
            .eq('id', id)
            .single();

        if (error) throw error;

        const tipoDocumento = operacao.cliente?.ramo_de_atividade === 'Transportes' ? 'CTe' : 'NF';
        const numeros = [...new Set(operacao.duplicatas.map(d => d.nf_cte.split('.')[0]))].join(', ');
        const filename = `Borderô ${tipoDocumento} ${numeros}.pdf`;

        const doc = new jsPDF();
        const logoBase64 = getLogoBase64();
        if (logoBase64) {
            doc.addImage(logoBase64, 'PNG', 14, 10, 35, 15);
        }

        doc.setFontSize(18);
        doc.text("BORDERÔ ANALÍTICO", 14, 22);
        doc.setFontSize(10);
        const pageWidth = doc.internal.pageSize.getWidth();
        doc.text(`Data Assinatura: ${formatDate(operacao.data_operacao)}`, pageWidth - 14, 22, { align: 'right' });
        doc.text(`Empresa: ${operacao.cliente.nome}`, 14, 30);

        const head = [[getHeaderCell('Nº. Do Título'), getHeaderCell('Venc. Parcelas'), getHeaderCell('Sacado/Emitente'), getHeaderCell('Juros Parcela'), getHeaderCell('Valor')]];
        const body = operacao.duplicatas.map(dup => [ 
            dup.nf_cte, 
            formatDate(dup.data_vencimento), 
            dup.cliente_sacado, 
            { content: formatBRLNumber(dup.valor_juros), styles: { halign: 'right' } },
            { content: formatBRLNumber(dup.valor_bruto), styles: { halign: 'right' } } 
        ]);

        autoTable(doc, {
            startY: 40, head: head, body: body,
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

        const pdfBuffer = doc.output('arraybuffer');

        const headers = new Headers();
        headers.append('Content-Type', 'application/pdf');
        headers.append('Content-Disposition', `attachment; filename="${filename}"`);

        return new Response(pdfBuffer, { headers });

    } catch (error) {
        console.error("Erro ao gerar PDF do borderô:", error);
        return NextResponse.json({ message: error.message || 'Erro interno do servidor' }, { status: 500 });
    }
}