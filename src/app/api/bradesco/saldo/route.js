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

const todayDDMMYYYY = () => {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yyyy = String(now.getFullYear());
  return `${dd}${mm}${yyyy}`;
};

const parseBrMoney = (value) => {
  const cleaned = String(value || "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");
  const numeric = Number(cleaned);
  return Number.isFinite(numeric) ? numeric : null;
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
    const tipo = searchParams.get("tipo");
    const tipoOperacao = searchParams.get("tipoOperacao") || "1";

    if (!agencia || !conta || !tipo) {
      return NextResponse.json(
        { message: "Parametros obrigatorios: agencia, conta e tipo." },
        { status: 400 }
      );
    }

    console.log("[API SALDO BRADESCO] Usando agencia/conta:", {
      agencia,
      conta,
    });

    const hoje = todayDDMMYYYY();
    const tokenData = await getBradescoExtratoAccessToken();
    const extrato = await consultarExtratoBradesco(tokenData.access_token, {
      agencia,
      conta,
      dataInicio: hoje,
      dataFim: hoje,
      tipo,
      tipoOperacao,
    });

    const saldoAnterior =
      extrato?.extratoUltimosLancamentos?.listaLancamentos?.["Saldo Anterior"]?.[0] ||
      null;

    return NextResponse.json({
      dataConsulta: hoje,
      saldo: saldoAnterior
        ? {
            valor: parseBrMoney(saldoAnterior.valorSaldoAposLancamento),
            sinal: saldoAnterior.sinalSaldo || null,
            bruto: saldoAnterior.valorSaldoAposLancamento || null,
            dataLancamento: saldoAnterior.dataLancamento || null,
          }
        : null,
      extrato,
    });
  } catch (err) {
    console.error("[ERRO API SALDO BRADESCO]", err);
    return NextResponse.json(
      { message: err.message || "Erro interno ao buscar saldo Bradesco." },
      { status: 500 }
    );
  }
}
