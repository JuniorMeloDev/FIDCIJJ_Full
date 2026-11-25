import {
  consultarExtratoItau,
  getItauExtratoAccessToken,
  normalizeItauAgencia,
  normalizeItauConta,
  normalizeItauDac,
} from './itauExtratoService.js';

const digitos = (valor) => String(valor ?? '').replace(/\D/g, '');

export function encontrarPixItauEfetivado(extrato, { data, centavos, documento }) {
  const docCedente = digitos(documento);
  if (![11, 14].includes(docCedente.length)) return [];

  const eventos = (extrato?.data || []).flatMap((item) => item.events || []);
  return [...new Map(eventos.filter((evento) =>
    evento.id && evento.type === 'lancamento' && evento.operation === 'D'
    && evento.reversal === false && evento.date?.accounting === data
    && evento.amount?.currency === 'BRL' && Math.round(evento.amount?.value * 100) === -centavos
    && /\bPIX\b/i.test(evento.literal?.shortened || '')
    && digitos(evento.counterpart?.document) === docCedente
  ).map((evento) => [evento.id, evento])).values()];
}

export async function consultarPixItauEfetivado({ conta, data, centavos, documento }) {
  const agencia = normalizeItauAgencia(conta.agencia);
  const numero = normalizeItauConta(conta.conta_corrente);
  const dac = normalizeItauDac(conta.conta_corrente);
  const contaPix = process.env.ITAU_PIX_CONTA_REAL;
  if (!/ita[uú]/i.test(conta.banco) || !contaPix || !agencia || !numero || !dac
    || numero !== normalizeItauConta(contaPix) || dac !== normalizeItauDac(contaPix)) {
    throw new Error('Selecione a conta do Itaú usada para fazer o PIX.');
  }

  const token = await getItauExtratoAccessToken();
  const extrato = await consultarExtratoItau(token.access_token, {
    agencia, conta: numero, dac, dataInicio: data, dataFim: data,
    type: process.env.ITAU_EXTRATO_TYPE || 'all',
  });
  return encontrarPixItauEfetivado(extrato, { data, centavos, documento });
}
