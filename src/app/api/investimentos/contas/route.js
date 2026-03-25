import { NextResponse } from "next/server";
import { supabase } from "@/app/utils/supabaseClient";
import { ensureAuthenticated } from "@/app/lib/investimentos";

export async function GET(request) {
  try {
    ensureAuthenticated(request);

    const { data, error } = await supabase
      .from("investimentos_contas")
      .select("*")
      .order("nome", { ascending: true });

    if (error) throw error;
    return NextResponse.json(data || [], { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { message: error.message || "Erro ao carregar contas de investimento." },
      { status: error.message === "Não autorizado" ? 401 : 500 }
    );
  }
}

export async function POST(request) {
  try {
    ensureAuthenticated(request);
    const body = await request.json();

    const payload = {
      nome: body.nome,
      banco: body.banco,
      agencia: body.agencia || null,
      conta: body.conta || null,
      descricao: body.descricao || null,
      ativa: body.ativa !== false,
    };

    if (!payload.nome || !payload.banco) {
      return NextResponse.json(
        { message: "Nome e banco são obrigatórios." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("investimentos_contas")
      .insert(payload)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { message: error.message || "Erro ao criar conta de investimento." },
      { status: error.message === "Não autorizado" ? 401 : 500 }
    );
  }
}
