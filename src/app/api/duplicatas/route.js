import { NextResponse } from "next/server";
import { supabase } from "@/app/utils/supabaseClient";
import jwt from "jsonwebtoken";

export async function GET(request) {
  try {
    const token = request.headers.get("Authorization")?.split(" ")[1];
    if (!token)
      return NextResponse.json({ message: "Não autorizado" }, { status: 401 });
    jwt.verify(token, process.env.JWT_SECRET);

    const { searchParams } = new URL(request.url);

    let { data: duplicatas, error } = await supabase
      .from("duplicatas")
      .select(
        `
                *,
                operacao:operacoes (
                    cliente_id,
                    tipo_operacao_id,
                    cliente:clientes ( nome ),
                    tipo_operacao:tipos_operacao ( nome )
                )
            `
      )
      .order("data_operacao", { ascending: true });

    if (error) throw error;

    const sacadoFilter = searchParams.get("sacado");
    const statusFilter = searchParams.get("status");
    const dataInicio = searchParams.get("dataInicio");
    const dataFim = searchParams.get("dataFim");
    const clienteIdFilter = searchParams.get("clienteId");
    const tipoOperacaoIdFilter = searchParams.get("tipoOperacaoId");

    const filteredData = duplicatas.filter((dup) => {
      if (!dup.operacao) return false;
      if (
        sacadoFilter &&
        !dup.cliente_sacado.toLowerCase().includes(sacadoFilter.toLowerCase())
      )
        return false;
      if (
        statusFilter &&
        statusFilter !== "Todos" &&
        dup.status_recebimento !== statusFilter
      )
        return false;
      if (dataInicio && dup.data_operacao < dataInicio) return false;
      if (dataFim && dup.data_operacao > dataFim) return false;
      if (
        clienteIdFilter &&
        String(dup.operacao.cliente_id) !== clienteIdFilter
      )
        return false;
      if (
        tipoOperacaoIdFilter &&
        String(dup.operacao.tipo_operacao_id) !== tipoOperacaoIdFilter
      )
        return false;
      return true;
    });

    // Adiciona juros_mora ao objeto retornado
    let formattedData = filteredData.map((d) => ({
      id: d.id,
      operacao_id: d.operacao_id,
      cliente_id: d.operacao?.cliente_id,
      data_operacao: d.data_operacao,
      nf_cte: d.nf_cte,
      empresa_cedente: d.operacao?.cliente?.nome,
      valor_bruto: d.valor_bruto,
      valor_juros: d.valor_juros,
      juros_mora: d.juros_mora, // <-- ALTERAÇÃO AQUI
      cliente_sacado: d.cliente_sacado,
      data_vencimento: d.data_vencimento,
      tipo_operacao_nome: d.operacao?.tipo_operacao?.nome,
      status_recebimento: d.status_recebimento,
    }));

    const uniqueData = Array.from(
      new Map(
        formattedData.map((item) => [
          `${item.data_operacao}-${item.nf_cte}-${item.valor_bruto}`,
          item,
        ])
      ).values()
    );

    return NextResponse.json(uniqueData, { status: 200 });
  } catch (error) {
    console.error("Erro ao gerar relatório de duplicatas:", error);
    if (
      error.name === "JsonWebTokenError" ||
      error.name === "TokenExpiredError"
    ) {
      return NextResponse.json(
        { message: "Token inválido ou expirado" },
        { status: 403 }
      );
    }
    return NextResponse.json(
      { message: error.message || "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
