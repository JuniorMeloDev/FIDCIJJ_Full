import { NextResponse } from "next/server";
import { supabase } from "@/app/utils/supabaseClient";
import jwt from "jsonwebtoken";

// GET: Retorna a contagem de notificações não lidas
export async function GET(request) {
  try {
    const token = request.headers.get("Authorization")?.split(" ")[1];
    if (!token) {
      return NextResponse.json(
        { message: "Token não fornecido." },
        { status: 401 }
      );
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // **PONTO CHAVE DA CORREÇÃO**:
    // O token de autenticação DEVE conter o campo 'user_id' com o UUID
    // do usuário da tabela 'auth.users' do Supabase.
    const userId = decoded.user_id;

    if (!userId) {
      console.error(
        "Erro Crítico: O token de autenticação não contém o 'user_id' (UUID) necessário."
      );
      return NextResponse.json(
        { message: "Token de autenticação inválido ou mal configurado." },
        { status: 401 }
      );
    }

    // A tabela 'notifications' usa uma política de segurança (RLS) que só permite
    // que um usuário veja suas próprias notificações. A API usa a chave de serviço
    // e precisa do ID do usuário para fazer a consulta corretamente.
    const { count, error } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId) // Compara com o ID do token
      .eq("is_read", false);

    if (error) {
      console.error("Error fetching unread notifications count:", error);
      // Este erro geralmente acontece se o 'user_id' no token não for um UUID válido
      // ou se a política de segurança (RLS) no Supabase estiver bloqueando o acesso.
      return NextResponse.json(
        { message: `Erro na consulta de notificações: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ count: count || 0 }, { status: 200 });
  } catch (error) {
    if (error.name === "JsonWebTokenError") {
      return NextResponse.json(
        { message: "Token JWT inválido ou expirado." },
        { status: 401 }
      );
    }
    console.error("General error in GET unread-count:", error);
    return NextResponse.json(
      { message: error.message || "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
