import test from "node:test";
import assert from "node:assert/strict";
import {
  aplicarDescontoClube,
  dataOfertaParaIso,
  normalizarOfertaLoja,
  precoAnteriorDeProdutoErp,
  selecionarOfertasLoja,
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

test("oferta da loja exige data vigente e não entra se tiver preço de Clube", () => {
  const hoje = new Date();
  const fim = new Date(hoje.getTime() + 2 * 24 * 60 * 60 * 1000);
  const dd = String(fim.getDate()).padStart(2, "0");
  const mm = String(fim.getMonth() + 1).padStart(2, "0");
  const data = `${dd}-${mm}-${fim.getFullYear()}`;

  const loja = normalizarOfertaLoja(
    {
      Codigo: "109428",
      Descricao: "Cafe Damasco Trad 500g",
      Oferta: "S",
      DataOferta: data,
      Preco: 23.99,
      PrecoNormal: 31.85,
      PrecoVenda2: 0,
    },
    "001"
  );
  const fimReal = new Date(Date.UTC(fim.getFullYear(), fim.getMonth(), fim.getDate()));
  fimReal.setUTCDate(fimReal.getUTCDate() - 1);
  const ddFim = String(fimReal.getUTCDate()).padStart(2, "0");
  const mmFim = String(fimReal.getUTCMonth() + 1).padStart(2, "0");
  assert.equal(loja.dataOfertaBr, `${ddFim}/${mmFim}`);
  assert.equal(loja.fimOfertaAjustado, true);
  assert.equal(dataOfertaParaIso("04-10-2026"), "2026-10-04");

  const hojeSp = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Sao_Paulo",
  });
  const [anoHoje, mesHoje, diaHoje] = hojeSp.split("-");
  assert.equal(
    normalizarOfertaLoja(
      {
        Codigo: "3",
        Oferta: "S",
        DataOferta: `${diaHoje}-${mesHoje}-${anoHoje}`,
        Preco: 10,
        PrecoNormal: 20,
      },
      "001"
    ),
    null
  );

  assert.equal(
    normalizarOfertaLoja(
      {
        Codigo: "1",
        Oferta: "S",
        DataOferta: "01-01-2020",
        Preco: 10,
        PrecoNormal: 20,
      },
      "001"
    ),
    null
  );

  assert.equal(
    normalizarOfertaLoja(
      {
        Codigo: "2",
        Oferta: "S",
        DataOferta: data,
        Preco: 10,
        PrecoNormal: 20,
        PrecoVenda2: 8,
      },
      "001"
    ),
    null
  );

  const selecionados = selecionarOfertasLoja(
    [loja, { ...loja, codigo: "velho", dataOferta: "2020-01-01", preco2: 0 }],
    8
  );
  assert.deepEqual(selecionados.map((p) => p.codigo), ["109428"]);
});

test("mensagem longa manda o Clube na mensagem seguinte", () => {
  const nome = "Produto com descricao longa para estourar o limite do WhatsApp";
  const loja = Array.from({ length: 25 }, (_, i) => ({
    descricao: `${nome} loja ${i}`,
    preco1: 10,
    precoAnterior: 20,
    dataOfertaBr: "10/10",
  }));
  const clube = Array.from({ length: 25 }, (_, i) => ({
    descricao: `${nome} clube ${i}`,
    preco1: 20,
    preco2: 10,
    economia: 10,
    percentualDesconto: 50,
  }));
  const mensagens = montarMensagensOfertas({ loja, clube });
  assert.equal(mensagens.length, 2);
  assert.match(mensagens[0], /OFERTAS DA LOJA/);
  assert.doesNotMatch(mensagens[0], /PREÇOS DO CLUBE/);
  assert.match(mensagens[0], /mensagem seguinte/);
  assert.match(mensagens[1], /PREÇOS DO CLUBE/);
});

test("mensagem do WhatsApp mostra a loja antes do Clube", () => {
  const [mensagem] = montarMensagensOfertas({
    loja: [
      {
        descricao: "Cafe Damasco Trad 500g",
        preco1: 23.99,
        precoAnterior: 31.85,
        dataOfertaBr: "10/10",
      },
    ],
    clube: [
      {
        descricao: "Carne Suina Costela Com Pele Kg",
        oferta: false,
        preco1: 28.45,
        preco2: 10.99,
        precoAnterior: 0,
        economia: 17.46,
        percentualDesconto: 61,
      },
    ],
  });

  const loja = mensagem.indexOf("OFERTAS DA LOJA");
  const clube = mensagem.indexOf("PREÇOS DO CLUBE");
  assert.ok(loja >= 0 && clube > loja);
  assert.match(mensagem, /Para todo mundo/);
  assert.match(mensagem, /até 10\/10/);
  assert.match(mensagem, /Só com CPF no caixa/);
  assert.match(mensagem, /De ~R\$\s*31,85~ por \*R\$\s*23,99\*/);
});

test("mensagem do WhatsApp marca oferta esgotada", () => {
  const [mensagem] = montarMensagensOfertas([
    {
      descricao: "Carne Suina Costela Com Pele Kg",
      oferta: false,
      preco1: 28.45,
      preco2: 10.99,
      precoAnterior: 0,
      economia: 17.46,
      percentualDesconto: 61,
      esgotado: true,
    },
  ]);

  assert.match(mensagem, /Costela/);
  assert.match(mensagem, /\*ESGOTADO\*/);
  assert.match(mensagem, /10,99/);
});
