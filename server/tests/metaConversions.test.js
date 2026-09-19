import test from "node:test";
import assert from "node:assert/strict";
import {
  montarCustomDataCatalogo,
  partirNomeParaHash,
  normalizarTelefoneParaHash,
} from "../services/marketing/metaConversionsService.js";

test("custom_data inclui contents, content_ids, value e currency", () => {
  const { custom, content_ids } = montarCustomDataCatalogo([
    {
      codigo: "618705",
      nome: "Bolo de chocolate",
      preco: 89.9,
      quantidade: 1,
      categoria: "Bolos",
    },
  ]);
  assert.deepEqual(content_ids, ["618705"]);
  assert.equal(custom.content_type, "product");
  assert.equal(custom.currency, "BRL");
  assert.equal(custom.value, 89.9);
  assert.equal(custom.num_items, 1);
  assert.equal(custom.content_name, "Bolo de chocolate");
  assert.equal(custom.content_category, "Bolos");
  assert.deepEqual(custom.contents, [
    { id: "618705", quantity: 1, item_price: 89.9 },
  ]);
});

test("soma value e contents de vários itens", () => {
  const { custom } = montarCustomDataCatalogo([
    { codigo: "1", preco: 10, quantidade: 2 },
    { codigo: "2", preco: 5.5, quantidade: 1 },
  ]);
  assert.equal(custom.value, 25.5);
  assert.equal(custom.num_items, 3);
  assert.equal(custom.contents.length, 2);
  assert.equal(custom.content_name, undefined);
});

test("ignora item sem código e preenche value 0 se sem preço", () => {
  const { custom, content_ids } = montarCustomDataCatalogo([
    { nome: "sem id", preco: 10 },
    { codigo: "99", nome: "Pão" },
  ]);
  assert.deepEqual(content_ids, ["99"]);
  assert.equal(custom.value, 0);
  assert.deepEqual(custom.contents, [{ id: "99", quantity: 1 }]);
});

test("normaliza telefone BR com DDI 55", () => {
  assert.equal(normalizarTelefoneParaHash("(45) 98161-5511"), "5545981615511");
  assert.equal(normalizarTelefoneParaHash("5545981615511"), "5545981615511");
  assert.equal(normalizarTelefoneParaHash("123"), null);
});

test("parte nome para fn/ln sem acento", () => {
  const { fn, ln } = partirNomeParaHash("José da Silva");
  assert.equal(fn, "jose");
  assert.equal(ln, "dasilva");
});
