import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  buscarProdutoUnidadePorCodigo,
  listarProdutosUnidadePagina,
} from "./apiClient.js";

const CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_PAGINAS = 600;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DISK_CACHE_DIR = path.resolve(__dirname, "../.cache");

const cachePorUnidade = new Map();
const syncEmAndamento = new Map();
const syncStatusPorUnidade = new Map();
const coletaOfertasLoja = new Map();
const coletaOfertasLojaFalhouEm = new Map();

function arquivoCacheDisco(chave) {
  const safe = String(chave).replace(/[^a-zA-Z0-9._-]/g, "_");
  return path.join(DISK_CACHE_DIR, `clube-descontos-${safe}.json`);
}

function salvarCacheDisco(chave, emCache) {
  try {
    fs.mkdirSync(DISK_CACHE_DIR, { recursive: true });
    const payload = {
      ...emCache,
      gravadoEm: new Date().toISOString(),
    };
    fs.writeFileSync(arquivoCacheDisco(chave), JSON.stringify(payload));
  } catch (err) {
    console.warn("[produtosClubeDescontos] disco:", err.message);
  }
}

function carregarCacheDisco(chave) {
  try {
    const file = arquivoCacheDisco(chave);
    if (!fs.existsSync(file)) return null;
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!raw?.produtos?.length || !raw.expiresAt) return null;
    if (Number(raw.expiresAt) <= Date.now()) return null;
    if (!cacheDoDiaAtual(raw)) return null;
    return raw;
  } catch {
    return null;
  }
}

function setCacheMemoria(chave, emCache, { persistir = true } = {}) {
  const stamped = {
    ...emCache,
    diaSp: emCache?.diaSp || diaSpIso(emCache?.sincronizadoEm || Date.now()),
  };
  cachePorUnidade.set(chave, stamped);
  if (persistir && stamped?.produtos?.length) {
    // Só grava snapshot “útil”; parcial também ajuda após restart
    salvarCacheDisco(chave, stamped);
  }
}

function arredondarMoeda(valor) {
  return Math.round(Number(valor) * 100) / 100;
}

function unidadePadrao() {
  return String(
    process.env.CLUBE_DESCONTOS_UNIDADE ||
      process.env.CADASTRO_UNIDADE ||
      "001"
  ).trim();
}

function consultaApenasAtivos() {
  const valor = String(process.env.CLUBE_DESCONTOS_APENAS_ATIVOS ?? "true")
    .trim()
    .toLowerCase();
  return valor !== "false" && valor !== "0" && valor !== "nao";
}

function chaveCache(unidade) {
  return `${unidade}:${consultaApenasAtivos() ? "ativos" : "todos"}`;
}

