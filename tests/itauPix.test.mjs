import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import https from "node:https";
import test from "node:test";
import { enviarPixItau } from "../src/app/lib/itauService.js";

process.env.ITAU_CERTIFICATE = "certificado-de-teste";
process.env.ITAU_PRIVATE_KEY = "chave-de-teste";

const pagamento = { cod_pagamento: "pagamento-123", recebedor: { nome: "Favorecido" } };

function simularSispag(context, respostas) {
  const chamadas = [];
  context.mock.method(https, "request", (url, options, callback) => {
    chamadas.push([options.method, new URL(url).pathname]);
    const resposta = respostas.shift();
    assert.ok(resposta, "Cada chamada deve ter uma resposta simulada.");
    const req = new EventEmitter();
    req.end = () => {
      queueMicrotask(() => {
        const res = new EventEmitter();
        res.statusCode = resposta.http ?? 200;
        callback(res);
        res.emit("data", JSON.stringify(resposta.body));
        res.emit("end");
      });
    };
    return req;
  });
  return chamadas;
}

test("aceita PIX efetivado na resposta do envio, com o código e dados do favorecido", async (context) => {
  const chamadas = simularSispag(context, [
    { http: 201, body: { data: { ...pagamento, status_pagamento: " EFETUADO " } } },
  ]);

  const resultado = await enviarPixItau("token", {});

  assert.equal(resultado.cod_pagamento, pagamento.cod_pagamento);
  assert.deepEqual(resultado.recebedor, pagamento.recebedor);
  assert.deepEqual(chamadas, [["POST", "/sispag/v1/transferencias"]]);
});

test("confirma a efetivação do pagamento incluído sem repetir o envio", async (context) => {
  const chamadas = simularSispag(context, [
    { body: { ...pagamento, status_pagamento: "INCLUÍDO" } },
    { body: { data: { dados_pagamento: { id_pagamento: pagamento.cod_pagamento, status: "Efetuado" } } } },
  ]);

  const resultado = await enviarPixItau("token", {});

  assert.equal(resultado.status_pagamento, "Efetuado");
  assert.equal(resultado.cod_pagamento, pagamento.cod_pagamento);
  assert.deepEqual(chamadas, [
    ["POST", "/sispag/v1/transferencias"],
    ["GET", "/sispag/v1/pagamentos_sispag/pagamento-123"],
  ]);
});

test("preserva o motivo da recusa informada pelo Itaú", async (context) => {
  const chamadas = simularSispag(context, [
    { body: { status_pagamento: "Não efetuado", motivo_recusa: [{ nome: "Saldo insuficiente" }] } },
  ]);

  await assert.rejects(enviarPixItau("token", {}), /PIX rejeitado pelo Itaú: Saldo insuficiente/);
  assert.equal(chamadas.length, 1);
});

test("sinaliza resultado indefinido quando a consulta falha", async (context) => {
  const chamadas = simularSispag(context, [
    { body: { ...pagamento, status_pagamento: "INCLUÍDO" } },
    { http: 503, body: {} },
  ]);

  await assert.rejects(enviarPixItau("token", {}), /ainda não confirmou.*pagamento-123.*Confira o pagamento/);
  assert.deepEqual(chamadas.map(([metodo]) => metodo), ["POST", "GET"]);
});
