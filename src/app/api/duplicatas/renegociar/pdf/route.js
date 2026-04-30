import { NextResponse } from "next/server";
import { supabase } from "@/app/utils/supabaseClient";
import jwt from "jsonwebtoken";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import fs from "fs";
import path from "path";
import { formatBRLNumber, formatDate } from "@/app/utils/formatters";

const getLogoBase64 = async () => {
  try {
    const filePath = path.join(process.cwd(), "public", "Logo.png");
    if (!fs.existsSync(filePath)) return null;
    return `data:image/png;base64,${fs.readFileSync(filePath).toString("base64")}`;
  } catch (error) {
    console.error("Erro ao ler logo para PDF de renegociação:", error);
    return null;
  }
};

const headerCell = (text) => ({
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

const sum = (items, getter) =>
  items.reduce((total, item) => total + (Number(getter(item)) || 0), 0);

const getDuplicatasDaRenegociacao = async (duplicataId) => {
  const { data: historico } = await supabase
    .from("renegociacoes_duplicatas")
    .select("novas_duplicata_ids")
    .contains("novas_duplicata_ids", [Number(duplicataId)])
    .maybeSingle();

  if (historico?.novas_duplicata_ids?.length > 0) {
    const { data, error } = await supabase
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
      .in("id", historico.novas_duplicata_ids);

    if (error) throw error;
    return data || [];
  }

  const { data: selecionada, error: selecionadaError } = await supabase
    .from("duplicatas")
    .select("*")
    .eq("id", duplicataId)
    .single();

  if (selecionadaError) throw selecionadaError;

  const { data, error } = await supabase
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
    .eq("operacao_id", selecionada.operacao_id)
    .eq("data_operacao", selecionada.data_operacao)
    .not("origem_renegociacao_id", "is", null);

  if (error) throw error;
  return data || [];
};

const generatePdfBuffer = async (duplicatas) => {
  const doc = new jsPDF();
  const logoBase64 = await getLogoBase64();
  const pageWidth = doc.internal.pageSize.getWidth();
  const primeira = duplicatas[0] || {};
  const cliente = primeira.operacao?.cliente || {};

  if (logoBase64) doc.addImage(logoBase64, "PNG", 14, 12, 50, 15);

  doc.setFontSize(18);
  doc.text("BORDERÔ DE RENEGOCIAÇÃO", pageWidth - 14, 22, { align: "right" });
  doc.setFontSize(10);
  doc.text(`Data: ${formatDate(primeira.data_operacao)}`, pageWidth - 14, 28, {
    align: "right",
  });
  doc.text(`Empresa: ${cliente.nome || "-"}`, 14, 40);

  const body = duplicatas.map((dup) => {
    const novoValor = Number(dup.valor_bruto || 0);
    const juros = Number(dup.valor_juros || 0);
    const valorOriginal = novoValor - juros;
    return [
      dup.nf_cte,
      formatDate(dup.data_vencimento),
      truncate(dup.cliente_sacado, 35),
      { content: formatBRLNumber(valorOriginal), styles: { halign: "right" } },
      { content: formatBRLNumber(juros), styles: { halign: "right" } },
      { content: formatBRLNumber(novoValor), styles: { halign: "right" } },
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
      headerCell("Nº. Do Título"),
      headerCell("Novo Venc."),
      headerCell("Sacado/Emitente"),
      headerCell("Valor Original"),
      headerCell("Juros Reneg."),
      headerCell("Novo Valor"),
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
    columnStyles: { 1: { cellWidth: 35, halign: "right" } },
  });

  return Buffer.from(doc.output("arraybuffer"));
};

export async function GET(request) {
  try {
    const token = request.headers.get("Authorization")?.split(" ")[1];
    if (!token) return NextResponse.json({ message: "Não autorizado" }, { status: 401 });
    jwt.verify(token, process.env.JWT_SECRET);

    const { searchParams } = new URL(request.url);
    const duplicataId = Number(searchParams.get("duplicataId"));
    if (!duplicataId) {
      return NextResponse.json({ message: "Duplicata não informada." }, { status: 400 });
    }

    const duplicatas = await getDuplicatasDaRenegociacao(duplicataId);
    if (duplicatas.length === 0) {
      return NextResponse.json({ message: "Renegociação não encontrada." }, { status: 404 });
    }

    const pdfBuffer = await generatePdfBuffer(duplicatas);
    const numeros = [...new Set(duplicatas.map((d) => String(d.nf_cte || "").split(".")[0]))].join("_");
    const headers = new Headers();
    headers.append("Content-Type", "application/pdf");
    headers.append("Content-Disposition", `attachment; filename="Renegociacao_${numeros}.pdf"`);

    return new Response(pdfBuffer, { headers });
  } catch (error) {
    console.error("Erro ao gerar PDF de renegociação:", error);
    return NextResponse.json(
      { message: error.message || "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
