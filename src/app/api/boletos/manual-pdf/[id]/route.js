import { NextResponse } from "next/server";
import { format } from "date-fns";
import jwt from "jsonwebtoken";
import { supabase } from "@/app/utils/supabaseClient";
import { gerarPdfBoletoItau, getNossoNumeroDAC } from "@/app/lib/itauPdfService";

export async function GET(request, { params }) {
  try {
    const token = request.headers.get("Authorization")?.split(" ")[1];
    if (!token) {
      return NextResponse.json({ message: "Nao autorizado" }, { status: 401 });
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const { id } = await params;
    const boletoId = Number(id);
    if (!Number.isFinite(boletoId) || boletoId <= 0) {
      return NextResponse.json({ message: "ID do boleto invalido." }, { status: 400 });
    }

    const agencia = process.env.ITAU_AGENCIA;
    const contaCompleta = process.env.ITAU_CONTA;
    const carteira = process.env.ITAU_BOLETO_CARTEIRA || "109";
    if (!agencia || !contaCompleta) {
      throw new Error("Configuração de conta Itaú incompleta no servidor.");
    }

    const contaSemDac = String(contaCompleta).split("-")[0].replace(/\D/g, "");

    const { data: boleto, error: boletoError } = await supabase
      .from("boletos_manuais")
      .select("*")
      .eq("id", boletoId)
      .single();

    if (boletoError || !boleto) {
      throw new Error(`Boleto manual ${boletoId} não encontrado.`);
    }
    if (String(boleto.banco || "").toLowerCase() !== "itau") {
      throw new Error("Este boleto manual não foi emitido para o Itaú.");
    }

    const { data: sacado, error: sacadoError } = await supabase
      .from("sacados")
      .select("*")
      .eq("id", boleto.sacado_id)
      .single();

    if (sacadoError || !sacado) {
      throw new Error(`Sacado ID ${boleto.sacado_id} não encontrado.`);
    }

    // Contas administrativas normalmente não possuem cliente_id. Nesse caso, o
    // beneficiário do boleto avulso é o cliente master configurado para o FIDC.
    // Para contas de cliente, preservamos o próprio cliente como cedente.
    let clienteId = decoded.cliente_id || decoded?.cliente?.id || null;

    if (!clienteId) {
      let userQuery = supabase.from("users").select("cliente_id");
      userQuery = decoded.user_id
        ? userQuery.eq("id", decoded.user_id)
        : userQuery.eq("username", decoded.sub);

      const { data: userData } = await userQuery.maybeSingle();
      clienteId = userData?.cliente_id || null;
    }

    if (!clienteId) {
      const masterClienteId = Number(
        process.env.MASTER_CLIENT_ID || process.env.NEXT_PUBLIC_MASTER_CLIENT_ID
      );
      if (Number.isFinite(masterClienteId) && masterClienteId > 0) {
        clienteId = masterClienteId;
      }
    }

    if (!clienteId) {
      throw new Error("Cliente master não configurado para emissão do PDF.");
    }

    const { data: cedente, error: cedenteError } = await supabase
      .from("clientes")
      .select("*")
      .eq("id", clienteId)
      .single();

    if (cedenteError || !cedente) {
      throw new Error("Cadastro do cedente para emissão do PDF não encontrado.");
    }

    const respostaBanco = boleto.resposta_banco || {};
    const jurosManual = Number(respostaBanco.juros || 0);
    const multaManual = Number(respostaBanco.multa || 0);

    const valorBruto = Number(boleto.valor || 0);
    const abatimento = Number(boleto.abatimento || 0);
    const valorFinal = Number((valorBruto - abatimento).toFixed(2));
    const nossoNumero = String(boleto.nosso_numero || boleto.id || "")
      .replace(/\D/g, "")
      .padStart(8, "0")
      .slice(-8);
    const dacNossoNumero = getNossoNumeroDAC(agencia, contaSemDac, carteira, nossoNumero);

    const listaBoletos = [
      {
        id: boleto.id,
        sacado,
        cedente,
        agencia,
        conta: contaCompleta,
        carteira,
        nosso_numero: nossoNumero,
        dac_nosso_numero: dacNossoNumero,
        nf_cte: String(boleto.seu_numero || boleto.id),
        numero_documento: String(boleto.seu_numero || boleto.id),
        valor_bruto: valorBruto,
        abatimento,
        data_operacao: format(new Date(boleto.created_at || `${boleto.vencimento}T12:00:00Z`), "yyyy-MM-dd"),
        data_vencimento: boleto.vencimento,
        operacao: {
          tipo_operacao: {
            taxa_juros_mora: jurosManual,
            taxa_multa: multaManual,
          },
        },
      },
    ];

    console.log("[PDF BOLETO MANUAL ITAÚ] Gerando PDF para boleto", boletoId);
    const pdfBuffer = await gerarPdfBoletoItau(listaBoletos);

    if (!pdfBuffer || pdfBuffer.byteLength < 100) {
      throw new Error("Conteúdo do PDF gerado está vazio ou inválido.");
    }

    const headers = new Headers();
    headers.append("Content-Type", "application/pdf");
    headers.append("Content-Disposition", `attachment; filename="Boleto_Manual_Itaú_${boletoId}.pdf"`);

    return new Response(pdfBuffer, { headers });
  } catch (error) {
    console.error(`[ERRO FATAL PDF BOLETO MANUAL ITAÚ] ${error.message}`, error.stack);
    return NextResponse.json({ message: `Erro ao gerar PDF: ${error.message}` }, { status: 500 });
  }
}
