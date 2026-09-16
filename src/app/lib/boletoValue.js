const toNumber = (value) => {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
};

export const isBoletoPostFixed = (duplicata) => {
  const operacao = duplicata?.operacao;
  if (!operacao) return false;

  if (typeof operacao.juros_pre_fixado === "boolean") {
    return !operacao.juros_pre_fixado;
  }

  if (typeof operacao.tipo_operacao?.juros_pre_fixado === "boolean") {
    return !operacao.tipo_operacao.juros_pre_fixado;
  }

  // Compatibilidade com operações antigas, criadas antes de a modalidade de
  // juros ser persistida explicitamente na operação/tipo de operação.
  const valorBrutoOperacao = toNumber(operacao.valor_total_bruto);
  const valorLiquidoOperacao = toNumber(operacao.valor_liquido);
  const jurosOperacao = toNumber(operacao.valor_total_juros);
  const descontosOperacao = toNumber(operacao.valor_total_descontos);
  const descontoRealizadoNaOrigem = valorBrutoOperacao - valorLiquidoOperacao;
  const descontoEsperadoPreFixado = jurosOperacao + descontosOperacao;

  if (descontoRealizadoNaOrigem < descontoEsperadoPreFixado - 0.01) {
    return toNumber(duplicata?.valorJuros ?? duplicata?.valor_juros) > 0;
  }

  return false;
};

export const getBoletoValue = (duplicata) => {
  const valorBruto = toNumber(duplicata?.valorBruto ?? duplicata?.valor_bruto);
  const valorJuros = toNumber(duplicata?.valorJuros ?? duplicata?.valor_juros);
  const valor = isBoletoPostFixed(duplicata) ? valorBruto + valorJuros : valorBruto;

  return Math.round((valor + Number.EPSILON) * 100) / 100;
};
