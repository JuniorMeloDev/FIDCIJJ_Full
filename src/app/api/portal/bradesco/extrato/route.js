import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { supabase } from "@/app/utils/supabaseClient";
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

  // Formato comum: 3126-7 => conta = 3126
  if (raw.includes("-")) {
    contaSemDv = raw.split("-")[0];
  }

  let digits = onlyDigits(contaSemDv);
  if (!digits) return "";

  // Quando vier sem separador e com 8 digitos, assume ultimo como DV
  if (!raw.includes("-") && digits.length === 8) {
    digits = digits.slice(0, 7);
  } else if (digits.length > 7) {
    digits = digits.slice(0, 7);
  }

  return digits.padStart(7, "0");
};

const isBradescoBank = (banco) => {
  const normalized = String(banco || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  return normalized.includes("bradesco") || normalized.includes("237");
};

export async function GET(request) {
  try {
    const token = request.headers.get("Authorization")?.split(" ")[1];
    if (!token) {
      return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userRoles = decoded.roles || [];
    const clienteId = decoded.cliente_id;

    if (!userRoles.includes("ROLE_CLIENTE") || !clienteId) {
      return NextResponse.json(
        { message: "Acesso negado para consulta de extrato." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const dataInicio = searchParams.get("dataInicio");
    const dataFim = searchParams.get("dataFim");
    const tipo = searchParams.get("tipo") || "cc";
    const tipoOperacao = searchParams.get("tipoOperacao") || "2";

    if (!dataInicio || !dataFim) {
      return NextResponse.json(
        { message: "Parametros obrigatorios: dataInicio e dataFim." },
        { status: 400 }
      );
    }

    const { data: contas, error: contasError } = await supabase
      .from("contas_bancarias")
      .select("banco, agencia, conta_corrente")
      .eq("cliente_id", clienteId);

    if (contasError) {
      throw new Error("Falha ao buscar conta bancaria do cliente.");
    }

    const contaBradesco =
      (contas || []).find((c) => isBradescoBank(c.banco)) || null;

    if (!contaBradesco) {
      return NextResponse.json(
        { message: "Nenhuma conta Bradesco vinculada ao cliente logado." },
        { status: 400 }
      );
    }

    const agencia = normalizeAgencia(contaBradesco.agencia);
    const conta = normalizeConta(contaBradesco.conta_corrente);

    console.log("[PORTAL BRADESCO EXTRATO] Conta cliente normalizada:", {
      banco: contaBradesco.banco,
      agenciaOriginal: contaBradesco.agencia,
      contaOriginal: contaBradesco.conta_corrente,
      agencia,
      conta,
    });

    if (!agencia || !conta) {
      return NextResponse.json(
        {
          message:
            "Conta Bradesco do cliente invalida. Verifique agencia e conta no cadastro.",
        },
        { status: 400 }
      );
    }

    const tokenData = await getBradescoExtratoAccessToken();
    const extrato = await consultarExtratoBradesco(tokenData.access_token, {
      agencia,
      conta,
      dataInicio,
      dataFim,
      tipo,
      tipoOperacao,
    });

    return NextResponse.json(extrato, { status: 200 });
  } catch (error) {
    console.error("[PORTAL BRADESCO EXTRATO] Erro:", error);
    return NextResponse.json(
      { message: error.message || "Erro interno ao consultar extrato." },
      { status: 500 }
    );
  }
}
