import { NextResponse } from "next/server";
import { supabase } from "@/app/utils/supabaseClient";
import jwt from "jsonwebtoken";
import { buildRenegociacaoPlano, getValorBaseRenegociacao, roundMoney } from "@/app/lib/renegociacao";

const STATUS_BLOQUEADOS = new Set([
  "liquidada",
  "liquidado",
  "baixada",
  "baixado",
  "renegociada",
  "renegociado",
  "recebido",
]);

const toDateOnly = (date) => date.toISOString().split("T")[0];
const normalize = (value) => String(value || "").trim().toLowerCase();

const buildRenegociacaoBase = (duplicatas) => {
  const numeros = [
    ...new Set(
      duplicatas
        .map((dup) => String(dup.nf_cte || "").split(".")[0])
        .filter(Boolean)
    ),
  ];
  return numeros.length > 0 ? numeros.join("-") : `REN-${Date.now()}`;
};

export async function POST(request) {
  try {
    const token = request.headers.get("Authorization")?.split(" ")[1];
    if (!token) {
      return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });
    }

    const usuario = jwt.verify(token, process.env.JWT_SECRET);

    const {
      duplicataIds,
      novaDataVencimento,
      quantidadeParcelas,
      datasVencimentoParcelas,
      jurosManual,
      taxaJurosManual,
      observacao,
      encerramento,
      tipoOperacaoEncerramentoId,
    } = await request.json();
    const isEncerramento = encerramento === true;
    if (isEncerramento && !usuario.roles?.some((role) => ["ROLE_ADMIN", "ROLE_USER"].includes(role))) {
      return NextResponse.json({ message: "Acesso restrito à equipe interna." }, { status: 403 });
    }

    if (!Array.isArray(duplicataIds) || duplicataIds.length === 0) {
      return NextResponse.json(
        { message: "Nenhuma duplicata selecionada." },
        { status: 400 }
      );
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(novaDataVencimento || "")) ||
        !Number.isFinite(new Date(`${novaDataVencimento}T12:00:00Z`).getTime())) {
      return NextResponse.json(
        { message: "Informe a data da primeira parcela." },
        { status: 400 }
      );
    }

    const parcelas = Math.max(1, Number(quantidadeParcelas) || 1);
    const ids = [...new Set(duplicataIds.map(Number))];

    if (!ids.every((id) => Number.isSafeInteger(id) && id > 0) || !Number.isSafeInteger(parcelas)) {
      return NextResponse.json(
        { message: "IDs de duplicatas invalidos." },
        { status: 400 }
      );
    }

    const { data: duplicatas, error: duplicatasError } = await supabase
      .from("duplicatas")
      .select(
        `
          *,
          operacao:operacoes(
            *,
            cliente:clientes(*),
            tipo_operacao:tipos_operacao(*)
          )
        `
      )
      .in("id", ids)
      .order("id", { ascending: true });

    if (duplicatasError) throw duplicatasError;

    if (!duplicatas || duplicatas.length !== ids.length) {
      return NextResponse.json(
        { message: "Uma ou mais duplicatas nao foram encontradas." },
        { status: 404 }
      );
    }

    const bloqueada = duplicatas.find((duplicata) => {
      const statusAtual = normalize(
        duplicata.status ?? duplicata.status_recebimento
      );
      return STATUS_BLOQUEADOS.has(statusAtual);
    });

    if (bloqueada) {
      return NextResponse.json(
        {
          message: `Duplicata ${bloqueada.nf_cte || bloqueada.id} nao pode ser renegociada.`,
        },
        { status: 400 }
      );
    }

    const clienteId = duplicatas[0]?.operacao?.cliente_id;
    const tipoOperacaoId = duplicatas[0]?.operacao?.tipo_operacao_id;
    const sacadoId = duplicatas[0]?.sacado_id;

    if (!clienteId || !tipoOperacaoId) {
      return NextResponse.json(
        { message: "Nao foi possivel identificar cliente ou tipo de operacao." },
        { status: 400 }
      );
    }

    if (
      duplicatas.some((duplicata) => duplicata.operacao?.cliente_id !== clienteId)
    ) {
      return NextResponse.json(
        { message: "Selecione duplicatas do mesmo cliente para renegociar juntas." },
        { status: 400 }
      );
    }

    if (!isEncerramento &&
      duplicatas.some(
        (duplicata) => duplicata.operacao?.tipo_operacao_id !== tipoOperacaoId
      )
    ) {
      return NextResponse.json(
        {
          message:
            "Selecione duplicatas do mesmo tipo de operacao para renegociar juntas.",
        },
        { status: 400 }
      );
    }

    if (!isEncerramento && duplicatas.some((duplicata) => duplicata.sacado_id !== sacadoId)) {
      return NextResponse.json(
        { message: "Marque Encerramento do cliente para reunir títulos de sacados diferentes." },
        { status: 400 }
      );
    }

    const observacaoNormalizada = String(observacao || "").trim();
    const hoje = toDateOnly(new Date());
    const baseRenegociacao = buildRenegociacaoBase(duplicatas);
    const baseOperacao = `REN-${baseRenegociacao}`;

    const plano = buildRenegociacaoPlano({
      duplicatas,
      novaDataVencimento,
      quantidadeParcelas: parcelas,
      datasVencimentoParcelas,
      taxaJurosManual,
      jurosManual,
    });

    if (plano.totalOriginal <= 0) {
      return NextResponse.json(
        { message: "O total original das duplicatas deve ser maior que zero." },
        { status: 400 }
      );
    }

    if (isEncerramento) {
      const tipos = new Set(duplicatas.map((duplicata) => duplicata.operacao.tipo_operacao_id));
      const tipoId = tipos.size === 1 ? tipoOperacaoId : Number(tipoOperacaoEncerramentoId);
      if (!tipos.has(tipoId)) {
        return NextResponse.json(
          { message: "Escolha o tipo da operação de encerramento." },
          { status: 400 }
        );
      }
      if (plano.parcelasCalculadas.some((parcela) => !Number.isFinite(parcela.valorParcela) || parcela.valorParcela <= 0)) {
        return NextResponse.json({ message: "As parcelas devem ter valor positivo." }, { status: 400 });
      }
      const { data: encerrado, error } = await supabase.rpc("registrar_encerramento_cliente", {
        p_cliente_id: clienteId,
        p_tipo_operacao_id: tipoId,
        p_ids: ids,
        p_data_operacao: new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date()),
        p_primeiro_vencimento: plano.parcelasCalculadas[0].dataVencimento,
        p_parcelas: plano.parcelasCalculadas.map((parcela) => ({
          numero: parcela.numeroParcela,
          valor: parcela.valorParcela,
          juros: parcela.jurosParcela,
          vencimento: parcela.dataVencimento,
        })),
        p_juros_calculado: plano.jurosCalculado,
        p_juros_manual: jurosManual === "" ? null : jurosManual ?? null,
        p_observacao: observacaoNormalizada || null,
        p_titulos: duplicatas.map((duplicata) => ({
          id: duplicata.id,
          nf_cte: duplicata.nf_cte,
          sacado: duplicata.cliente_sacado,
          data_vencimento: duplicata.data_vencimento,
          valor_bruto: duplicata.valor_bruto,
          valor_juros: duplicata.valor_juros,
          principal: roundMoney(getValorBaseRenegociacao(duplicata)),
        })),
      });
      if (error?.code === "P0001") return NextResponse.json({ message: error.message }, { status: 409 });
      if (error) throw error;

      return NextResponse.json({
        success: true,
        message: "Operação de encerramento registrada.",
        clienteId,
        operacaoId: encerrado.operacaoNova.id,
        ...encerrado,
      });
    }

    const observacaoOperacao =
      observacaoNormalizada || `Renegociacao da operacao ${baseOperacao}`;

    const { data: novaOperacao, error: operacaoError } = await supabase
      .from("operacoes")
      .insert({
        data_operacao: hoje,
        tipo_operacao_id: tipoOperacaoId,
        cliente_id: clienteId,
        valor_total_bruto: plano.totalRenegociado,
        valor_total_juros: plano.jurosTotal,
        valor_total_descontos: 0,
        valor_liquido: plano.totalOriginal,
        status: "Aprovada",
        conta_bancaria_id: null,
        chave_nfe: baseOperacao,
      })
      .select("*")
      .single();

    if (operacaoError) throw operacaoError;

    const duplicatasParaSalvar = plano.parcelasCalculadas.map((parcela) => ({
      operacao_id: novaOperacao.id,
      nf_cte: `${baseOperacao}.${parcela.numeroParcela}`,
      cliente_sacado: duplicatas[0]?.cliente_sacado || "Renegociacao",
      sacado_id: sacadoId,
      valor_bruto: parcela.valorParcela,
      valor_juros: parcela.jurosParcela,
      data_operacao: hoje,
      data_vencimento: parcela.dataVencimento,
      status_recebimento: "Pendente",
      origem_renegociacao_id: ids[0],
      observacao: observacaoOperacao,
    }));

    const { data: novasDuplicatas, error: duplicatasInsertError } = await supabase
      .from("duplicatas")
      .insert(duplicatasParaSalvar)
      .select("*");

    if (duplicatasInsertError) {
      await supabase.from("operacoes").delete().eq("id", novaOperacao.id);
      throw duplicatasInsertError;
    }

    const { error: baixaError } = await supabase
      .from("duplicatas")
      .update({
        status_recebimento: "Recebido",
        data_liquidacao: hoje,
        observacao_baixa:
          observacaoNormalizada ||
          "Duplicata baixada por renegociacao, sem movimentacao financeira.",
      })
      .in("id", ids);

    if (baixaError) {
      await supabase
        .from("duplicatas")
        .delete()
        .in(
          "id",
          (novasDuplicatas || []).map((duplicata) => duplicata.id)
        );
      await supabase.from("operacoes").delete().eq("id", novaOperacao.id);
      throw baixaError;
    }

    const { error: historicoError } = await supabase
      .from("renegociacoes_duplicatas")
      .insert({
        duplicata_ids: ids,
        novas_duplicata_ids: (novasDuplicatas || []).map((duplicata) => duplicata.id),
        nova_data_vencimento: novaDataVencimento,
        total_original: plano.totalOriginal,
        juros_calculado: plano.jurosCalculado,
        juros_manual:
          jurosManual !== null &&
          jurosManual !== undefined &&
          jurosManual !== "" &&
          Number.isFinite(Number(jurosManual))
            ? Number(jurosManual)
            : null,
        total_renegociado: plano.totalRenegociado,
        observacao: observacaoNormalizada || null,
      });

    if (historicoError) {
      console.warn("Falha ao salvar historico de renegociacao:", historicoError);
    }

    return NextResponse.json(
      {
        success: true,
        message: "Renegociacao realizada com sucesso.",
        totalOriginal: plano.totalOriginal,
        jurosCalculado: plano.jurosCalculado,
        jurosTotal: plano.jurosTotal,
        totalRenegociado: plano.totalRenegociado,
        quantidadeParcelas: parcelas,
        operacaoId: novaOperacao.id,
        clienteId,
        operacaoNova: novaOperacao,
        novasDuplicatas,
        parcelasCalculadas: plano.parcelasCalculadas,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Erro ao renegociar duplicatas:", error);
    return NextResponse.json(
      { message: error.message || "Falha ao renegociar duplicata(s)." },
      { status: 500 }
    );
  }
}
