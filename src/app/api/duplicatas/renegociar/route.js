import { NextResponse } from "next/server";
import { supabase } from "@/app/utils/supabaseClient";
import jwt from "jsonwebtoken";

const STATUS_BLOQUEADOS = new Set(["liquidada", "liquidado", "baixada", "baixado", "renegociada", "renegociado", "recebido"]);

const toNumber = (value) => Number(value || 0);

const toDateOnly = (date) => date.toISOString().split("T")[0];

const diffDias = (dataInicial, dataFinal) => {
  if (!dataInicial || !dataFinal) return 0;
  const inicio = new Date(`${String(dataInicial).split("T")[0]}T00:00:00`);
  const fim = new Date(`${String(dataFinal).split("T")[0]}T00:00:00`);
  const diff = Math.ceil((fim - inicio) / 86400000);
  return Number.isFinite(diff) ? Math.max(diff, 0) : 0;
};

const getTaxaMensal = (duplicata) =>
  toNumber(
    duplicata?.operacao?.tipo_operacao?.taxa_juros ??
      duplicata?.operacao?.tipo_operacao?.taxa_juros_mora ??
      duplicata?.operacao?.taxa_juros ??
      duplicata?.taxaJuros ??
      duplicata?.taxa_juros ??
      0
  );

const calcularJurosDuplicata = (duplicata, novaDataVencimento, taxaManual = null) => {
  const valorBruto = toNumber(duplicata.valor_bruto);
  const dias = diffDias(duplicata.data_vencimento, novaDataVencimento);
  const taxaMensal = taxaManual ?? getTaxaMensal(duplicata);
  return valorBruto * (taxaMensal / 100 / 30) * dias;
};

export async function POST(request) {
  try {
    const token = request.headers.get("Authorization")?.split(" ")[1];
    if (!token) {
      return NextResponse.json({ message: "Não autorizado" }, { status: 401 });
    }

    jwt.verify(token, process.env.JWT_SECRET);

    const {
      duplicataIds,
      novaDataVencimento,
      jurosManual,
      taxaJurosManual,
      observacao,
    } = await request.json();

    if (!Array.isArray(duplicataIds) || duplicataIds.length === 0) {
      return NextResponse.json(
        { message: "Nenhuma duplicata selecionada." },
        { status: 400 }
      );
    }

    if (!novaDataVencimento) {
      return NextResponse.json(
        { message: "Informe a nova data de vencimento." },
        { status: 400 }
      );
    }

    const ids = [...new Set(duplicataIds.map(Number).filter(Boolean))];
    if (ids.length === 0) {
      return NextResponse.json(
        { message: "IDs de duplicatas inválidos." },
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
            tipo_operacao:tipos_operacao(*)
          )
        `
      )
      .in("id", ids);

    if (duplicatasError) throw duplicatasError;

    if (!duplicatas || duplicatas.length !== ids.length) {
      return NextResponse.json(
        { message: "Uma ou mais duplicatas não foram encontradas." },
        { status: 404 }
      );
    }

    const duplicataBloqueada = duplicatas.find((duplicata) => {
      const statusAtual = String(
        duplicata.status ?? duplicata.status_recebimento ?? ""
      ).toLowerCase();
      return STATUS_BLOQUEADOS.has(statusAtual);
    });

    if (duplicataBloqueada) {
      return NextResponse.json(
        {
          message: `Duplicata ${duplicataBloqueada.nf_cte || duplicataBloqueada.id} não pode ser renegociada.`,
        },
        { status: 400 }
      );
    }

    const totalOriginal = duplicatas.reduce(
      (sum, duplicata) => sum + toNumber(duplicata.valor_bruto),
      0
    );

    if (totalOriginal <= 0) {
      return NextResponse.json(
        { message: "O total original das duplicatas deve ser maior que zero." },
        { status: 400 }
      );
    }

    const jurosManualInformado =
      jurosManual !== null &&
      jurosManual !== undefined &&
      jurosManual !== "" &&
      Number.isFinite(Number(jurosManual));
    const taxaManualInformada =
      taxaJurosManual !== null &&
      taxaJurosManual !== undefined &&
      taxaJurosManual !== "" &&
      Number.isFinite(Number(taxaJurosManual));
    const taxaManual = taxaManualInformada ? Number(taxaJurosManual) : null;

    const jurosCalculado = duplicatas.reduce(
      (sum, duplicata) =>
        sum + calcularJurosDuplicata(duplicata, novaDataVencimento, taxaManual),
      0
    );
    const jurosTotal = jurosManualInformado ? Number(jurosManual) : jurosCalculado;
    const totalRenegociado = totalOriginal + jurosTotal;
    const hoje = toDateOnly(new Date());
    const observacaoNormalizada = String(observacao || "").trim();
    let observacaoBaixa =
      observacaoNormalizada ||
      "Duplicata baixada por renegociação, sem movimentação financeira.";
    if (!observacaoNormalizada) {
      observacaoBaixa = `Renegociada em ${hoje}`;
    }

    const observacaoNova =
      observacaoNormalizada || "Duplicata criada por renegociação";

    const novasDuplicatasPayload = duplicatas.map((duplicata) => {
      const valorBruto = toNumber(duplicata.valor_bruto);
      const proporcao = valorBruto / totalOriginal;
      const jurosRateado = jurosTotal * proporcao;

      return {
        operacao_id: duplicata.operacao_id,
        sacado_id: duplicata.sacado_id,
        cliente_sacado: duplicata.cliente_sacado,
        nf_cte: `${duplicata.nf_cte}-REN`,
        data_operacao: hoje,
        data_vencimento: novaDataVencimento,
        valor_bruto: valorBruto + jurosRateado,
        valor_juros: jurosRateado,
        status_recebimento: "Pendente",
        origem_renegociacao_id: duplicata.id,
        observacao: observacaoNova,
      };
    });

    const { data: novasDuplicatas, error: insertError } = await supabase
      .from("duplicatas")
      .insert(novasDuplicatasPayload)
      .select("*");

    if (insertError) throw insertError;

    const { error: updateError } = await supabase
      .from("duplicatas")
      .update({
        status_recebimento: "Recebido",
        data_liquidacao: hoje,
        observacao_baixa: observacaoBaixa,
      })
      .in("id", ids);

    if (updateError) throw updateError;

    const { error: historicoError } = await supabase
      .from("renegociacoes_duplicatas")
      .insert({
        duplicata_ids: ids,
        novas_duplicata_ids: (novasDuplicatas || []).map((duplicata) => duplicata.id),
        nova_data_vencimento: novaDataVencimento,
        total_original: totalOriginal,
        juros_calculado: jurosCalculado,
        juros_manual: jurosManualInformado ? Number(jurosManual) : null,
        total_renegociado: totalRenegociado,
        observacao: observacaoNormalizada || null,
      });

    if (historicoError) {
      console.warn("Falha ao salvar histórico de renegociação:", historicoError);
    }

    return NextResponse.json(
      {
        success: true,
        message: "Renegociação realizada com sucesso.",
        totalOriginal,
        jurosCalculado,
        jurosTotal,
        totalRenegociado,
        operacaoId: duplicatas[0]?.operacao_id,
        clienteId: duplicatas[0]?.operacao?.cliente_id,
        novasDuplicatas,
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

