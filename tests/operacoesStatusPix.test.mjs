import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import jwt from "jsonwebtoken";

const rootDir = process.cwd();
const srcDir = path.join(rootDir, "src");

// Estado fictício compartilhado entre os mocks
const mockState = {
  operacao: null,
  duplicatas: [],
  contaMaster: null,
  contasCliente: [],
  contaRealItau: { agencia: "1234", conta_corrente: "56789-0" },
  dadosPagador: { cnpj: "11222333000181" },
  extratoEventos: [],
  consultarPixCalls: [],
  enviarPixItauCalls: [],
  enviarPixInterCalls: [],
  movimentacoesInseridas: [],
  operacoesAtualizadas: [],
  pixItauShouldFail: false,
};

function resetMockState() {
  mockState.operacao = {
    id: 999,
    status: "Pendente",
    valor_liquido: 1000.5,
    valor_total_descontos: 0,
    cliente: {
      id: 10,
      nome: "PERNAMBUCO NUTRICAO ANIMAL LTDA",
      email: "financeiro@cliente.test",
      ramo_de_atividade: "Indústria",
      cnpj: "12345678000195",
    },
  };
  mockState.duplicatas = [
    { nf_cte: "4532.1", sacado_id: 1, cliente_sacado: "SACADO TESTE" },
  ];
  mockState.contaMaster = {
    id: 1,
    banco: "Banco Itaú",
    agencia: "1234",
    conta_corrente: "56789-0",
  };
  mockState.contasCliente = [
    {
      id: 50,
      cliente_id: 10,
      banco: "Banco do Brasil",
      chave_pix: "12345678000195",
      tipo_chave_pix: "CNPJ",
    },
  ];
  mockState.extratoEventos = [];
  mockState.consultarPixCalls = [];
  mockState.enviarPixItauCalls = [];
  mockState.enviarPixInterCalls = [];
  mockState.movimentacoesInseridas = [];
  mockState.operacoesAtualizadas = [];
  mockState.pixItauShouldFail = false;
}

