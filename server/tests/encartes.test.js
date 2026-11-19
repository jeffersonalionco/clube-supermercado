import assert from "node:assert/strict";
import test from "node:test";
import { EFEITOS_ELEMENTOS_ENCARTE, embaralharEfeitosEncarte, ENTRADAS_3D_ENCARTE, ENTRADAS_ENCARTE, normalizarAnimacaoEncarte, TRANSICOES_ENCARTE } from "../../shared/animacaoEncarte.js";
import { CATEGORIAS_ENCARTE, formatosCampanhaValidos, MODELOS_ENCARTE, obterFormatoCampanhaEncarte, obterFormatosCampanhaEncarte, obterModeloEncarte } from "../../shared/modelosEncarte.js";
import { precoAnteriorEncarte, precoAtualEncarte, validadePrecoEncarte } from "../../shared/precosEncarte.js";
import { montarItemEncarte } from "../services/marketing/catalogoEncarteService.js";
import { tipoImagemEncarte } from "../services/marketing/imagensEncarteService.js";

test("modelos de encarte preservam os formatos e a resolução do layout antigo", () => {
  assert.deepEqual(MODELOS_ENCARTE.map(({ largura, altura }) => [largura * 2, altura * 2]), [
    [1080, 1350], [1080, 1920], [1920, 1080], [1920, 1080], [1080, 1350], [1080, 1920],
    [1920, 1080], [1080, 1350], [1080, 1920],
    [1920, 1080], [1080, 1350], [1080, 1920], [1260, 1782], [1260, 1782], [1260, 1782],
    [1920, 1080], [1080, 1350], [1080, 1920],
  ]);
  assert.equal(obterModeloEncarte(undefined).id, "classico");
  assert.equal(obterModeloEncarte("classico").largura * 2, 1200);
});

test("encarte inclui Preço 1 e normaliza código interno sem remover zeros do código de barras", () => {
  const produto = {
    Codigo: "00058", CodigoBarras: "0123456789012", Descricao: "Açúcar",
    Preco: 5.49, UnidadeMedida: "KG",
  };
  assert.deepEqual(montarItemEncarte(produto, "001"), {
    codigo: "58", descricao: "Açúcar", preco: 5.49, tipo: "normal", unidadeMedida: "kg",
    validade: null, codigosBarras: ["0123456789012"],
  });
  assert.equal(montarItemEncarte({ ...produto, PrecoVenda2: 4.99 }, "001").tipo, "clube");
  assert.equal(montarItemEncarte({ ...produto, Ativo: false }, "001"), null);
});

