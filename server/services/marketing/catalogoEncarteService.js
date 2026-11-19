import { listarProdutosUnidadePagina } from "../apiClient.js";
import { consultarCacheOfertasClube, diaSpIso, normalizarOfertaLoja, normalizarProduto } from "../produtosClubeDescontosService.js";

const catalogos = new Map();
const TTL = 15 * 60 * 1000;
const LIMITE_UNIDADES = 4;
const LIMITE_PAGINAS = 600;

export function codigoEncarte(valor) {
  const codigo = String(valor ?? "").trim();
  return /^\d{1,32}$/.test(codigo) ? codigo.replace(/^0+(?=\d)/, "") : "";
}

function textoBusca(valor) {
  return valor.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function codigosBarras(produto) {
  return [...new Set(
    [produto.CodigoBarras, produto.CodigoBarra, produto.EAN, produto.GTIN,
      ...(Array.isArray(produto.CodigosBarras) ? produto.CodigosBarras : [])]
      .flatMap((valor) => String(valor?.CodigoBarras ?? valor?.CodigoBarra ?? valor?.Codigo ?? valor ?? "").split(/[,;\s]+/))
      .filter((codigo) => /^\d+$/.test(codigo))
  )];
}

export function montarItemEncarte(produto, unidade) {
  const base = normalizarProduto(produto, unidade);
  const codigo = codigoEncarte(base.codigo);
  const descricao = base.descricao.slice(0, 120);
  const unidadeMedida = [produto.UnidadeMedida, produto.unidadeMedida, produto.TipoEmbalagem]
    .map((valor) => String(valor ?? "").trim().slice(0, 12).toLowerCase())
    .find(Boolean);
  if (!base.ativo || !codigo || !descricao || !unidadeMedida) return null;

  const oferta = normalizarOfertaLoja(produto, unidade);
  const tipo = base.preco2 > 0 && base.economia > 0 ? "clube" : oferta ? "loja" : "normal";
  const preco = tipo === "clube" ? base.preco2 : base.preco1;
  if (!Number.isFinite(preco) || preco <= 0) return null;
  const baseAnterior = tipo === "clube" ? base.precoDe : oferta?.precoAnterior ?? produto.PrVendaAnt;
  const precoAnterior = Math.round(Number(baseAnterior) * 100) / 100;
  return {
    codigo, descricao, preco, tipo, unidadeMedida,
    ...(Number.isFinite(precoAnterior) && precoAnterior > preco ? { precoAnterior } : {}),
    validade: oferta?.dataOferta ?? null,
    codigosBarras: codigosBarras(produto),
  };
}

async function indexar(unidade, estado) {
  let cursor = 0;
  for (let i = 0; i < LIMITE_PAGINAS; i += 1) {
    const pagina = await listarProdutosUnidadePagina(cursor, unidade, { apenasAtivos: true });
    if (!pagina.ok) throw new Error("Falha na listagem de produtos do ERP.");
    if (!pagina.produtos.length) return;

    for (const bruto of pagina.produtos) {
      const item = montarItemEncarte(bruto, unidade);
      if (item) estado.itens.set(item.codigo, item);
    }
    const ultimo = Number(pagina.produtos.at(-1)?.Codigo);
    if (ultimo === cursor) return;
    if (!Number.isFinite(ultimo) || ultimo < cursor) {
      throw new Error("O catálogo não avançou para a próxima página.");
    }
    cursor = ultimo;
  }
  throw new Error("A listagem do catálogo chegou ao limite de páginas.");
}

function obterCatalogo(unidade) {
  const anterior = catalogos.get(unidade);
  if (anterior && (anterior.sincronizando || Date.now() < anterior.expiraEm)) return anterior;
  if (catalogos.size >= LIMITE_UNIDADES && !anterior) {
    const ocioso = [...catalogos].find(([, valor]) => !valor.sincronizando);
    if (!ocioso) return null;
    catalogos.delete(ocioso[0]);
  }

  const estado = { itens: new Map(), sincronizando: true, erroSync: false };
  catalogos.set(unidade, estado);
  indexar(unidade, estado).catch((erro) => {
    estado.erroSync = true;
    console.warn("[encartes/catalogo]", erro.message);
  }).finally(() => {
    estado.expiraEm = estado.invalidado ? 0 : Date.now() + (estado.erroSync ? 15000 : TTL);
    estado.sincronizando = false;
  });
  return estado;
}

export function invalidarCatalogoEncarte(unidade) {
  const estado = catalogos.get(unidade);
  if (estado?.sincronizando) estado.invalidado = true;
  else catalogos.delete(unidade);
}

function ofertasDoClube(unidade, tipo) {
  const cache = consultarCacheOfertasClube(unidade);
  const itens = cache[tipo].filter((item) =>
    tipo !== "clube" || (item.ativo !== false && item.economia > 0)
  ).map((item) => ({
    codigo: codigoEncarte(item.codigo),
    descricao: item.descricao,
    preco: tipo === "clube" ? item.preco2 : item.preco1,
    tipo,
    validade: item.dataOferta ?? null,
    codigosBarras: item.codigoBarras ? [item.codigoBarras] : [],
  })).filter((item) => item.codigo);
  return { itens, sincronizando: cache.sincronizando, erroSync: cache.erroSync };
}

export function pesquisarCatalogoEncarte({ unidade, busca, tipo, pagina, esgotados }) {
  const estado = tipo ? ofertasDoClube(unidade, tipo) : obterCatalogo(unidade);
  if (!estado) return { itens: [], totalPaginas: 1, sincronizando: true, erroSync: false };
  const termos = textoBusca(busca).split(/\s+/).filter(Boolean);
  const numeros = busca.replace(/[.\-\s]/g, "");
  const codigo = codigoEncarte(numeros);
  const hoje = diaSpIso();
  const itens = [...estado.itens.values()].filter((item) => {
    if (tipo && item.tipo !== tipo) return false;
    if (esgotados.has(item.codigo) || (item.validade && item.validade < hoje)) return false;
    if (codigo) return item.codigo === codigo || item.codigosBarras.includes(numeros);
    const descricao = textoBusca(item.descricao);
    return termos.every((termo) => descricao.includes(termo));
  });
  const limite = 14;
  return {
    itens: itens.slice((pagina - 1) * limite, pagina * limite),
    totalPaginas: Math.max(1, Math.ceil(itens.length / limite)),
    sincronizando: estado.sincronizando,
    erroSync: estado.erroSync,
  };
}
