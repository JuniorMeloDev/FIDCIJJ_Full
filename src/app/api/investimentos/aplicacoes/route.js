import { NextResponse } from "next/server";
import { supabase } from "@/app/utils/supabaseClient";
import { ensureAuthenticated } from "@/app/lib/investimentos";

export async function GET(request) {
  try {
    ensureAuthenticated(request);

    const { data, error } = await supabase
      .from("investimentos_aplicacoes")
      .select("*")
      .order("nome", { ascending: true });

    if (error) throw error;
    return NextResponse.json(data || [], { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { message: error.message || "Erro ao carregar aplicações." },
      { status: error.message === "Não autorizado" ? 401 : 500 }
    );
  }
}

export async function POST(request) {
  try {
    ensureAuthenticated(request);
    const body = await request.json();

    const payload = {
      conta_id: body.contaId,
      nome: body.nome,
      descricao: body.descricao || null,
      percentual_juros_mensal: body.percentualJurosMensal || 0,
      base_dias: body.baseDias || "corridos",
      rende_juros: body.rendeJuros !== false,
      ativa: body.ativa !== false,
    };

    if (!payload.conta_id || !payload.nome) {
      return NextResponse.json(
        { message: "Conta e nome da aplicação são obrigatórios." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("investimentos_aplicacoes")
      .insert(payload)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { message: error.message || "Erro ao criar aplicação." },
      { status: error.message === "Não autorizado" ? 401 : 500 }
    );
  }
}
