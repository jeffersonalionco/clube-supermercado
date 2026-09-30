import test from "node:test";
import assert from "node:assert/strict";
import {
  aplicarDescontoClube,
  precoAnteriorDeProdutoErp,
} from "../services/produtosClubeDescontosService.js";
import {
  calcularDescontoWhatsapp,
  montarMensagensOfertas,
} from "../services/marketing/whatsappOfertasService.js";

test("preço anterior só entra quando o item está em oferta", () => {
  assert.equal(
    precoAnteriorDeProdutoErp({
      Oferta: "S",
      PrecoNormal: 13.39,
      PrVendaAnt: 10,
    }),
    13.39
  );

  assert.equal(
    precoAnteriorDeProdutoErp({
      Oferta: "S",
      PrecoNormal: 0,
      PrVendaAnt: 13.39,
    }),
    13.39
  );

  assert.equal(
    precoAnteriorDeProdutoErp({
      Oferta: "N",
      PrecoNormal: 0,
      PrVendaAnt: 64.9,
    }),
    0
  );
});

test("WhatsApp compara preço 1 fora de oferta e preço anterior na oferta", () => {
  const semOferta = calcularDescontoWhatsapp({
    oferta: false,
    preco1: 10,
    preco2: 8,
    precoAnterior: 20,
  });
  assert.equal(semOferta.base, 10);
  assert.equal(semOferta.economia, 2);
  assert.equal(semOferta.percentual, 20);

  const emOferta = calcularDescontoWhatsapp({
    oferta: true,
    preco1: 8.99,
    preco2: 7.99,
    precoAnterior: 13.39,
  });
  assert.equal(emOferta.base, 13.39);
  assert.equal(emOferta.economia, 5.4);
  assert.equal(emOferta.percentual, 40);

  const ofertaSemAnterior = calcularDescontoWhatsapp({
    oferta: true,
    preco1: 8.99,
    preco2: 7.99,
    precoAnterior: 0,
  });
  assert.equal(ofertaSemAnterior.base, 8.99);
  assert.equal(ofertaSemAnterior.economia, 1);
  assert.equal(ofertaSemAnterior.percentual, 11);
});

test("catálogo em cache passa a economia justa sem nova sincronização", () => {
  const item = aplicarDescontoClube({
    codigo: "259039",
    oferta: true,
    preco1: 8.99,
    preco2: 7.99,
    precoAnterior: 13.39,
    economia: 1,
    percentualDesconto: 11.12,
  });
  assert.equal(item.precoDe, 13.39);
  assert.equal(item.economia, 5.4);
  assert.equal(item.percentualDesconto, 40);
  assert.equal(item.preco1, 8.99);
});

test("mensagem do WhatsApp risca o preço anterior na oferta", () => {
  const [mensagem] = montarMensagensOfertas([
    {
      descricao: "Goiaba Kg",
      marca: "Ceasa",
      oferta: true,
      preco1: 8.99,
      preco2: 7.99,
      precoAnterior: 13.39,
      economia: 1,
      percentualDesconto: 11.12,
    },
  ]);

  assert.match(mensagem, /De ~R\$\s*13,39~ por \*R\$\s*7,99\*/);
  assert.match(mensagem, /−40%/);
  assert.match(mensagem, /economize R\$\s*5,40/);
  assert.doesNotMatch(mensagem, /8,99/);
});
