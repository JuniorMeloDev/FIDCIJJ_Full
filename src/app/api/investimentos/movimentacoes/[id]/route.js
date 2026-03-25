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

export async function PUT(request, { params }) {
  try {
    ensureAuthenticated(request);
    const { id } = await params;
    const body = await request.json();

    const { data: registroAtual, error: registroAtualError } = await supabase
      .from("investimentos_movimentacoes")
      .select("id, origem")
      .eq("id", id)
      .single();

    if (registroAtualError) throw registroAtualError;

    if (body.tipo === "transferencia" || registroAtual?.origem === "transferencia") {
      return NextResponse.json(
        { message: "Transferências devem ser excluídas e recriadas para manter a integridade do saldo." },
        { status: 400 }
      );
    }

    const valor = roundMoney(body.valor);

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
      updated_at: new Date().toISOString(),
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
      .update(payload)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { message: error.message || "Erro ao atualizar movimentação." },
      { status: error.message === "Não autorizado" ? 401 : 500 }
    );
  }
}

export async function DELETE(request, { params }) {
  try {
    ensureAuthenticated(request);
    const { id } = await params;

    const { data: registroAtual, error: registroAtualError } = await supabase
      .from("investimentos_movimentacoes")
      .select("id, origem, observacao")
      .eq("id", id)
      .single();

    if (registroAtualError) throw registroAtualError;

    let idsParaExcluir = [id];

    if (registroAtual?.origem === "transferencia") {
      const metadata = parseTransferMetadata(registroAtual.observacao);
      const grupoTransferencia = metadata?.grupoTransferencia;

      if (grupoTransferencia) {
        const { data: transferencias, error: transferenciasError } = await supabase
          .from("investimentos_movimentacoes")
          .select("id, observacao")
          .eq("origem", "transferencia");

        if (transferenciasError) throw transferenciasError;

        idsParaExcluir = (transferencias || [])
          .filter((item) => parseTransferMetadata(item.observacao)?.grupoTransferencia === grupoTransferencia)
          .map((item) => item.id);
      }
    }

    const { error } = await supabase
      .from("investimentos_movimentacoes")
      .delete()
      .in("id", idsParaExcluir);

    if (error) throw error;
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { message: error.message || "Erro ao excluir movimentação." },
      { status: error.message === "Não autorizado" ? 401 : 500 }
    );
  }
}
