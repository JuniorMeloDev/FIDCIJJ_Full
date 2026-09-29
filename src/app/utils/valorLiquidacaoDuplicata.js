export function valorLiquidacaoDuplicata(duplicata) {
  const operacao = duplicata.operacao || {};
  let posFixado;
  if (typeof operacao.juros_pre_fixado === 'boolean') {
    posFixado = !operacao.juros_pre_fixado;
  } else if (typeof operacao.tipo_operacao?.juros_pre_fixado === 'boolean') {
    posFixado = !operacao.tipo_operacao.juros_pre_fixado;
  } else {
    const descontado = Number(operacao.valor_total_bruto || 0) - Number(operacao.valor_liquido || 0);
    const esperado = Number(operacao.valor_total_juros || 0) + Number(operacao.valor_total_descontos || 0);
    posFixado = descontado < esperado - 0.01 && Number(duplicata.valor_juros || 0) > 0;
  }
  return Number(duplicata.valor_bruto || 0) + (posFixado ? Number(duplicata.valor_juros || 0) : 0);
}