test("upload de encarte lê o tipo real do arquivo e rejeita SVG", () => {
  assert.equal(tipoImagemEncarte(Buffer.from("89504e470d0a1a0a0000000000000000", "hex")), "image/png");
  assert.equal(tipoImagemEncarte(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>")), null);
});

test("encarte aceita o TipoEmbalagem quando o ERP omite a unidade de medida", () => {
  const produto = {
    Codigo: 266876, Descricao: "Condicionador 350ml", Preco: 15.50,
    UnidadeMedida: "", TipoEmbalagem: "UN", Ativo: true,
  };
  assert.equal(montarItemEncarte(produto, "001").unidadeMedida, "un");
  assert.equal(montarItemEncarte({ ...produto, UnidadeMedida: "KG" }, "001").unidadeMedida, "kg");
});

test("as versões de açougue pertencem a um único modelo e mantêm os IDs salvos", () => {
  const categoria = CATEGORIAS_ENCARTE.find(({ id }) => id === "acougue");
  assert.equal(categoria.grupos.length, 1);
  const versoes = categoria.grupos[0].versoes;
  assert.deepEqual(versoes.map(({ id }) => id), ["tv-acougue", "feed-acougue", "stories-acougue"]);
  for (const versao of versoes) assert.equal(obterModeloEncarte(versao.id), versao);
  assert.equal(new Set(MODELOS_ENCARTE.map(({ id }) => id)).size, MODELOS_ENCARTE.length);
});

test("a folha de etiquetas tem medidas físicas A4 e oito posições fixas", () => {
  const modelo = obterModeloEncarte("a4-etiquetas");
  assert.deepEqual([modelo.larguraMm, modelo.alturaMm], [210, 297]);
  assert.equal(modelo.largura / modelo.larguraMm, modelo.altura / modelo.alturaMm);
  assert.equal(modelo.colunas * modelo.linhas, 8);
});

test("Black Friday usa uma coluna e duas etiquetas por A4", () => {
  const modelo = obterModeloEncarte("a4-black-friday-dobro");
  assert.equal(modelo.tema, "etiquetas");
  assert.deepEqual([modelo.colunas, modelo.linhas, modelo.larguraMm, modelo.alturaMm], [1, 2, 210, 297]);
});

test("encarte sugere preço anterior maior que o atual a partir dos dados do ERP", () => {
  const produto = { Codigo: 58, Descricao: "Açúcar", Preco: 9.99, UnidadeMedida: "UN" };
  assert.equal(montarItemEncarte({ ...produto, PrVendaAnt: 12.99 }, "001").precoAnterior, 12.99);
  assert.equal(montarItemEncarte({ ...produto, PrVendaAnt: 8.99 }, "001").precoAnterior, undefined);
  assert.equal(montarItemEncarte({ ...produto, PrecoVenda2: 7.99 }, "001").precoAnterior, 9.99);
  const dataOferta = new Date(Date.now() + 86400000).toLocaleDateString("en-GB", {
    timeZone: "America/Sao_Paulo",
  }).replaceAll("/", "-");
  const oferta = { ...produto, Oferta: "S", DataOferta: dataOferta, PrecoNormal: 13.49, PrVendaAnt: 11.99 };
  assert.equal(montarItemEncarte(oferta, "001").precoAnterior, 13.49);
});

test("encarte permite substituir os preços e ocultar o anterior por produto", () => {
  const erp = { preco: 15, precoAnterior: 20, validade: "2026-11-18" };
  const editado = { ...erp, precoAtualEditado: 25, precoAnteriorEditado: 30 };
  assert.equal(precoAtualEncarte(erp), 15);
  assert.equal(precoAnteriorEncarte(erp), 20);
  assert.equal(validadePrecoEncarte(erp), "2026-11-18");
  assert.equal(precoAtualEncarte(editado), 25);
  assert.equal(precoAnteriorEncarte(editado), 30);
  assert.equal(precoAnteriorEncarte({ ...editado, precoAnteriorEditado: 19.9 }), 19.9);
  assert.equal(precoAnteriorEncarte({ ...editado, precoAnteriorEditado: 25 }), 25);
  assert.equal(precoAnteriorEncarte({ ...editado, precoAnteriorEditado: null }), null);
  assert.equal(precoAnteriorEncarte({ ...editado, mostrarPrecoAnterior: false }), null);
  assert.equal(validadePrecoEncarte(editado), null);
});

test("configuração de vídeo normaliza duração e opções ao salvar o encarte", () => {
  assert.deepEqual(normalizarAnimacaoEncarte({
    ativa: true, entrada: "deslizar", transicao: "inválida",
    segundos: 100, elementos: ["selo", "foto", "foto", "inválido"], repetir: false,
    velocidade: "lenta", velocidadeTransicao: "inválida", efeitoElementos: "pulso",
  }), {
    ativa: true, entrada: "deslizar", transicao: "dissolver",
    segundos: 12, elementos: ["foto", "selo"], repetir: false, semente: 0,
    velocidade: "lenta", velocidadeTransicao: "normal", efeitoElementos: "pulso",
  });
});

test("as novas transições e efeitos dos elementos são preservados ao salvar", () => {
  const transicoes = ["persianas", "circular", "divisao", "diagonal", "mosaico"];
  const efeitos = ["elastico", "giro", "varrer", "brilho", "deslizar"];

  for (const transicao of transicoes) {
    assert.ok(TRANSICOES_ENCARTE.some(([id]) => id === transicao));
    assert.equal(normalizarAnimacaoEncarte({ transicao }).transicao, transicao);
  }
  for (const efeitoElementos of efeitos) {
    assert.ok(EFEITOS_ELEMENTOS_ENCARTE.some(([id]) => id === efeitoElementos));
    assert.equal(normalizarAnimacaoEncarte({ efeitoElementos }).efeitoElementos, efeitoElementos);
  }
});

test("o sorteio é repetível por semente e oferece as três entradas 3D", () => {
  const config = normalizarAnimacaoEncarte({
    entrada: "aleatorio", efeitoElementos: "aleatorio", transicao: "aleatorio", semente: 123,
  });
  assert.equal(config.entrada, "aleatorio");
  assert.equal(config.efeitoElementos, "aleatorio");
  assert.equal(config.transicao, "aleatorio");
  assert.equal(config.semente, 123);
  assert.equal(normalizarAnimacaoEncarte({ semente: 0x100000000 }).semente, 0);

  const efeitos = embaralharEfeitosEncarte(ENTRADAS_ENCARTE, config.semente, "nenhuma");
  assert.deepEqual(efeitos, embaralharEfeitosEncarte(ENTRADAS_ENCARTE, config.semente, "nenhuma"));
  assert.notDeepEqual(efeitos, embaralharEfeitosEncarte(ENTRADAS_ENCARTE, 456, "nenhuma"));
  assert.equal(new Set(efeitos).size, efeitos.length);
  assert.ok(!efeitos.includes("aleatorio") && !efeitos.includes("nenhuma"));
  assert.ok(ENTRADAS_3D_ENCARTE.every((id) => efeitos.includes(id) && normalizarAnimacaoEncarte({ entrada: id }).entrada === id));
});

test("campanhas vinculam formatos do mesmo modelo e leem o histórico de formato único", () => {
  const dados = { modelo: "tv-acougue", formatos: ["feed-acougue", "tv-acougue", "stories-acougue"] };
  assert.ok(formatosCampanhaValidos(dados.modelo, dados.formatos));
  assert.deepEqual(obterFormatosCampanhaEncarte(dados).map(({ id }) => id), ["tv-acougue", "feed-acougue", "stories-acougue"]);
  assert.equal(obterFormatoCampanhaEncarte(dados, "stories-acougue").altura * 2, 1920);
  assert.equal(obterFormatoCampanhaEncarte(dados, "feed"), undefined);
  assert.deepEqual(obterFormatosCampanhaEncarte({ modelo: "feed" }).map(({ id }) => id), ["feed"]);
  assert.equal(obterFormatoCampanhaEncarte({}, "classico").id, "classico");
  for (const invalidos of [null, [], ["feed-acougue"], ["tv-acougue", "tv-acougue"], ["tv-acougue", "feed"], ["tv-acougue", "a", "b", "c", "d"]]) {
    assert.equal(formatosCampanhaValidos(dados.modelo, invalidos), false);
  }
});

test("modelos de ofertas vinculam três formatos com seis produtos por página", () => {
  for (const grupo of ["black-friday", "terca-hortifruti", "quinta-limpeza"]) {
    const dados = { modelo: `tv-${grupo}`, formatos: [`tv-${grupo}`, `feed-${grupo}`, `stories-${grupo}`] };
    assert.ok(formatosCampanhaValidos(dados.modelo, dados.formatos));
    const [tv, feed, stories] = obterFormatosCampanhaEncarte(dados);
    assert.deepEqual([tv, feed, stories].map(({ colunas, linhas }) => [colunas, linhas]), [[3, 2], [2, 3], [2, 3]]);
    assert.ok([tv, feed, stories].every((modelo) => modelo.permitePrecoAnterior && modelo.permiteLimite));
    assert.equal(formatosCampanhaValidos(dados.modelo, [...dados.formatos, "a4-black-friday-dobro"]), false);
  }
  assert.equal(obterModeloEncarte("a4-black-friday-dobro").permiteLimite, undefined);
  assert.equal(formatosCampanhaValidos("tv-terca-hortifruti", ["tv-terca-hortifruti", "feed-black-friday"]), false);
});
