import { NextResponse } from "next/server";
import {
  consultarExtratoItau,
  getItauExtratoAccessToken,
  normalizeItauAgencia,
  normalizeItauConta,
  normalizeItauDac,
} from "@/app/lib/itauExtratoService";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const agenciaRaw = searchParams.get("agencia") || process.env.ITAU_AGENCIA;
    const contaRaw = searchParams.get("conta") || process.env.ITAU_CONTA;
    const dataInicio = searchParams.get("dataInicio");
    const dataFim = searchParams.get("dataFim");
    const type =
      searchParams.get("type") ||
      process.env.ITAU_EXTRATO_TYPE ||
      process.env.ITAU_STATEMENT_TYPE ||
      "all";
    const agencia = normalizeItauAgencia(agenciaRaw);
    const conta = normalizeItauConta(contaRaw);
    const dac = normalizeItauDac(contaRaw);

    if (!agencia || !conta || !dac || !dataInicio) {
      return NextResponse.json(
        {
          message:
            "Parametros obrigatorios: agencia, conta com DAC e dataInicio. Exemplo: conta 12345-6.",
        },
        { status: 400 }
      );
    }

    const tokenData = await getItauExtratoAccessToken();
    const extrato = await consultarExtratoItau(tokenData.access_token, {
      agencia,
      conta,
      dac,
      dataInicio,
      dataFim,
      type,
    });

    const extratoData = Array.isArray(extrato?.data) ? extrato.data : [];
    console.log(
      "[API_ITAU_EXTRATO][SUMMARY]",
      JSON.stringify(
        {
          request: {
            agencia,
            conta,
            dac,
            dataInicio,
            dataFim,
            type,
          },
          totalDataItems: extratoData.length,
          items: extratoData.map((item, index) => ({
            index,
            eventCount: Array.isArray(item?.events) ? item.events.length : 0,
            balanceCount: Array.isArray(item?.balances) ? item.balances.length : 0,
            balancePreview: Array.isArray(item?.balances)
              ? item.balances.slice(0, 5).map((balance) => ({
                  type: balance?.type ?? null,
                  date: balance?.date ?? null,
                  amount: balance?.amount ?? null,
                }))
              : [],
          })),
        },
        null,
        2
      )
    );

    return NextResponse.json(extrato);
  } catch (err) {
    console.error("[ERRO API EXTRATO ITAU]", err);
    return NextResponse.json(
      { message: err.message || "Erro interno ao buscar extrato Itaú." },
      { status: 500 }
    );
  }
}
