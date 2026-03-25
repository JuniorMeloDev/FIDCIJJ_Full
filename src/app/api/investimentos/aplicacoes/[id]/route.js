import { NextResponse } from "next/server";
import { supabase } from "@/app/utils/supabaseClient";
import { ensureAuthenticated } from "@/app/lib/investimentos";

export async function PUT(request, { params }) {
  try {
    ensureAuthenticated(request);
    const { id } = await params;
    const body = await request.json();

    const payload = {
      conta_id: body.contaId,
      nome: body.nome,
      descricao: body.descricao || null,
      percentual_juros_mensal: body.percentualJurosMensal || 0,
      base_dias: body.baseDias || "corridos",
      rende_juros: body.rendeJuros !== false,
      ativa: body.ativa !== false,
      updated_at: new Date().toISOString(),
    };

    if (!payload.conta_id || !payload.nome) {
      return NextResponse.json(
        { message: "Conta e nome da aplicação são obrigatórios." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("investimentos_aplicacoes")
      .update(payload)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { message: error.message || "Erro ao atualizar aplicação." },
      { status: error.message === "Não autorizado" ? 401 : 500 }
    );
  }
}

export async function DELETE(request, { params }) {
  try {
    ensureAuthenticated(request);
    const { id } = await params;

    const { error } = await supabase
      .from("investimentos_aplicacoes")
      .delete()
      .eq("id", id);

    if (error) throw error;
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { message: error.message || "Erro ao excluir aplicação." },
      { status: error.message === "Não autorizado" ? 401 : 500 }
    );
  }
}
