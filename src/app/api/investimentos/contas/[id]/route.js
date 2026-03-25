import { NextResponse } from "next/server";
import { supabase } from "@/app/utils/supabaseClient";
import { ensureAuthenticated } from "@/app/lib/investimentos";

export async function PUT(request, { params }) {
  try {
    ensureAuthenticated(request);
    const { id } = await params;
    const body = await request.json();

    const payload = {
      nome: body.nome,
      banco: body.banco,
      agencia: body.agencia || null,
      conta: body.conta || null,
      descricao: body.descricao || null,
      ativa: body.ativa !== false,
      updated_at: new Date().toISOString(),
    };

    if (!payload.nome || !payload.banco) {
      return NextResponse.json(
        { message: "Nome e banco são obrigatórios." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("investimentos_contas")
      .update(payload)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { message: error.message || "Erro ao atualizar conta de investimento." },
      { status: error.message === "Não autorizado" ? 401 : 500 }
    );
  }
}

export async function DELETE(request, { params }) {
  try {
    ensureAuthenticated(request);
    const { id } = await params;

    const { error } = await supabase
      .from("investimentos_contas")
      .delete()
      .eq("id", id);

    if (error) throw error;
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { message: error.message || "Erro ao excluir conta de investimento." },
      { status: error.message === "Não autorizado" ? 401 : 500 }
    );
  }
}
