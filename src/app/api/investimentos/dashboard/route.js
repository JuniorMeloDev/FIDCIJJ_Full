import { NextResponse } from "next/server";
import { supabase } from "@/app/utils/supabaseClient";
import {
  buildInvestmentDashboard,
  ensureAuthenticated,
  getStartOfMonthKey,
  getTodayKey,
} from "@/app/lib/investimentos";

export async function GET(request) {
  try {
    ensureAuthenticated(request);

    const { searchParams } = new URL(request.url);
    const dataFim = searchParams.get("dataFim") || getTodayKey();
    const dataInicio = searchParams.get("dataInicio") || getStartOfMonthKey(dataFim);
    const contaId = searchParams.get("contaId");
    const aplicacaoId = searchParams.get("aplicacaoId");
    const tipo = searchParams.get("tipo");

    const contasQuery = supabase
      .from("investimentos_contas")
      .select("*")
      .order("nome", { ascending: true });

    if (contaId) {
      contasQuery.eq("id", contaId);
    }

    const aplicacoesQuery = supabase
      .from("investimentos_aplicacoes")
      .select("*")
      .order("nome", { ascending: true });

    if (contaId) {
      aplicacoesQuery.eq("conta_id", contaId);
    }

    if (aplicacaoId) {
      aplicacoesQuery.eq("id", aplicacaoId);
    }

    const movimentacoesQuery = supabase
      .from("investimentos_movimentacoes")
      .select("*")
      .lte("data_movimento", dataFim)
      .order("data_movimento", { ascending: true })
      .order("id", { ascending: true });

    if (contaId) {
      movimentacoesQuery.eq("conta_id", contaId);
    }

    if (aplicacaoId) {
      movimentacoesQuery.eq("aplicacao_id", aplicacaoId);
    }

    const [
      { data: contas, error: contasError },
      { data: aplicacoes, error: aplicacoesError },
      { data: movimentacoes, error: movimentacoesError },
    ] = await Promise.all([contasQuery, aplicacoesQuery, movimentacoesQuery]);

    if (contasError) throw contasError;
    if (aplicacoesError) throw aplicacoesError;
    if (movimentacoesError) throw movimentacoesError;

    const dashboard = buildInvestmentDashboard({
      contas: contas || [],
      aplicacoes: aplicacoes || [],
      movimentacoes: movimentacoes || [],
      dataInicio,
      dataFim,
      tipo,
    });

    return NextResponse.json(
      {
        filters: {
          dataInicio,
          dataFim,
          contaId: contaId || "",
          aplicacaoId: aplicacaoId || "",
          tipo: tipo || "",
        },
        ...dashboard,
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      { message: error.message || "Erro ao carregar dashboard de investimentos." },
      { status: error.message === "Não autorizado" ? 401 : 500 }
    );
  }
}
