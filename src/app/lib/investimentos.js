import jwt from "jsonwebtoken";

export function ensureAuthenticated(request) {
  const token = request.headers.get("Authorization")?.split(" ")[1];
  if (!token) {
    throw new Error("Não autorizado");
  }

  return jwt.verify(token, process.env.JWT_SECRET);
}

export function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function roundMoney(value) {
  return Math.round((toNumber(value) + Number.EPSILON) * 100) / 100;
}

export function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

export function getStartOfMonthKey(dateKey) {
  return `${dateKey.slice(0, 7)}-01`;
}

export function getMonthKey(dateKey) {
  return dateKey.slice(0, 7);
}

export function getMonthLabel(monthKey) {
  const [year, month] = monthKey.split("-");
  const labels = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${labels[Number(month) - 1]}/${year.slice(2)}`;
}

export function compareDateKeys(a, b) {
  return new Date(`${a}T00:00:00`).getTime() - new Date(`${b}T00:00:00`).getTime();
}

export function addDays(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function eachDateKey(startKey, endKey) {
  const keys = [];
  let current = startKey;

  while (compareDateKeys(current, endKey) <= 0) {
    keys.push(current);
    current = addDays(current, 1);
  }

  return keys;
}

export function getDaysInMonth(dateKey) {
  const [year, month] = dateKey.split("-").map(Number);
  return new Date(year, month, 0).getDate();
}

export function getBusinessDaysInMonth(dateKey) {
  const [year, month] = dateKey.split("-").map(Number);
  const totalDays = new Date(year, month, 0).getDate();
  let businessDays = 0;

  for (let day = 1; day <= totalDays; day += 1) {
    const current = new Date(year, month - 1, day);
    const weekDay = current.getDay();
    if (weekDay !== 0 && weekDay !== 6) {
      businessDays += 1;
    }
  }

  return businessDays || 1;
}

export function getContaLabel(conta) {
  return [conta?.nome, conta?.banco && conta?.agencia && conta?.conta ? `${conta.banco} - ${conta.agencia}/${conta.conta}` : conta?.banco]
    .filter(Boolean)
    .join(" | ");
}

export function getAplicacaoDailyRate(aplicacao, dateKey) {
  if (!aplicacao?.rende_juros) {
    return 0;
  }

  const percentualMensal = toNumber(aplicacao.percentual_juros_mensal);
  if (percentualMensal <= 0) {
    return 0;
  }

  const divisor =
    aplicacao.base_dias === "uteis"
      ? getBusinessDaysInMonth(dateKey)
      : getDaysInMonth(dateKey);

  return percentualMensal / 100 / divisor;
}

function buildMonthlySeries(monthlyYields) {
  const currentMonth = getMonthKey(getTodayKey());
  const months = [];
  let pointer = currentMonth;

  for (let i = 0; i < 6; i += 1) {
    months.unshift(pointer);
    const [year, month] = pointer.split("-").map(Number);
    const previous = new Date(year, month - 2, 1);
    pointer = previous.toISOString().slice(0, 7);
  }

  return months.map((monthKey) => ({
    mes: getMonthLabel(monthKey),
    valor: roundMoney(monthlyYields.get(monthKey) || 0),
  }));
}

export function buildInvestmentDashboard({
  contas,
  aplicacoes,
  movimentacoes,
  dataInicio,
  dataFim,
  tipo,
}) {
  const contasMap = new Map(contas.map((conta) => [conta.id, conta]));
  const monthlyYields = new Map();
  const rows = [];
  const matchesSelectedType = (movimento) => {
    if (!tipo) return true;
    if (tipo === "transferencia") return movimento.origem === "transferencia";
    if (movimento.origem === "transferencia") return false;
    return tipo === movimento.tipo;
  };

  const cardsAplicacoes = aplicacoes.map((aplicacao) => {
    const movimentosAplicacao = movimentacoes
      .filter((item) => item.aplicacao_id === aplicacao.id)
      .sort((a, b) => {
        const byDate = compareDateKeys(a.data_movimento, b.data_movimento);
        if (byDate !== 0) return byDate;
        return a.id - b.id;
      });

    if (movimentosAplicacao.length === 0) {
      return {
        ...aplicacao,
        contaLabel: getContaLabel(contasMap.get(aplicacao.conta_id)),
        saldoAtual: 0,
        rendimentoPeriodo: 0,
        rentabilidadeDiariaEstimada: 0,
      };
    }

    const movementsByDate = new Map();
    for (const movimento of movimentosAplicacao) {
      if (!movementsByDate.has(movimento.data_movimento)) {
        movementsByDate.set(movimento.data_movimento, []);
      }
      movementsByDate.get(movimento.data_movimento).push(movimento);
    }

    const firstDate = movimentosAplicacao[0].data_movimento;
    const timeline = eachDateKey(firstDate, dataFim);
    let saldoAtual = 0;
    let rendimentoPeriodo = 0;

    for (const dateKey of timeline) {
      const saldoAbertura = saldoAtual;
      const dailyRate = getAplicacaoDailyRate(aplicacao, dateKey);
      const rendimentoDiario =
        saldoAbertura > 0 ? roundMoney(saldoAbertura * dailyRate) : 0;

      if (rendimentoDiario !== 0) {
        const monthKey = getMonthKey(dateKey);
        monthlyYields.set(
          monthKey,
          roundMoney((monthlyYields.get(monthKey) || 0) + rendimentoDiario)
        );
      }

      if (
        rendimentoDiario !== 0 &&
        compareDateKeys(dateKey, dataInicio) >= 0 &&
        compareDateKeys(dateKey, dataFim) <= 0 &&
        (!tipo || tipo === "rentabilidade_diaria")
      ) {
        rows.push({
          id: `yield-${aplicacao.id}-${dateKey}`,
          data_movimento: dateKey,
          tipo: "rentabilidade_diaria",
          descricao: `Rentabilidade diária - ${aplicacao.nome}`,
          valor: rendimentoDiario,
          origem: "calculada",
          aplicacao_id: aplicacao.id,
          aplicacao_nome: aplicacao.nome,
          conta_id: aplicacao.conta_id,
          conta_nome: getContaLabel(contasMap.get(aplicacao.conta_id)),
        });
      }

      saldoAtual = roundMoney(saldoAtual + rendimentoDiario);

      if (
        rendimentoDiario !== 0 &&
        compareDateKeys(dateKey, dataInicio) >= 0 &&
        compareDateKeys(dateKey, dataFim) <= 0
      ) {
        rendimentoPeriodo = roundMoney(rendimentoPeriodo + rendimentoDiario);
      }

      const movimentosDia = movementsByDate.get(dateKey) || [];
      for (const movimento of movimentosDia) {
        saldoAtual = roundMoney(saldoAtual + toNumber(movimento.valor));

        if (
          compareDateKeys(dateKey, dataInicio) >= 0 &&
          compareDateKeys(dateKey, dataFim) <= 0 &&
          matchesSelectedType(movimento)
        ) {
          rows.push({
            ...movimento,
            aplicacao_nome: aplicacao.nome,
            conta_nome: getContaLabel(contasMap.get(aplicacao.conta_id)),
          });
        }
      }
    }

    return {
      ...aplicacao,
      contaLabel: getContaLabel(contasMap.get(aplicacao.conta_id)),
      saldoAtual,
      rendimentoPeriodo,
      rentabilidadeDiariaEstimada: roundMoney(
        saldoAtual * getAplicacaoDailyRate(aplicacao, dataFim)
      ),
    };
  });

  const contaCards = contas.map((conta) => {
    const aplicacoesConta = cardsAplicacoes.filter(
      (aplicacao) => aplicacao.conta_id === conta.id
    );

    return {
      ...conta,
      saldoAtual: roundMoney(
        aplicacoesConta.reduce((acc, item) => acc + item.saldoAtual, 0)
      ),
      quantidadeAplicacoes: aplicacoesConta.length,
    };
  });

  rows.sort((a, b) => {
    const byDate = compareDateKeys(b.data_movimento, a.data_movimento);
    if (byDate !== 0) return byDate;
    return String(a.tipo).localeCompare(String(b.tipo));
  });

  const movimentacoesAteDataFim = movimentacoes.filter(
    (item) => compareDateKeys(item.data_movimento, dataFim) <= 0
  );

  const movimentacoesPeriodo = movimentacoesAteDataFim.filter(
    (item) =>
      compareDateKeys(item.data_movimento, dataInicio) >= 0 &&
      compareDateKeys(item.data_movimento, dataFim) <= 0
  );

  const patrimonioInvestido = roundMoney(
    movimentacoesAteDataFim
      .filter((item) => item.tipo === "aporte" && item.origem !== "transferencia")
      .reduce((acc, item) => acc + Math.abs(toNumber(item.valor)), 0)
  );

  const saldoDisponivel = roundMoney(
    contaCards.reduce((acc, item) => acc + item.saldoAtual, 0)
  );

  const rendimentoPeriodoCalculado = roundMoney(
    cardsAplicacoes.reduce((acc, item) => acc + item.rendimentoPeriodo, 0)
  );

  const rendimentoManualPeriodo = roundMoney(
    movimentacoesPeriodo
      .filter((item) => item.tipo === "rendimento_manual")
      .reduce((acc, item) => acc + toNumber(item.valor), 0)
  );

  const aportesPeriodo = roundMoney(
    movimentacoesPeriodo
      .filter((item) => item.tipo === "aporte" && item.origem !== "transferencia")
      .reduce((acc, item) => acc + Math.abs(toNumber(item.valor)), 0)
  );

  const cards = {
    patrimonioInvestido,
    saldoDisponivel,
    rendimentoPeriodo: roundMoney(rendimentoPeriodoCalculado + rendimentoManualPeriodo),
    aportesPeriodo,
    aplicacoesAtivas: cardsAplicacoes.filter((item) => item.ativa).length,
  };

  return {
    cards,
    contas: contaCards,
    aplicacoes: cardsAplicacoes,
    movimentacoes: rows,
    evolucao: buildMonthlySeries(monthlyYields),
  };
}
