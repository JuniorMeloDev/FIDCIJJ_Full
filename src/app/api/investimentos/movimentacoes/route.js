import { NextResponse } from "next/server";
import { supabase } from "@/app/utils/supabaseClient";
import { ensureAuthenticated, roundMoney } from "@/app/lib/investimentos";

function parseTransferMetadata(value) {
  try {
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

export async function GET(request) {
  try {
    ensureAuthenticated(request);

    const { searchParams } = new URL(request.url);
    const contaId = searchParams.get("contaId");
    const aplicacaoId = searchParams.get("aplicacaoId");

    const query = supabase
      .from("investimentos_movimentacoes")
      .select("*")
      .order("data_movimento", { ascending: false })
      .order("id", { ascending: false });

    if (contaId) {
      query.eq("conta_id", contaId);
    }

    if (aplicacaoId) {
      query.eq("aplicacao_id", aplicacaoId);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json(data || [], { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { message: error.message || "Erro ao carregar movimentações." },
      { status: error.message === "Não autorizado" ? 401 : 500 }
    );
  }
}

export async function POST(request) {
  try {
    ensureAuthenticated(request);
    const body = await request.json();
    const valor = roundMoney(Math.abs(body.valor));

    if (body.tipo === "transferencia") {
      if (
        !body.contaId ||
        !body.aplicacaoId ||
        !body.aplicacaoDestinoId ||
        !body.dataMovimento ||
        !body.descricao ||
        !valor
      ) {
        return NextResponse.json(
          { message: "Conta, aplicações de origem e destino, data, descrição e valor são obrigatórios." },
          { status: 400 }
        );
      }

      if (Number(body.aplicacaoId) === Number(body.aplicacaoDestinoId)) {
        return NextResponse.json(
          { message: "Selecione uma aplicação de destino diferente da origem." },
          { status: 400 }
        );
      }

      const grupoTransferencia = crypto.randomUUID();
      const observacaoBase = body.observacao || null;
      const payload = [
        {
          conta_id: body.contaId,
          aplicacao_id: body.aplicacaoId,
          data_movimento: body.dataMovimento,
          tipo: "resgate",
          descricao: body.descricao,
          valor: roundMoney(valor * -1),
          observacao: JSON.stringify({
            grupoTransferencia,
            direcao: "saida",
            aplicacaoOrigemId: Number(body.aplicacaoId),
            aplicacaoDestinoId: Number(body.aplicacaoDestinoId),
            observacao: observacaoBase,
          }),
          origem: "transferencia",
        },
        {
          conta_id: body.contaId,
          aplicacao_id: body.aplicacaoDestinoId,
          data_movimento: body.dataMovimento,
          tipo: "aporte",
          descricao: body.descricao,
          valor,
          observacao: JSON.stringify({
            grupoTransferencia,
            direcao: "entrada",
            aplicacaoOrigemId: Number(body.aplicacaoId),
            aplicacaoDestinoId: Number(body.aplicacaoDestinoId),
            observacao: observacaoBase,
          }),
          origem: "transferencia",
        },
      ];

      const { data, error } = await supabase
        .from("investimentos_movimentacoes")
        .insert(payload)
        .select();

      if (error) throw error;
      return NextResponse.json(data, { status: 201 });
    }

    const payload = {
      conta_id: body.contaId,
      aplicacao_id: body.aplicacaoId,
      data_movimento: body.dataMovimento,
      tipo: body.tipo,
      descricao: body.descricao,
      valor:
        body.tipo === "resgate" && valor > 0
          ? roundMoney(valor * -1)
          : valor,
      observacao: body.observacao || null,
      origem: "manual",
    };

    if (
      !payload.conta_id ||
      !payload.aplicacao_id ||
      !payload.data_movimento ||
      !payload.tipo ||
      !payload.descricao ||
      !payload.valor
    ) {
      return NextResponse.json(
        { message: "Conta, aplicação, data, tipo, descrição e valor são obrigatórios." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("investimentos_movimentacoes")
      .insert(payload)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { message: error.message || "Erro ao criar movimentação." },
      { status: error.message === "Não autorizado" ? 401 : 500 }
    );
  }
}
