import { NextResponse } from "next/server";
import { supabase } from "@/app/utils/supabaseClient";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import fs from "fs";
import path from "path";
import { formatBRLNumber, formatDate } from "@/app/utils/formatters";

const getLogoBase64 = async () => {
  try {
    const filePath = path.join(process.cwd(), "public", "Logo.png");
    if (!fs.existsSync(filePath)) return null;
    const imageBuffer = fs.readFileSync(filePath);
    return `data:image/png;base64,${imageBuffer.toString("base64")}`;
  } catch (error) {
    console.error("Erro ao ler logo para e-mail de renegociação:", error);
    return null;
  }
};

const getHeaderCell = (text) => ({
  content: text,
  styles: {
    fillColor: [31, 41, 55],
    textColor: [255, 255, 255],
    fontStyle: "bold",
    halign: "center",
  },
});

const truncate = (str, n) =>
  str && str.length > n ? `${str.substr(0, n - 1)}...` : str;

const sum = (items, getValue) =>
  items.reduce((total, item) => total + (Number(getValue(item)) || 0), 0);

const generatePdfBuffer = async (duplicatas) => {
  const doc = new jsPDF();
  const logoBase64 = await getLogoBase64();
  const pageWidth = doc.internal.pageSize.getWidth();
  const primeira = duplicatas[0] || {};
  const cliente = primeira.operacao?.cliente || {};

  if (logoBase64) {
    doc.addImage(logoBase64, "PNG", 14, 12, 50, 15);
  }

  doc.setFontSize(18);
  doc.text("BORDERÔ DE RENEGOCIAÇÃO", pageWidth - 14, 22, { align: "right" });
  doc.setFontSize(10);
  doc.text(`Data: ${formatDate(primeira.data_operacao)}`, pageWidth - 14, 28, {
    align: "right",
  });
  doc.text(`Empresa: ${cliente.nome || "-"}`, 14, 40);

  const body = duplicatas.map((dup) => {
    const valorRenegociado = Number(dup.valor_bruto || 0);
    const juros = Number(dup.valor_juros || 0);
    const valorOriginal = valorRenegociado - juros;

    return [
      dup.nf_cte,
      formatDate(dup.data_vencimento),
      truncate(dup.cliente_sacado, 35),
      { content: formatBRLNumber(valorOriginal), styles: { halign: "right" } },
      { content: formatBRLNumber(juros), styles: { halign: "right" } },
      { content: formatBRLNumber(valorRenegociado), styles: { halign: "right" } },
    ];
  });

  const totalOriginal = sum(
    duplicatas,
    (dup) => Number(dup.valor_bruto || 0) - Number(dup.valor_juros || 0)
  );
  const totalJuros = sum(duplicatas, (dup) => dup.valor_juros);
  const totalRenegociado = sum(duplicatas, (dup) => dup.valor_bruto);

  autoTable(doc, {
    startY: 50,
    head: [[
      getHeaderCell("Nº. Do Título"),
      getHeaderCell("Novo Venc."),
      getHeaderCell("Sacado/Emitente"),
      getHeaderCell("Valor Original"),
      getHeaderCell("Juros Reneg."),
      getHeaderCell("Novo Valor"),
    ]],
    body,
    foot: [[
      { content: "TOTAIS", colSpan: 3, styles: { fontStyle: "bold", halign: "right" } },
      { content: formatBRLNumber(totalOriginal), styles: { halign: "right", fontStyle: "bold" } },
      { content: formatBRLNumber(totalJuros), styles: { halign: "right", fontStyle: "bold" } },
      { content: formatBRLNumber(totalRenegociado), styles: { halign: "right", fontStyle: "bold" } },
    ]],
    theme: "grid",
    headStyles: { fillColor: [31, 41, 55] },
    footStyles: { fillColor: [22, 163, 74], textColor: [255, 255, 255] },
  });

  const finalY = doc.lastAutoTable.finalY + 12;
  autoTable(doc, {
    startY: finalY,
    body: [
      ["Total original:", { content: formatBRLNumber(totalOriginal), styles: { halign: "right" } }],
      ["Juros da renegociação:", { content: formatBRLNumber(totalJuros), styles: { halign: "right" } }],
      [
        { content: "Total renegociado:", styles: { fontStyle: "bold" } },
        { content: formatBRLNumber(totalRenegociado), styles: { halign: "right", fontStyle: "bold" } },
      ],
    ],
    theme: "plain",
    margin: { left: pageWidth * 0.45 },
    tableWidth: pageWidth * 0.5,
    styles: { cellPadding: 1, fontSize: 10 },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { cellWidth: 35, halign: "right" },
    },
  });

  return Buffer.from(doc.output("arraybuffer"));
};

export async function POST(request) {
  try {
    const token = request.headers.get("Authorization")?.split(" ")[1];
    if (!token) {
      return NextResponse.json({ message: "Não autorizado" }, { status: 401 });
    }
    jwt.verify(token, process.env.JWT_SECRET);

    const { destinatarios, duplicataIds } = await request.json();

    if (!Array.isArray(destinatarios) || destinatarios.length === 0) {
      return NextResponse.json(
        { message: "Nenhum destinatário fornecido." },
        { status: 400 }
      );
    }

    if (!Array.isArray(duplicataIds) || duplicataIds.length === 0) {
      return NextResponse.json(
        { message: "Nenhuma duplicata de renegociação informada." },
        { status: 400 }
      );
    }

    const { data: duplicatas, error } = await supabase
      .from("duplicatas")
      .select(
        `
          *,
          operacao:operacoes(
            *,
            cliente:clientes(*),
            tipo_operacao:tipos_operacao(*)
          )
        `
      )
      .in("id", duplicataIds);

    if (error) throw error;
    if (!duplicatas || duplicatas.length === 0) {
      return NextResponse.json(
        { message: "Duplicatas de renegociação não encontradas." },
        { status: 404 }
      );
    }

    const pdfBuffer = await generatePdfBuffer(duplicatas);
    const tipoDocumento =
      duplicatas[0]?.operacao?.cliente?.ramo_de_atividade === "Transportes"
        ? "CTe"
        : "NF";
    const numeros = [
      ...new Set(duplicatas.map((d) => String(d.nf_cte || "").split(".")[0])),
    ].join(", ");
    const subject = `Renegociação ${tipoDocumento} ${numeros}`;

    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: {
        user: process.env.EMAIL_USERNAME,
        pass: process.env.EMAIL_PASSWORD,
      },
    });

    const logoBase64 = await getLogoBase64();
    const attachments = [
      {
        filename: `${subject}.pdf`,
        content: pdfBuffer,
        contentType: "application/pdf",
      },
    ];

    if (logoBase64) {
      attachments.push({
        filename: "Logo.png",
        content: logoBase64.split("base64,")[1],
        encoding: "base64",
        cid: "logoImage",
      });
    }

    await transporter.sendMail({
      from: `"FIDC IJJ" <${process.env.EMAIL_USERNAME}>`,
      to: destinatarios.join(", "),
      subject,
      html: `
        <p>Prezados,</p>
        <p>Segue em anexo o borderô de renegociação.</p>
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
      `,
      attachments,
    });

    return NextResponse.json(
      { message: "E-mail de renegociação enviado com sucesso!" },
      { status: 200 }
    );
  } catch (error) {
    console.error("Erro ao enviar e-mail de renegociação:", error);
    return NextResponse.json(
      { message: error.message || "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
