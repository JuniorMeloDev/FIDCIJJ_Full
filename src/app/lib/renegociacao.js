import { addMonths } from "date-fns";

const toNumber = (value) => Number(value || 0);

export const roundMoney = (value) =>
  Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export const diffDias = (dataInicial, dataFinal) => {
  if (!dataInicial || !dataFinal) return 0;
  const inicio = new Date(`${String(dataInicial).split("T")[0]}T00:00:00`);
  const fim = new Date(`${String(dataFinal).split("T")[0]}T00:00:00`);
  const diff = Math.ceil((fim - inicio) / 86400000);
  return Number.isFinite(diff) ? Math.max(diff, 0) : 0;
};

export const isPostFixedInterest = (operation, duplicate) => {
  if (!operation) return false;

  if (typeof operation.juros_pre_fixado === "boolean") {
    return !operation.juros_pre_fixado;
  }

  if (typeof operation.tipo_operacao?.juros_pre_fixado === "boolean") {
    return !operation.tipo_operacao.juros_pre_fixado;
  }

  const totalDescontadoNaOrigem =
    (operation.valor_total_bruto || 0) - (operation.valor_liquido || 0);
  const descontosEsperadosPreFixado =
    (operation.valor_total_juros || 0) + (operation.valor_total_descontos || 0);

  if (totalDescontadoNaOrigem < descontosEsperadosPreFixado - 0.01) {
    return (duplicate.valorJuros || duplicate.valor_juros || 0) > 0;
  }
  return false;
};

export const getTaxaMensal = (duplicata) =>
  toNumber(
    duplicata?.operacao?.tipo_operacao?.taxa_juros ??
      duplicata?.operacao?.tipo_operacao?.taxa_juros_mora ??
      duplicata?.operacao?.taxa_juros ??
      duplicata?.taxaJuros ??
      duplicata?.taxa_juros ??
      0
  );

export const getValorBaseRenegociacao = (duplicata) => {
  const valorBruto = toNumber(duplicata?.valorBruto ?? duplicata?.valor_bruto);
  const valorJuros = toNumber(duplicata?.valorJuros ?? duplicata?.valor_juros);
  return isPostFixedInterest(duplicata?.operacao, duplicata)
    ? valorBruto + valorJuros
    : valorBruto;
};

export const buildRenegociacaoPlano = ({
  duplicatas = [],
  novaDataVencimento,
  quantidadeParcelas = 1,
  datasVencimentoParcelas = [],
  taxaJurosManual = null,
  jurosManual = null,
}) => {
  const selecionadas = Array.isArray(duplicatas) ? duplicatas.filter(Boolean) : [];
  const parcelas = Math.max(1, Number(quantidadeParcelas) || 1);
  const dataBase = novaDataVencimento ? new Date(`${novaDataVencimento}T12:00:00Z`) : null;

  const totalOriginal = selecionadas.reduce(
    (sum, duplicata) => sum + getValorBaseRenegociacao(duplicata),
    0
  );

  const jurosCalculado = selecionadas.reduce((sum, duplicata) => {
    const valorBase = getValorBaseRenegociacao(duplicata);
    const taxaMensal = Number.isFinite(Number(taxaJurosManual))
      ? Number(taxaJurosManual)
      : getTaxaMensal(duplicata);
    const dias = diffDias(duplicata?.dataVencimento ?? duplicata?.data_vencimento, novaDataVencimento);
    return sum + valorBase * (taxaMensal / 100 / 30) * dias;
  }, 0);

  const jurosTotal =
    jurosManual !== null && jurosManual !== undefined && jurosManual !== ""
      ? Number(jurosManual)
      : jurosCalculado;

  const totalRenegociado = totalOriginal + jurosTotal;
  const valorBrutoPorParcela = parcelas > 0 ? totalRenegociado / parcelas : 0;
  const jurosPorParcela = parcelas > 0 ? jurosTotal / parcelas : 0;
  const principalPorParcela = parcelas > 0 ? totalOriginal / parcelas : 0;

  const datasParcelas = Array.isArray(datasVencimentoParcelas)
    ? datasVencimentoParcelas
    : [];

  const parcelasCalculadas = Array.from({ length: parcelas }, (_, index) => {
    const ultima = index === parcelas - 1;
    const principal = ultima
      ? roundMoney(totalOriginal - principalPorParcela * (parcelas - 1))
      : roundMoney(principalPorParcela);
    const juros = ultima
      ? roundMoney(jurosTotal - jurosPorParcela * (parcelas - 1))
      : roundMoney(jurosPorParcela);
    const valorParcela = roundMoney(principal + juros);
    const dataPersonalizada = String(datasParcelas[index] || "").trim();
    const dataVencimento =
      dataPersonalizada || !dataBase
        ? dataPersonalizada || ""
        : addMonths(dataBase, index).toISOString().split("T")[0];

    return {
      numeroParcela: index + 1,
      dataVencimento,
      valorParcela,
      jurosParcela: juros,
      valorPrincipal: principal,
    };
  });

  return {
    totalOriginal: roundMoney(totalOriginal),
    jurosCalculado: roundMoney(jurosCalculado),
    jurosTotal: roundMoney(jurosTotal),
    totalRenegociado: roundMoney(totalRenegociado),
    valorBrutoPorParcela: roundMoney(valorBrutoPorParcela),
    jurosPorParcela: roundMoney(jurosPorParcela),
    principalPorParcela: roundMoney(principalPorParcela),
    parcelasCalculadas,
  };
};
