import test from "node:test";
import assert from "node:assert/strict";
import {
  podeTransicionarStatus,
  TRANSICOES_PEDIDO,
  MOTIVOS_CANCELAMENTO_LABEL,
} from "../services/padariaPedidosService.js";

test("máquina de estados: transições válidas", () => {
  assert.equal(podeTransicionarStatus("novo", "em_producao"), true);
  assert.equal(podeTransicionarStatus("novo", "cancelado"), true);
  assert.equal(podeTransicionarStatus("em_producao", "pronto"), true);
  assert.equal(podeTransicionarStatus("em_producao", "cancelado"), true);
  assert.equal(podeTransicionarStatus("pronto", "entregue"), true);
});

test("máquina de estados: rejeita regressões e finais", () => {
  assert.equal(podeTransicionarStatus("entregue", "em_producao"), false);
  assert.equal(podeTransicionarStatus("entregue", "cancelado"), false);
  assert.equal(podeTransicionarStatus("cancelado", "pronto"), false);
  assert.equal(podeTransicionarStatus("cancelado", "entregue"), false);
  assert.equal(podeTransicionarStatus("pronto", "em_producao"), false);
  assert.equal(podeTransicionarStatus("pronto", "cancelado"), false);
  assert.equal(podeTransicionarStatus("novo", "entregue"), false);
});

test("todas as chaves de status possuem lista de transição", () => {
  for (const status of [
    "novo",
    "em_producao",
    "pronto",
    "entregue",
    "cancelado",
  ]) {
    assert.ok(Array.isArray(TRANSICOES_PEDIDO[status]));
  }
});

test("motivos de cancelamento cobrem o fluxo operacional", () => {
  for (const chave of [
    "cliente_desistiu",
    "erro_pedido",
    "falta_ingrediente",
    "problema_operacional",
    "outro",
  ]) {
    assert.ok(MOTIVOS_CANCELAMENTO_LABEL[chave]);
  }
});
