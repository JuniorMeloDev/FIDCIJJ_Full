import { NextResponse } from "next/server";
import {
  getBradescoExtratoAccessToken,
  consultarExtratoBradesco,
} from "@/app/lib/bradescoExtratoService";

const onlyDigits = (value) => String(value || "").replace(/\D/g, "");
const normalizeAgencia = (value) => {
  const digits = onlyDigits(value).slice(0, 4);
  return digits ? digits.padStart(4, "0") : "";
};
const normalizeConta = (value) => {
  const raw = String(value || "").trim();
  let contaSemDv = raw;
  if (raw.includes("-")) contaSemDv = raw.split("-")[0];

  let digits = onlyDigits(contaSemDv);
  if (!digits) return "";

  if (!raw.includes("-") && digits.length === 8) {
    digits = digits.slice(0, 7);
  } else if (digits.length > 7) {
    digits = digits.slice(0, 7);
  }

  return digits.padStart(7, "0");
};

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const agenciaRaw =
      searchParams.get("agencia") ||
      process.env.BRADESCO_AGENCIA ||
      process.env.BRADESCO_EXTRATO_AGENCIA;
    const contaRaw =
      searchParams.get("conta") ||
      process.env.BRADESCO_CONTA ||
      process.env.BRADESCO_EXTRATO_CONTA;
    const agencia = normalizeAgencia(agenciaRaw);
    const conta = normalizeConta(contaRaw);
    const dataInicio = searchParams.get("dataInicio");
    const dataFim = searchParams.get("dataFim");
    const tipo = searchParams.get("tipo");
    const tipoOperacao = searchParams.get("tipoOperacao") || "1";

    if (!agencia || !conta || !dataInicio || !dataFim || !tipo) {
      return NextResponse.json(
        {
          message:
            "Parametros obrigatorios: agencia, conta, dataInicio, dataFim e tipo.",
        },
        { status: 400 }
      );
    }

    console.log("[API EXTRATO BRADESCO] Usando agencia/conta:", {
      agencia,
      conta,
    });

    const tokenData = await getBradescoExtratoAccessToken();
    const extrato = await consultarExtratoBradesco(tokenData.access_token, {
      agencia,
      conta,
      dataInicio,
      dataFim,
      tipo,
      tipoOperacao,
    });

    return NextResponse.json(extrato);
  } catch (err) {
    console.error("[ERRO API EXTRATO BRADESCO]", err);
    return NextResponse.json(
      { message: err.message || "Erro interno ao buscar extrato Bradesco." },
      { status: 500 }
    );
  }
}
