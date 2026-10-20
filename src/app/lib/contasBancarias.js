// Compara a identidade bancaria sem depender do nome de exibicao do banco.
export function getContaIdentity(label) {
  const match = String(label || "").trim().match(/^(.*?)\s+-\s+([\d.-]+)\/([\d.-]+)$/);
  if (!match) return null;
  const bank = match[1].normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const bankKey = /^(itau(?: unibanco(?: s\.?a\.?)?)?|341)$/.test(bank) ? "341" : bank;
  const digits = (value) => value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  return `${bankKey}|${digits(match[2])}|${digits(match[3])}`;
}

export function resolveContaBancaria(label, contas) {
  const identity = getContaIdentity(label);
  if (!identity) return label;
  const matches = contas.filter((conta) => getContaIdentity(conta.contaBancaria) === identity);
  const labels = [...new Set(matches.map((conta) => conta.contaBancaria))];
  return labels.length === 1 ? labels[0] : label;
}