/** Dia civil em America/Sao_Paulo (YYYY-MM-DD). */
export function diaSpIso(valor) {
  const d = valor ? new Date(valor) : new Date();
  if (Number.isNaN(d.getTime())) {
    return new Date().toLocaleDateString("en-CA", {
      timeZone: "America/Sao_Paulo",
    });
  }
  return d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

function cacheDoDiaAtual(emCache) {
  if (!emCache) return false;
  const hoje = diaSpIso();
  if (emCache.diaSp) return String(emCache.diaSp) === hoje;
  if (emCache.sincronizadoEm) return diaSpIso(emCache.sincronizadoEm) === hoje;
  // Sem data de sync: não confiar como "hoje"
  return false;
}

function cacheValido(emCache) {
  if (!emCache || !(emCache.expiresAt > Date.now())) return false;
  return cacheDoDiaAtual(emCache);
}

function invalidarCacheSeOutroDia(chave, emCache) {
  if (!emCache) return null;
  if (!cacheDoDiaAtual(emCache)) {
    // Cache de outro dia: remove e não serve
    cachePorUnidade.delete(chave);
    return null;
  }
  // Mesmo dia: mantém na memória (stale-while-revalidate se TTL expirou)
  return emCache;
}

function obterPreco2Bruto(produto) {
  const candidatos = [
    produto.PrecoVenda2,
    produto.PrecoPDV2,
    produto.PrecoVenda2UnidadeMedida,
    produto.PrecoPDV2UnidadeMedida,
  ];

  for (const valor of candidatos) {
    const numero = Number(valor);
    if (Number.isFinite(numero) && numero > 0) {
      return numero;
    }
  }

  return 0;
}

function temPrecoClube(produto) {
  return obterPreco2Bruto(produto) > 0;
}

function precoPositivo(valor) {
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Preço de prateleira antes da oferta.
 * Fora de oferta o ERP zera PrecoNormal; PrVendaAnt aí é só o último reajuste.
 */
export function precoAnteriorDeProdutoErp(produto) {
  const emOferta = String(produto?.Oferta ?? "").toUpperCase() === "S";
  if (!emOferta) return 0;
  const normal = precoPositivo(produto?.PrecoNormal);
  if (normal > 0) return arredondarMoeda(normal);
  const anterior = precoPositivo(produto?.PrVendaAnt);
  if (anterior > 0) return arredondarMoeda(anterior);
  return 0;
}

/**
 * Base do "de/por": preço 1 fora de oferta; preço anterior quando a oferta
 * ainda deixa o preço antigo acima do clube.
 */
export function calcularDescontoClube(p) {
  const preco1 = Number(p?.preco1) || 0;
  const preco2 = Number(p?.preco2) || 0;
  const anterior = Number(p?.precoAnterior) || 0;
  const emOferta =
    p?.oferta === true || String(p?.oferta ?? "").toUpperCase() === "S";
  const base = emOferta && anterior > preco2 ? anterior : preco1;
  const economia = arredondarMoeda(Math.max(0, base - preco2));
  const percentual =
    base > 0 && economia > 0 ? Math.round((economia / base) * 100) : 0;
  return { base, preco2, economia, percentual };
}

export function aplicarDescontoClube(item) {
  const desconto = calcularDescontoClube(item);
  return {
    ...item,
    precoDe: desconto.base,
    economia: desconto.economia,
    percentualDesconto: desconto.percentual,
  };
}

function normalizarProduto(produto, unidade) {
  const preco1 = arredondarMoeda(produto.Preco ?? produto.PrecoPDV ?? 0);
  const preco2 = arredondarMoeda(obterPreco2Bruto(produto));
  const oferta = String(produto.Oferta ?? "").toUpperCase() === "S";
  const precoAnterior = precoAnteriorDeProdutoErp(produto);
  const desconto = calcularDescontoClube({
    oferta,
    preco1,
    preco2,
    precoAnterior,
  });

  return {
    codigo: String(produto.Codigo ?? produto.SKU ?? "").trim(),
    descricao: String(produto.Descricao ?? produto.descricao ?? "").trim(),
    codigoBarras: String(produto.CodigoBarras ?? "").trim() || null,
    departamento: String(produto.Departamento ?? "").trim() || null,
    departamentoCodigo: String(produto.CodigoDepartamento ?? "").trim() || null,
    grupo: String(produto.Grupo ?? "").trim() || null,
    marca: String(produto.Marca ?? "").trim() || null,
    oferta,
    estoque: Number(produto.Estoque1 ?? produto.Estoque) || 0,
    unidade,
    preco1,
    preco2,
    precoAnterior,
    precoDe: desconto.base,
    economia: desconto.economia,
    percentualDesconto: desconto.percentual,
    ativo:
      produto.Ativo !== false &&
      String(produto.Status ?? "").toUpperCase() !== "INATIVO",
  };
}

/** DataOferta do ERP (dd-mm-aaaa) → YYYY-MM-DD. */
export function dataOfertaParaIso(valor) {
  const s = String(valor ?? "").trim();
  const m = s.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) return null;
  const dia = Number(m[1]);
  const mes = Number(m[2]);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function dataOfertaCurta(iso) {
  if (!iso || iso.length < 10) return "";
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

/** No RP, DataOferta é o dia seguinte ao último dia da oferta. */
function diaAnteriorIso(iso) {
  const m = String(iso ?? "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  dt.setUTCDate(dt.getUTCDate() - 1);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function ofertaComFimReal(item) {
  if (!item || item.fimOfertaAjustado) return item;
  const fim = diaAnteriorIso(item.dataOferta);
  if (!fim) return item;
  return {
    ...item,
    dataOferta: fim,
    dataOfertaBr: dataOfertaCurta(fim),
    fimOfertaAjustado: true,
  };
}

/**
 * Oferta de gôndola vigente, sem preço de Clube.
 * Quem tem preço 2 fica só na lista do Clube.
 */
export function normalizarOfertaLoja(produto, unidade) {
  if (String(produto?.Oferta ?? "").toUpperCase() !== "S") return null;
  if (temPrecoClube(produto)) return null;
  const dataErp = dataOfertaParaIso(produto?.DataOferta);
  const dataOferta = dataErp ? diaAnteriorIso(dataErp) : null;
  if (!dataOferta || dataOferta < diaSpIso()) return null;

  const preco1 = arredondarMoeda(produto.Preco ?? produto.PrecoPDV ?? 0);
  const precoAnterior = precoAnteriorDeProdutoErp(produto);
  if (!(preco1 > 0) || !(precoAnterior > preco1)) return null;

  const economia = arredondarMoeda(precoAnterior - preco1);
  const percentual =
    precoAnterior > 0 ? Math.round((economia / precoAnterior) * 100) : 0;
  const codigo = String(produto.Codigo ?? produto.SKU ?? "").trim();
  if (!codigo) return null;

  return {
    codigo,
    descricao: String(produto.Descricao ?? produto.descricao ?? "").trim(),
    marca: String(produto.Marca ?? "").trim() || null,
    oferta: true,
    unidade,
    preco1,
    preco2: 0,
    precoAnterior,
    precoDe: precoAnterior,
    economia,
    percentualDesconto: percentual,
    dataOferta,
    dataOfertaBr: dataOfertaCurta(dataOferta),
    fimOfertaAjustado: true,
    tipo: "loja",
  };
}

function ordenarOfertasLoja(lista) {
  return [...lista].sort((a, b) => {
    const pa = Number(a.percentualDesconto) || 0;
    const pb = Number(b.percentualDesconto) || 0;
    if (pb !== pa) return pb - pa;
    return (Number(b.economia) || 0) - (Number(a.economia) || 0);
  });
}

export function selecionarOfertasLoja(lista, limite = 8) {
  const hoje = diaSpIso();
  const validas = (Array.isArray(lista) ? lista : []).map(ofertaComFimReal).filter((p) => {
    if (Number(p?.preco2) > 0) return false;
    if (!p?.dataOferta || String(p.dataOferta) < hoje) return false;
    if (!(Number(p.precoAnterior) > Number(p.preco1))) return false;
    return Number(p.preco1) > 0;
  });
  const n = Math.max(1, Number(limite) || 8);
  return ordenarOfertasLoja(validas).slice(0, n);
}

export function ordenarClubePorDesconto(lista) {
  return [...(Array.isArray(lista) ? lista : [])].sort((a, b) => {
    const ao = a?.oferta ? 1 : 0;
    const bo = b?.oferta ? 1 : 0;
    if (bo !== ao) return bo - ao;
    const pa = Number(a?.percentualDesconto) || 0;
    const pb = Number(b?.percentualDesconto) || 0;
    if (pb !== pa) return pb - pa;
    return (Number(b?.economia) || 0) - (Number(a?.economia) || 0);
  });
}

function obterProgresso(unidade) {
  const status = syncStatusPorUnidade.get(unidade);
  if (!status) return null;
  return {
    sincronizando: status.sincronizando === true,
    paginas: status.paginas ?? 0,
    totalCatalogo: status.totalCatalogo ?? 0,
    totalClube: status.totalClube ?? 0,
    candidatos: status.candidatos ?? 0,
    confirmados: status.confirmados ?? 0,
    erro: status.erro ?? null,
  };
}

function iniciarSincronizacaoBackground(unidade, { forcar = false } = {}) {
  const chave = chaveCache(unidade);
  const emCache = cachePorUnidade.get(chave);
  // Parcial / poucas ofertas: continua sync em background
  const cacheCompleto =
    cacheValido(emCache) &&
    !emCache.parcial &&
    (emCache.produtos?.length || 0) >= 8;
  if (!forcar && cacheCompleto) return;
  if (syncEmAndamento.has(chave)) return;

  if (forcar) {
    cachePorUnidade.delete(chave);
  }

  const apenasAtivos = consultaApenasAtivos();

  syncStatusPorUnidade.set(chave, {
    sincronizando: true,
    paginas: 0,
    totalCatalogo: 0,
    totalClube: 0,
    candidatos: 0,
    confirmados: 0,
    erro: null,
    iniciadoEm: new Date().toISOString(),
  });

  const promise = (async () => {
    try {
      const candidatos = new Set();
      const provisoriPorCodigo = new Map();
      const ofertasLojaPorCodigo = new Map();
      const ofertasLojaAtuais = () =>
        ordenarOfertasLoja([...ofertasLojaPorCodigo.values()]).slice(0, 40);
      let cursor = 0;
      let totalCatalogo = 0;
      let paginas = 0;

      const publicarParcial = () => {
        const produtos = [...provisoriPorCodigo.values()];
        if (!produtos.length) return;
        setCacheMemoria(chave, {
          unidade,
          apenasAtivos,
          produtos,
          ofertasLoja: ofertasLojaAtuais(),
          totalClube: produtos.length,
          totalCatalogo,
          paginas,
          sincronizadoEm: null,
          diaSp: diaSpIso(),
          expiresAt: Date.now() + CACHE_TTL_MS,
          parcial: true,
        });
      };

      for (let i = 0; i < MAX_PAGINAS; i++) {
        const resultado = await listarProdutosUnidadePagina(cursor, unidade, {
          apenasAtivos,
        });
        if (!resultado.ok) {
          throw new Error(
            resultado.error || "Falha ao consultar produtos na API"
          );
        }

        const pagina = resultado.produtos;
        if (!pagina.length) break;

        paginas += 1;
        totalCatalogo += pagina.length;

        for (const produto of pagina) {
          if (apenasAtivos && produto.Ativo === false) continue;
          const ofertaLoja = normalizarOfertaLoja(produto, unidade);
          if (ofertaLoja) ofertasLojaPorCodigo.set(ofertaLoja.codigo, ofertaLoja);
          if (!temPrecoClube(produto)) continue;
          const codigo = String(produto.Codigo ?? produto.SKU ?? "").trim();
          if (!codigo) continue;
          candidatos.add(codigo);
          // Já publica preço 2 da listagem (rápido p/ WhatsApp); confirmação refina depois
          const item = normalizarProduto(produto, unidade);
          if (item.preco2 > 0) {
            provisoriPorCodigo.set(codigo, item);
          }
        }

        syncStatusPorUnidade.set(chave, {
          sincronizando: true,
          paginas,
          totalCatalogo,
          totalClube: provisoriPorCodigo.size || candidatos.size,
          candidatos: candidatos.size,
          confirmados: 0,
          erro: null,
          iniciadoEm: syncStatusPorUnidade.get(chave)?.iniciadoEm,
        });

        if (paginas === 1 || paginas % 2 === 0 || provisoriPorCodigo.size >= 8) {
          publicarParcial();
        }

        const ultimoCodigo = Number(pagina[pagina.length - 1]?.Codigo) || 0;
        if (!ultimoCodigo || ultimoCodigo === cursor) break;
        cursor = ultimoCodigo;
      }

      publicarParcial();

      const produtosClube = [];
      const codigos = [...candidatos];

      for (let i = 0; i < codigos.length; i++) {
        const codigo = codigos[i];
        const resultado = await buscarProdutoUnidadePorCodigo(codigo, unidade);
        if (!resultado.ok) {
          // mantém provisório da listagem se existir
          const prev = provisoriPorCodigo.get(codigo);
          if (prev) produtosClube.push(prev);
          continue;
        }

        const produto = resultado.produto;
        if (apenasAtivos && produto.Ativo === false) continue;

        const item = normalizarProduto(produto, unidade);
        if (item.preco2 > 0) {
          produtosClube.push(item);
          provisoriPorCodigo.set(codigo, item);
        }

        syncStatusPorUnidade.set(chave, {
          sincronizando: true,
          paginas,
          totalCatalogo,
          totalClube: produtosClube.length,
          candidatos: codigos.length,
          confirmados: i + 1,
          erro: null,
          iniciadoEm: syncStatusPorUnidade.get(chave)?.iniciadoEm,
        });

        if (i === 0 || (i + 1) % 10 === 0) {
          setCacheMemoria(chave, {
            unidade,
            apenasAtivos,
            produtos: [...provisoriPorCodigo.values()],
            ofertasLoja: ofertasLojaAtuais(),
            totalClube: provisoriPorCodigo.size,
            totalCatalogo,
            paginas,
            sincronizadoEm: null,
            diaSp: diaSpIso(),
            expiresAt: Date.now() + CACHE_TTL_MS,
            parcial: true,
          });
        }
      }

      // Se a confirmação individual falhou para muitos, usa o mapa provisório
      const finais =
        produtosClube.length >= Math.min(5, provisoriPorCodigo.size)
          ? produtosClube
          : [...provisoriPorCodigo.values()];

      finais.sort((a, b) =>
        String(a.descricao).localeCompare(String(b.descricao), "pt-BR")
      );

      setCacheMemoria(chave, {
        unidade,
        apenasAtivos,
        produtos: finais,
        ofertasLoja: ofertasLojaAtuais(),
        totalClube: finais.length,
        totalCatalogo,
        paginas,
        sincronizadoEm: new Date().toISOString(),
        diaSp: diaSpIso(),
        expiresAt: Date.now() + CACHE_TTL_MS,
        parcial: false,
      });

      syncStatusPorUnidade.set(chave, {
        sincronizando: false,
        paginas,
        totalCatalogo,
        totalClube: finais.length,
        erro: null,
        concluidoEm: new Date().toISOString(),
      });
    } catch (error) {
      console.error("[produtosClubeDescontos/sync]", error.message);
      syncStatusPorUnidade.set(chave, {
        sincronizando: false,
        paginas: syncStatusPorUnidade.get(chave)?.paginas ?? 0,
        totalCatalogo: syncStatusPorUnidade.get(chave)?.totalCatalogo ?? 0,
        totalClube: syncStatusPorUnidade.get(chave)?.totalClube ?? 0,
        erro: error.message,
        concluidoEm: new Date().toISOString(),
      });
    } finally {
      syncEmAndamento.delete(chave);
    }
  })();

  syncEmAndamento.set(chave, promise);
}

function filtrarProdutos(produtos, busca) {
  const termo = String(busca ?? "")
    .trim()
    .toLowerCase();
  if (!termo) return produtos;

  const numeros = termo.replace(/\D/g, "");

  return produtos.filter((p) => {
    const texto =
      `${p.descricao} ${p.codigo} ${p.codigoBarras || ""} ${p.marca || ""}`.toLowerCase();
    if (texto.includes(termo)) return true;
    if (numeros && String(p.codigo).includes(numeros)) return true;
    if (numeros && String(p.codigoBarras || "").includes(numeros)) return true;
    return false;
  });
}

async function anexarEsgotado(dados) {
  if (!dados?.itens?.length) return dados;
  try {
    const { codigosEsgotadosHoje } = await import(
      "./clubeOfertaEsgotadaService.js"
    );
    const codigos = await codigosEsgotadosHoje();
    return {
      ...dados,
      itens: dados.itens.map((item) => ({
        ...item,
        esgotado: codigos.has(String(item.codigo)),
      })),
    };
  } catch (err) {
    console.warn("[clube-esgotado]", err.message);
    return dados;
  }
}

function montarResposta(catalogo, { busca, pagina, limite, sincronizando, progresso, erroSync }) {
  const produtosValidos = (catalogo.produtos || [])
    .filter((p) => Number(p.preco2) > 0)
    .map(aplicarDescontoClube);
  const filtrados = filtrarProdutos(produtosValidos, busca);
  const paginaNum = Math.max(1, Number(pagina) || 1);
  const limiteNum = Math.min(200, Math.max(1, Number(limite) || 50));
  const offset = (paginaNum - 1) * limiteNum;
  const itens = filtrados.slice(offset, offset + limiteNum);

  return {
    unidade: catalogo.unidade,
    apenasAtivos: catalogo.apenasAtivos !== false,
    itens,
    total: filtrados.length,
    totalClube: produtosValidos.length,
    totalCatalogo: catalogo.totalCatalogo,
    pagina: paginaNum,
    limite: limiteNum,
    totalPaginas: Math.max(1, Math.ceil(filtrados.length / limiteNum)),
    ofertasLoja: Array.isArray(catalogo.ofertasLoja) ? catalogo.ofertasLoja : null,
    sincronizadoEm: catalogo.sincronizadoEm,
    cacheExpiraEm: new Date(catalogo.expiresAt).toISOString(),
    sincronizando: Boolean(sincronizando),
    progresso: progresso || null,
    erroSync: erroSync || null,
  };
}

export async function listarProdutosClubeDescontos({
  unidade,
  busca = "",
  pagina = 1,
  limite = 50,
  atualizar = false,
} = {}) {
  const codUnidade = String(unidade ?? unidadePadrao()).trim();
  const chave = chaveCache(codUnidade);
  const forcar = Boolean(atualizar);
  let emCache = invalidarCacheSeOutroDia(chave, cachePorUnidade.get(chave));
  if (!emCache || !cacheValido(emCache)) {
    const disco = carregarCacheDisco(chave);
    if (disco) {
      cachePorUnidade.set(chave, disco);
      emCache = disco;
    } else {
      emCache = null;
    }
  }
  const progresso = obterProgresso(chave);
  const sincronizando =
    syncEmAndamento.has(chave) || progresso?.sincronizando === true;
  const apenasAtivos = consultaApenasAtivos();
  const cacheHoje = cacheValido(emCache);
  if (
    emCache?.produtos?.length &&
    cacheDoDiaAtual(emCache) &&
    !Array.isArray(emCache.ofertasLoja)
  ) {
    iniciarColetaOfertasLoja(codUnidade);
  }

  if (cacheHoje && !emCache.parcial && !forcar && !sincronizando) {
    return anexarEsgotado(montarResposta(emCache, { busca, pagina, limite })).then(
      (dados) => comStatusLoja(chave, dados)
    );
  }

  // Outro dia / forçar: sempre ressincroniza (não reaproveita lista velha)
  const precisaForcar = forcar || !cacheDoDiaAtual(emCache);
  if (!sincronizando) {
    iniciarSincronizacaoBackground(codUnidade, {
      forcar: precisaForcar,
    });
  }

  // Só serve cache em memória se for do dia atual (stale-while-revalidate no mesmo dia)
  if (emCache?.produtos?.length && cacheDoDiaAtual(emCache)) {
    return anexarEsgotado(
      montarResposta(emCache, {
        busca,
        pagina,
        limite,
        sincronizando:
          syncEmAndamento.has(chave) || obterProgresso(chave)?.sincronizando,
        progresso: obterProgresso(chave),
      })
    ).then((dados) => comStatusLoja(chave, dados));
  }

  const status = obterProgresso(chave);

  if (status?.erro && !syncEmAndamento.has(chave)) {
    return anexarEsgotado(comStatusLoja(chave, {
      unidade: codUnidade,
      apenasAtivos,
      itens: [],
      total: 0,
      totalClube: 0,
      totalCatalogo: status.totalCatalogo ?? 0,
      pagina: 1,
      limite: Math.min(200, Math.max(1, Number(limite) || 50)),
      totalPaginas: 1,
      ofertasLoja: null,
      sincronizadoEm: null,
      cacheExpiraEm: null,
      sincronizando: false,
      progresso: status,
      erroSync: status.erro,
      cacheOutroDia: true,
    }));
  }

  return anexarEsgotado(comStatusLoja(chave, {
    unidade: codUnidade,
    apenasAtivos,
    itens: [],
    total: 0,
    totalClube: status?.totalClube ?? 0,
    totalCatalogo: status?.totalCatalogo ?? 0,
    pagina: 1,
    limite: Math.min(200, Math.max(1, Number(limite) || 50)),
    totalPaginas: 1,
    ofertasLoja: null,
    sincronizadoEm: null,
    cacheExpiraEm: null,
    sincronizando: true,
    progresso: status,
    erroSync: null,
    aguardandoDiaAtual: true,
  }));
}

function comStatusLoja(chave, dados) {
  return {
    ...dados,
    lojaColetando: coletaOfertasLoja.has(chave),
    ofertasLojaProntas: Array.isArray(dados?.ofertasLoja),
  };
}

function iniciarColetaOfertasLoja(unidade) {
  const codUnidade = String(unidade ?? unidadePadrao()).trim();
  const chave = chaveCache(codUnidade);
  if (syncEmAndamento.has(chave) || coletaOfertasLoja.has(chave)) return;
  const falha = coletaOfertasLojaFalhouEm.get(chave);
  if (falha && Date.now() - falha < 60_000) return;
  const atual = cachePorUnidade.get(chave);
  if (!atual?.produtos?.length || Array.isArray(atual.ofertasLoja)) return;

  const apenasAtivos = consultaApenasAtivos();
  const promise = (async () => {
    try {
      const mapa = new Map();
      let cursor = 0;
      for (let i = 0; i < MAX_PAGINAS; i++) {
        if (syncEmAndamento.has(chave)) return;
        const resultado = await listarProdutosUnidadePagina(cursor, codUnidade, {
          apenasAtivos,
        });
        if (!resultado.ok) {
          throw new Error(resultado.error || "Falha ao consultar ofertas da loja");
        }
        const pagina = resultado.produtos;
        if (!pagina.length) break;
        for (const produto of pagina) {
          if (apenasAtivos && produto.Ativo === false) continue;
          const item = normalizarOfertaLoja(produto, codUnidade);
          if (item) mapa.set(item.codigo, item);
        }
        const ultimo = Number(pagina[pagina.length - 1]?.Codigo) || 0;
        if (!ultimo || ultimo === cursor) break;
        cursor = ultimo;
      }
      if (syncEmAndamento.has(chave)) return;
      const emCache = cachePorUnidade.get(chave);
      if (!emCache?.produtos?.length) return;
      const ofertasLoja = ordenarOfertasLoja([...mapa.values()]).slice(0, 40);
      setCacheMemoria(chave, {
        ...emCache,
        ofertasLoja,
        ofertasLojaEm: new Date().toISOString(),
      });
      console.log(`[clube-descontos] ofertas da loja: ${ofertasLoja.length}`);
    } catch (err) {
      coletaOfertasLojaFalhouEm.set(chave, Date.now());
      console.warn("[clube-descontos] ofertas da loja:", err.message);
    } finally {
      coletaOfertasLoja.delete(chave);
    }
  })();

  coletaOfertasLoja.set(chave, promise);
}

/** Dispara sync em background para deixar o cache quente (WhatsApp / vitrine). */
export function aquecerCacheClubeDescontos(unidade) {
  const codUnidade = String(unidade ?? unidadePadrao()).trim();
  const chave = chaveCache(codUnidade);
  const disco = carregarCacheDisco(chave);
  const forcar = !disco || !cacheDoDiaAtual(disco);
  if (disco?.produtos?.length && cacheDoDiaAtual(disco)) {
    cachePorUnidade.set(chave, disco);
    console.log(
      `[clube-descontos] cache disco carregado (${disco.produtos.length} itens, dia ${disco.diaSp || diaSpIso(disco.sincronizadoEm)})`
    );
  } else if (disco && !cacheDoDiaAtual(disco)) {
    console.log(
      `[clube-descontos] cache disco de outro dia ignorado — sincronizando ofertas de hoje`
    );
  }
  iniciarSincronizacaoBackground(codUnidade, { forcar });
  if (!forcar) iniciarColetaOfertasLoja(codUnidade);
  return { ok: true, unidade: codUnidade, doDisco: Boolean(disco?.produtos?.length && !forcar) };
}
