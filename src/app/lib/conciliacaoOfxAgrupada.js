import { valorLiquidacaoDuplicata } from '../utils/valorLiquidacaoDuplicata.js';

const milissegundosPorDia = 86_400_000;
const limiteSugestoes = 3;
const limiteVisitas = 80_000;

export function ehCobrancaAgrupadaOfx(descricao) {
  return /\bMOV\s+TIT\s+COB\s+DISP/i.test(String(descricao || ''));
}

function buscarSomasExatas(candidatos, total) {
  const somaRestante = new Array(candidatos.length + 1).fill(0);
  for (let i = candidatos.length - 1; i >= 0; i--) {
    somaRestante[i] = somaRestante[i + 1] + candidatos[i].centavos;
  }

  const grupos = [];
  const selecionados = [];
  const pilha = [{ proximo: 0, falta: total }];
  // Limita o trabalho de buscas grandes para manter o modal responsivo.
  for (let visitas = 0; pilha.length && visitas < limiteVisitas && grupos.length < limiteSugestoes; visitas++) {
    const nivel = pilha.at(-1);
    if (somaRestante[nivel.proximo] < nivel.falta) {
      pilha.pop();
      selecionados.pop();
      continue;
    }

    const candidato = candidatos[nivel.proximo++];
    if (candidato.centavos === nivel.falta) {
      grupos.push([...selecionados, candidato]);
    } else if (candidato.centavos < nivel.falta) {
      selecionados.push(candidato);
      pilha.push({ proximo: nivel.proximo, falta: nivel.falta - candidato.centavos });
    }
  }
  return grupos;
}

export function sugerirCobrancasAgrupadasOfx(transacao, duplicatas) {
  const total = Math.round(Number(transacao.valor) * 100);
  const dia = Date.parse(`${String(transacao.data).slice(0, 10)}T00:00:00Z`);
  if (!ehCobrancaAgrupadaOfx(transacao.descricao) || !Number.isSafeInteger(total) || total <= 0 || !Number.isFinite(dia)) {
    return [];
  }

  const candidatos = duplicatas.map((duplicata) => ({
    ...duplicata,
    centavos: Math.round(valorLiquidacaoDuplicata(duplicata) * 100),
    dias: (Date.parse(`${String(duplicata.data_vencimento).slice(0, 10)}T00:00:00Z`) - dia) / milissegundosPorDia,
  })).filter((item) => item.centavos > 0 && item.centavos < total && item.dias >= -40 && item.dias <= 30)
    .sort((a, b) => Math.abs(a.dias) - Math.abs(b.dias) || b.centavos - a.centavos || a.id - b.id);

  let quantidadeAnterior = 0;
  for (const distancia of [0, 3, 7, 40]) {
    const proximos = candidatos.filter((item) => Math.abs(item.dias) <= distancia);
    if (proximos.length === quantidadeAnterior) continue;
    quantidadeAnterior = proximos.length;
    const grupos = buscarSomasExatas(proximos, total);
    if (grupos.length) return grupos;
  }
  return [];
}