function createSupabaseMock() {
  return {
    from(table) {
      const ctx = { table, filters: {}, action: "select", payload: null };
      const chain = {
        select() {
          return chain;
        },
        insert(data) {
          ctx.action = "insert";
          ctx.payload = data;
          if (table === "movimentacoes_caixa") {
            mockState.movimentacoesInseridas.push(data);
          }
          return Promise.resolve({ data, error: null });
        },
        update(data) {
          ctx.action = "update";
          ctx.payload = data;
          if (table === "operacoes") {
            mockState.operacoesAtualizadas.push(data);
          }
          return chain;
        },
        delete() {
          ctx.action = "delete";
          return chain;
        },
        eq(col, val) {
          ctx.filters[col] = val;
          return chain;
        },
        in() {
          return chain;
        },
        limit() {
          return Promise.resolve({ data: [], error: null });
        },
        maybeSingle() {
          return Promise.resolve({ data: null, error: null });
        },
        single() {
          if (table === "operacoes") {
            return Promise.resolve({ data: mockState.operacao, error: null });
          }
          if (table === "contas_bancarias") {
            if (ctx.filters.conta_corrente) {
              return Promise.resolve({ data: mockState.contaRealItau, error: null });
            }
            return Promise.resolve({ data: mockState.contaMaster, error: null });
          }
          if (table === "clientes") {
            return Promise.resolve({ data: mockState.dadosPagador, error: null });
          }
          if (table === "users") {
            return Promise.resolve({ data: { id: "user-uuid-1" }, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
        then(resolve) {
          if (table === "duplicatas" && ctx.action === "select") {
            return resolve({ data: mockState.duplicatas, error: null });
          }
          if (table === "contas_bancarias" && ctx.action === "select") {
            return resolve({ data: mockState.contasCliente, error: null });
          }
          return resolve({ data: [], error: null });
        },
      };
      return chain;
    },
  };
}

globalThis.__PIX_STATUS_TEST_MOCKS__ = {
  createSupabaseMock,
  mockState,
};

const virtualSources = {
  "mock:next/server": `
    export const NextResponse = {
      json(body, init = {}) {
        return {
          status: init.status ?? 200,
          async json() { return body; },
        };
      },
    };
  `,
  "mock:supabaseClient": `
    export const supabase = globalThis.__PIX_STATUS_TEST_MOCKS__.createSupabaseMock();
  `,
  "mock:emailService": `
    export async function sendOperationStatusEmail() { return { ok: true }; }
  `,
  "mock:interService": `
    const state = globalThis.__PIX_STATUS_TEST_MOCKS__.mockState;
    export async function getInterAccessToken() { return { access_token: "inter-token-fake" }; }
    export async function enviarPixInter(token, dadosPix, contaCorrente) {
      state.enviarPixInterCalls.push({ token, dadosPix, contaCorrente });
      return { transacaoPix: { endToEnd: "E2E-INTER-123" } };
    }
  `,
  "mock:itauService": `
    const state = globalThis.__PIX_STATUS_TEST_MOCKS__.mockState;
    export async function getItauAccessToken() { return { access_token: "itau-token-fake" }; }
    export async function enviarPixItau(token, dadosPixItau) {
      state.enviarPixItauCalls.push({ token, dadosPixItau });
      if (state.pixItauShouldFail) {
        const err = new Error("Timeout simulado");
        err.code = "PIX_ITAU_INDEFINIDO";
        throw err;
      }
      return { end_to_end_id: "E2E-ITAU-456" };
    }
  `,
  "mock:pixItauExtrato": `
    const state = globalThis.__PIX_STATUS_TEST_MOCKS__.mockState;
    export async function consultarPixItauEfetivado(params) {
      state.consultarPixCalls.push(params);
      return state.extratoEventos;
    }
  `,
  "mock:duplicataGuard": `
    export function findRepeatedDuplicatas() { return []; }
    export function formatDuplicataConflictMessage() { return ""; }
    export async function queryDuplicatasByEntries() { return []; }
  `,
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return { url: "mock:next/server", shortCircuit: true };
    if (specifier === "@/app/utils/supabaseClient") return { url: "mock:supabaseClient", shortCircuit: true };
    if (specifier === "@/app/lib/emailService") return { url: "mock:emailService", shortCircuit: true };
    if (specifier === "@/app/lib/interService") return { url: "mock:interService", shortCircuit: true };
    if (specifier === "@/app/lib/itauService") return { url: "mock:itauService", shortCircuit: true };
    if (specifier === "@/app/lib/pixItauExtrato") return { url: "mock:pixItauExtrato", shortCircuit: true };
    if (specifier === "@/app/lib/duplicataGuard") return { url: "mock:duplicataGuard", shortCircuit: true };
    if (specifier.startsWith("@/")) {
      const resolvedPath = path.join(srcDir, specifier.slice(2));
      return nextResolve(pathToFileURL(resolvedPath).href, context);
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (virtualSources[url]) {
      return { format: "module", source: virtualSources[url], shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});

process.env.JWT_SECRET = "segredo-de-teste";
process.env.ITAU_PIX_CONTA_REAL = "56789-0";
process.env.ITAU_PIX_CLIENTE_ID_REAL = "1";

const { PUT } = await import("../src/app/api/operacoes/[id]/status/route.js");

function makeRequest(body) {
  const token = jwt.sign({ user_id: "admin-1", roles: ["ROLE_ADMIN"] }, process.env.JWT_SECRET);
  return {
    headers: {
      get(name) {
        return name.toLowerCase() === "authorization" ? `Bearer ${token}` : null;
      },
    },
    async json() {
      return body;
    },
  };
}

test("aprova operação com PIX Itaú sem erro de format ou valorDebitadoCentavos", async () => {
  resetMockState();
  const res = await PUT(
    makeRequest({
      status: "Aprovada",
      conta_bancaria_id: 1,
      efetuar_pix: true,
      pix_account_id: 50,
    }),
    { params: Promise.resolve({ id: "999" }) }
  );
  const data = await res.json();

  assert.equal(res.status, 200);
  assert.equal(data.transactionId, "E2E-ITAU-456");
  assert.equal(mockState.consultarPixCalls.length, 1);
  assert.equal(mockState.consultarPixCalls[0].centavos, 100050);
  assert.match(mockState.consultarPixCalls[0].data, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(mockState.enviarPixItauCalls.length, 1);
  assert.equal(mockState.enviarPixItauCalls[0].dadosPixItau.valor_pagamento, "1000.50");
  assert.equal(mockState.movimentacoesInseridas.length, 1);
  assert.equal(mockState.operacoesAtualizadas[0].status, "Aprovada");
});

test("reaproveita PIX Itaú encontrado no extrato usando valorDebitadoCentavos após falha indefinida", async () => {
  resetMockState();
  mockState.pixItauShouldFail = true;
  let chamadasExtrato = 0;
  mockState.extratoEventos = [];

  // Na segunda consulta ao extrato (após falha do envio), simula o PIX já efetivado
  const originalConsultar = globalThis.__PIX_STATUS_TEST_MOCKS__.mockState;
  const origPush = originalConsultar.consultarPixCalls.push.bind(originalConsultar.consultarPixCalls);
  originalConsultar.consultarPixCalls.push = (params) => {
    chamadasExtrato += 1;
    if (chamadasExtrato === 2) {
      mockState.extratoEventos = [{ id: "E2E-ITAU-EXTRATO-789" }];
    }
    return origPush(params);
  };

  const res = await PUT(
    makeRequest({
      status: "Aprovada",
      conta_bancaria_id: 1,
      efetuar_pix: true,
      valor_debito_parcial: 500.25,
    }),
    { params: Promise.resolve({ id: "999" }) }
  );
  const data = await res.json();

  assert.equal(res.status, 200);
  assert.equal(data.transactionId, "E2E-ITAU-EXTRATO-789");
  assert.equal(mockState.consultarPixCalls.length, 2);
  assert.equal(mockState.consultarPixCalls[0].centavos, 50025);
  assert.equal(mockState.consultarPixCalls[1].centavos, 50025);
});

test("aprova operação com PIX Banco Inter usando data formatada corretamente", async () => {
  resetMockState();
  mockState.contaMaster = {
    id: 2,
    banco: "Banco Inter",
    agencia: "0001",
    conta_corrente: "1234567",
  };

  const res = await PUT(
    makeRequest({
      status: "Aprovada",
      conta_bancaria_id: 2,
      efetuar_pix: true,
    }),
    { params: Promise.resolve({ id: "999" }) }
  );
  const data = await res.json();

  assert.equal(res.status, 200);
  assert.equal(data.transactionId, "E2E-INTER-123");
  assert.equal(mockState.enviarPixInterCalls.length, 1);
  assert.equal(mockState.enviarPixInterCalls[0].dadosPix.valor, 1000.5);
  assert.match(mockState.enviarPixInterCalls[0].dadosPix.dataPagamento, /^\d{4}-\d{2}-\d{2}$/);
});
