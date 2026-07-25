import {
  buscarProdutoUnidadePorCodigo,
  listarProdutosUnidadePagina,
} from "./apiClient.js";

const CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_PAGINAS = 600;

const cachePorUnidade = new Map();
const syncEmAndamento = new Map();
const syncStatusPorUnidade = new Map();

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

function normalizarProduto(produto, unidade) {
  const preco1 = arredondarMoeda(produto.Preco ?? produto.PrecoPDV ?? 0);
  const preco2 = arredondarMoeda(obterPreco2Bruto(produto));
  const economia = arredondarMoeda(Math.max(0, preco1 - preco2));
  const percentual =
    preco1 > 0 ? arredondarMoeda((economia / preco1) * 100) : 0;

  return {
    codigo: String(produto.Codigo ?? produto.SKU ?? "").trim(),
    descricao: String(produto.Descricao ?? produto.descricao ?? "").trim(),
    codigoBarras: String(produto.CodigoBarras ?? "").trim() || null,
    departamento: String(produto.Departamento ?? "").trim() || null,
    departamentoCodigo: String(produto.CodigoDepartamento ?? "").trim() || null,
    grupo: String(produto.Grupo ?? "").trim() || null,
    marca: String(produto.Marca ?? "").trim() || null,
    oferta: String(produto.Oferta ?? "").toUpperCase() === "S",
    estoque: Number(produto.Estoque1 ?? produto.Estoque) || 0,
    unidade,
    preco1,
    preco2,
    economia,
    percentualDesconto: percentual,
    ativo:
      produto.Ativo !== false &&
      String(produto.Status ?? "").toUpperCase() !== "INATIVO",
  };
}

function cacheValido(emCache) {
  return Boolean(emCache && emCache.expiresAt > Date.now());
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
  if (!forcar && cacheValido(emCache)) return;
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
      let cursor = 0;
      let totalCatalogo = 0;
      let paginas = 0;

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
          if (!temPrecoClube(produto)) continue;
          const codigo = String(produto.Codigo ?? produto.SKU ?? "").trim();
          if (codigo) candidatos.add(codigo);
        }

        syncStatusPorUnidade.set(chave, {
          sincronizando: true,
          paginas,
          totalCatalogo,
          totalClube: candidatos.size,
          candidatos: candidatos.size,
          confirmados: 0,
          erro: null,
          iniciadoEm: syncStatusPorUnidade.get(chave)?.iniciadoEm,
        });

        const ultimoCodigo = Number(pagina[pagina.length - 1]?.Codigo) || 0;
        if (!ultimoCodigo || ultimoCodigo === cursor) break;
        cursor = ultimoCodigo;
      }

      const produtosClube = [];
      const codigos = [...candidatos];

      for (let i = 0; i < codigos.length; i++) {
        const codigo = codigos[i];
        const resultado = await buscarProdutoUnidadePorCodigo(codigo, unidade);
        if (!resultado.ok) continue;

        const produto = resultado.produto;
        if (apenasAtivos && produto.Ativo === false) continue;

        const item = normalizarProduto(produto, unidade);
        if (item.preco2 > 0) {
          produtosClube.push(item);
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

        cachePorUnidade.set(chave, {
          unidade,
          apenasAtivos,
          produtos: [...produtosClube],
          totalClube: produtosClube.length,
          totalCatalogo,
          paginas,
          sincronizadoEm: null,
          expiresAt: Date.now() + CACHE_TTL_MS,
          parcial: true,
        });
      }

      produtosClube.sort((a, b) =>
        String(a.descricao).localeCompare(String(b.descricao), "pt-BR")
      );

      cachePorUnidade.set(chave, {
        unidade,
        apenasAtivos,
        produtos: produtosClube,
        totalClube: produtosClube.length,
        totalCatalogo,
        paginas,
        sincronizadoEm: new Date().toISOString(),
        expiresAt: Date.now() + CACHE_TTL_MS,
        parcial: false,
      });

      syncStatusPorUnidade.set(chave, {
        sincronizando: false,
        paginas,
        totalCatalogo,
        totalClube: produtosClube.length,
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

function montarResposta(catalogo, { busca, pagina, limite, sincronizando, progresso, erroSync }) {
  const produtosValidos = (catalogo.produtos || []).filter(
    (p) => Number(p.preco2) > 0
  );
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
  const emCache = cachePorUnidade.get(chave);
  const progresso = obterProgresso(chave);
  const sincronizando =
    syncEmAndamento.has(chave) || progresso?.sincronizando === true;
  const apenasAtivos = consultaApenasAtivos();

  if (cacheValido(emCache) && !emCache.parcial && !forcar && !sincronizando) {
    return montarResposta(emCache, { busca, pagina, limite });
  }

  if (!sincronizando) {
    iniciarSincronizacaoBackground(codUnidade, { forcar });
  }

  if (emCache?.produtos) {
    return montarResposta(emCache, {
      busca,
      pagina,
      limite,
      sincronizando,
      progresso: obterProgresso(chave),
    });
  }

  const status = obterProgresso(chave);

  if (status?.erro && !sincronizando) {
    return {
      unidade: codUnidade,
      apenasAtivos,
      itens: [],
      total: 0,
      totalClube: 0,
      totalCatalogo: status.totalCatalogo ?? 0,
      pagina: 1,
      limite: Math.min(200, Math.max(1, Number(limite) || 50)),
      totalPaginas: 1,
      sincronizadoEm: null,
      cacheExpiraEm: null,
      sincronizando: false,
      progresso: status,
      erroSync: status.erro,
    };
  }

  return {
    unidade: codUnidade,
    apenasAtivos,
    itens: [],
    total: 0,
    totalClube: status?.totalClube ?? 0,
    totalCatalogo: status?.totalCatalogo ?? 0,
    pagina: 1,
    limite: Math.min(200, Math.max(1, Number(limite) || 50)),
    totalPaginas: 1,
    sincronizadoEm: null,
    cacheExpiraEm: null,
    sincronizando: true,
    progresso: status,
    erroSync: null,
  };
}
