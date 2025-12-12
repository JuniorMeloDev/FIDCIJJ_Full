import { NextResponse } from "next/server";
import { supabase } from "@/app/utils/supabaseClient";
import jwt from "jsonwebtoken";
import { sendOperationStatusEmail } from "@/app/lib/emailService";
import { getInterAccessToken, enviarPixInter } from "@/app/lib/interService";
import { format } from 'date-fns';

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
    const { status, conta_bancaria_id, descontos, valor_debito_parcial, data_debito_parcial, efetuar_pix, recompraData } = await request.json();

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
        .select("*")
        .eq("id", conta_bancaria_id)
        .single();
      
      let pixEndToEndId = null;
      if (efetuar_pix && conta.banco.toLowerCase().includes('inter')) {
          const { data: contasCliente } = await supabase.from('contas_bancarias').select('*').eq('cliente_id', operacao.cliente.id);
          const contaDestino = contasCliente.find(c => c.chave_pix);

          if (!contaDestino || !contaDestino.chave_pix) {
              throw new Error(`Cliente ${operacao.cliente.nome} não possui chave PIX cadastrada para recebimento.`);
          }
          
          const dadosPix = {
              valor: parseFloat(valorDebitado.toFixed(2)),
              dataPagamento: format(new Date(), 'yyyy-MM-dd'),
              descricao: `Pagamento Borderô #${id}`,
              destinatario: {
                  tipo: "CHAVE",
                  chave: contaDestino.chave_pix
              }
          };
          
          const tokenInter = await getInterAccessToken();
          const resultadoPix = await enviarPixInter(tokenInter.access_token, dadosPix, conta.conta_corrente);
          pixEndToEndId = resultadoPix.endToEndId;
      }

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
      
      if(pixEndToEndId) {
          descricaoLancamento = `PIX Enviado - ${descricaoLancamento}`;
      }

      // --- CORREÇÃO APLICADA AQUI ---
      // A 'empresa_associada' agora é o nome do cliente da operação, e não mais a empresa master.
      await supabase.from("movimentacoes_caixa").insert({
        operacao_id: id,
        data_movimento: data_debito_parcial || operacao.data_operacao,
        descricao: descricaoLancamento,
        valor: -Math.abs(valorDebitado),
        categoria: "Pagamento de Borderô",
        conta_bancaria: `${conta.banco} - ${conta.agencia}/${conta.conta_corrente}`,
        empresa_associada: operacao.cliente.nome, // <-- CORREÇÃO
        transaction_id: pixEndToEndId
      });
      // --- FIM DA CORREÇÃO ---

      await supabase
        .from("operacoes")
        .update({ 
            status: "Aprovada", 
            conta_bancaria_id,
            valor_liquido: novoValorLiquido,
            valor_total_descontos: operacao.valor_total_descontos + totalDescontosAdicionais
        })
        .eq("id", id);

      if (recompraData && recompraData.ids && recompraData.ids.length > 0) {
          const { error: recompraError } = await supabase
              .from('duplicatas')
              .update({
                  status_recebimento: 'Recebido',
                  data_liquidacao: recompraData.dataLiquidacao
              })
              .in('id', recompraData.ids);
          
          if (recompraError) {
              console.error("AVISO: Operação salva, mas falhou ao dar baixa nas duplicatas de recompra. Erro:", recompraError);
          }
      }

    } else {
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

// DELETE: Apaga uma operação completa e suas movimentações de caixa
export async function DELETE(request, { params }) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const { id } = await params;

        // 1. Verificar se alguma duplicata da operação já foi liquidada
        const { data: duplicatasLiquidadas, error: checkError } = await supabase
            .from('duplicatas')
            .select('id')
            .eq('operacao_id', id)
            .eq('status_recebimento', 'Recebido')
            .limit(1);

        if (checkError) throw checkError;

        if (duplicatasLiquidadas.length > 0) {
            return NextResponse.json({ message: 'Não é possível excluir uma operação que contém duplicatas já liquidadas.' }, { status: 400 });
        }

        // Se nenhuma estiver liquidada, prosseguir com a exclusão em cascata
        
        // 2. Excluir movimentações de caixa associadas
        await supabase.from('movimentacoes_caixa').delete().eq('operacao_id', id);

        // 3. Excluir descontos associados
        await supabase.from('descontos').delete().eq('operacao_id', id);

        // 4. Excluir duplicatas associadas (agora seguro, pois não estão liquidadas)
        await supabase.from('duplicatas').delete().eq('operacao_id', id);

        // 5. Excluir a operação principal
        const { error: operacaoError } = await supabase.from('operacoes').delete().eq('id', id);
        if (operacaoError) throw operacaoError;

        return new NextResponse(null, { status: 204 }); // No Content

    } catch (error) {
        console.error('Erro ao excluir operação:', error);
        return NextResponse.json({ message: error.message || 'Erro interno do servidor' }, { status: 500 });
    }
}