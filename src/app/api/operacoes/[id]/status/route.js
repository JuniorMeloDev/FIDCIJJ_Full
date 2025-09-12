import { NextResponse } from "next/server";
import { supabase } from "@/app/utils/supabaseClient";
import jwt from "jsonwebtoken";
import { sendOperationStatusEmail } from "@/app/lib/emailService";

export async function PUT(request, { params }) {
  try {
    const token = request.headers.get("Authorization")?.split(" ")[1];
    if (!token)
      return NextResponse.json({ message: "Não autorizado" }, { status: 401 });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userRoles = decoded.roles || [];
    if (!userRoles.includes("ROLE_ADMIN")) {
      return NextResponse.json({ message: "Acesso negado" }, { status: 403 });
    }

    const { id } = params;
    const { status, conta_bancaria_id, descontos, valor_debito_parcial, data_debito_parcial } = await request.json();

    const { data: operacao, error: fetchError } = await supabase
      .from("operacoes")
      .select("*, cliente:clientes(id, nome, email, ramo_de_atividade)")
      .eq("id", id)
      .single();

    if (fetchError || !operacao) {
      throw new Error("Operação a ser atualizada não foi encontrada.");
    }

    if (status === "Aprovada") {
      if (!conta_bancaria_id) {
        return NextResponse.json(
          { message: "Conta bancária é obrigatória para aprovação." },
          { status: 400 }
        );
      }

      const totalDescontosAdicionais = descontos?.reduce((acc, d) => acc + d.valor, 0) || 0;
      const novoValorLiquido = operacao.valor_liquido - totalDescontosAdicionais;
      
      let valorDebitado = novoValorLiquido;
      if (valor_debito_parcial && Number(valor_debito_parcial) > 0) {
          valorDebitado = Number(valor_debito_parcial);
      }

      if (descontos && descontos.length > 0) {
        const descontosToInsert = descontos.map(d => ({
            operacao_id: id,
            descricao: d.descricao,
            valor: d.valor
        }));
        await supabase.from('descontos').insert(descontosToInsert);
      }

      const { data: conta } = await supabase
        .from("contas_bancarias")
        .select("banco, agencia, conta_corrente")
        .eq("id", conta_bancaria_id)
        .single();
      const { data: clientes } = await supabase
        .from("clientes")
        .select("nome")
        .limit(1);
      const empresaMasterNome =
        clientes && clientes.length > 0 ? clientes[0].nome : "FIDC IJJ";

      let descricaoLancamento = `Borderô #${id}`;
      const { data: duplicatas } = await supabase
        .from("duplicatas")
        .select("nf_cte")
        .eq("operacao_id", id);
      if (duplicatas && duplicatas.length > 0 && operacao.cliente) {
        const docType =
          operacao.cliente.ramo_de_atividade === "Transportes" ? "CTe" : "NF";
        const numerosDoc = [
          ...new Set(duplicatas.map((d) => d.nf_cte.split(".")[0])),
        ].join(", ");
        descricaoLancamento = `Borderô ${docType} ${numerosDoc}`;
      }

      await supabase.from("movimentacoes_caixa").insert({
        operacao_id: id,
        data_movimento: data_debito_parcial || operacao.data_operacao,
        descricao: descricaoLancamento,
        valor: -Math.abs(valorDebitado),
        categoria: "Pagamento de Borderô",
        conta_bancaria: `${conta.banco} - ${conta.agencia}/${conta.conta_corrente}`,
        empresa_associada: empresaMasterNome,
      });

      await supabase
        .from("operacoes")
        .update({ 
            status: "Aprovada", 
            conta_bancaria_id,
            valor_liquido: novoValorLiquido,
            valor_total_descontos: operacao.valor_total_descontos + totalDescontosAdicionais,
            limite_utilizado: (operacao.limite_utilizado || 0) + novoValorLiquido, // Atualiza o limite
        })
        .eq("id", id);

    } else { // Rejeitada
      await supabase.from("duplicatas").delete().eq("operacao_id", id);
      await supabase.from("operacoes").update({ status: status }).eq("id", id);
    }

    const { data: clienteUser } = await supabase
      .from("users")
      .select("id")
      .eq("cliente_id", operacao.cliente.id)
      .single();
      
    if (clienteUser) {
      await supabase.from("notifications").insert({
        user_id: clienteUser.id,
        title: `Sua Operação #${id} foi ${status}`,
        message: `A operação no valor de R$ ${operacao.valor_liquido.toFixed(
          2
        )} foi ${status.toLowerCase()} pela nossa equipe.`,
        link: "/portal/dashboard",
      });

      if (operacao.cliente.email) {
        await sendOperationStatusEmail({
          clienteNome: operacao.cliente.nome,
          operacaoId: id,
          status: status,
          recipientEmail: operacao.cliente.email,
        });
      }
    }

    return NextResponse.json(
      { message: `Operação ${status.toLowerCase()} com sucesso.` },
      { status: 200 }
    );
  } catch (error) {
    console.error("Erro ao atualizar status da operação:", error);
    return NextResponse.json(
      { message: error.message || "Erro interno do servidor" },
      { status: 500 }
    );
  }
}