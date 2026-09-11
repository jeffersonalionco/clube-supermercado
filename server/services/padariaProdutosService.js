import { getPool } from "../db.js";
import { buscarProdutoUnidadePorCodigo } from "./apiClient.js";
import { obterConfigPadaria } from "./padariaConfigService.js";
import { registrarAuditoriaPadaria } from "./padariaAuditoriaService.js";
import {
  carregarDecoracoesPorProdutos,
  listarDecoracoesPorProduto,
} from "./padariaDecoracoesService.js";

let syncStatus = {
  sincronizando: false,
  total: 0,
  atualizados: 0,
  falhas: 0,
  erro: null,
  iniciadoEm: null,
  finalizadoEm: null,
};

function arredondarMoeda(valor) {
  return Math.round(Number(valor) * 100) / 100;
}

function nomeVisivel(row) {
  return String(row.nome_catalogo || row.nome_rp || "").trim();
}

/** Extrai código de barras / balança do JSON do RP (barra sem dígito verificador). */
function extrairCodigosRp(dadosRp) {
  let d = dadosRp;
  if (typeof d === "string") {
    try {
      d = JSON.parse(d);
    } catch {
      d = null;
    }
  }
  if (!d || typeof d !== "object") {
    return { codigoBarras: null, codigoBalanca: null };
  }
  const candidatos = [
    d.CodigoBarras,
    d.codigoBarras,
    d.CodigoBarra,
    d.EAN,
    d.Ean,
    d.GTIN,
    d.Gtin,
  ]
    .map((x) => String(x ?? "").trim())
    .filter(Boolean);
  const codigoBarras = candidatos[0] || null;
  const balancaExplita = String(
    d.CodigoBalanca ?? d.codigoBalanca ?? d.PLU ?? d.Plu ?? ""
  ).trim();
  let codigoBalanca = balancaExplita || null;
  if (!codigoBalanca && codigoBarras && codigoBarras.length > 1) {
    codigoBalanca = codigoBarras.slice(0, -1);
  }
  return { codigoBarras, codigoBalanca };
}

function mapProduto(row, { publico = false } = {}) {
  if (!row) return null;
  const { codigoBarras, codigoBalanca } = extrairCodigosRp(row.dados_rp);
  const base = {
    codigo: row.codigo,
    nomeRp: row.nome_rp,
    nomeCatalogo: row.nome_catalogo,
    nome: nomeVisivel(row),
    preco: Number(row.preco) || 0,
    unidadeMedida: row.unidade_medida || "UN",
    vendaPorKg: Boolean(row.venda_por_kg),
    ativoRp: Boolean(row.ativo_rp),
    ativoCatalogo: Boolean(row.ativo_catalogo),
    descricao: row.descricao,
    cobertura: row.cobertura,
    recheio: row.recheio,
    imagemUrl: row.imagem_url,
    departamentoCodigo: row.departamento_codigo,
    grupo: row.grupo,
    categoriaId: row.categoria_id ?? null,
    categoriaNome: row.categoria_nome || null,
    categoriaSlug: row.categoria_slug || null,
    categoriaCor: row.categoria_cor || null,
    codigoBarras,
    codigoBalanca,
    sincronizadoEm: row.sincronizado_em,
    atualizadoEm: row.atualizado_em,
  };
  if (publico) {
    return {
      codigo: base.codigo,
      nome: base.nome,
      preco: base.preco,
      unidadeMedida: base.unidadeMedida,
      vendaPorKg: base.vendaPorKg,
      descricao: base.descricao,
      cobertura: base.cobertura,
      recheio: base.recheio,
      imagemUrl: base.imagemUrl,
      grupo: base.grupo,
      categoriaId: base.categoriaId,
      categoriaNome: base.categoriaNome,
      categoriaSlug: base.categoriaSlug,
      categoriaCor: base.categoriaCor,
      codigoBarras: base.codigoBarras,
      codigoBalanca: base.codigoBalanca,
      decoracoes: [],
    };
  }
  return { ...base, decoracoes: [] };
}

const SELECT_PRODUTO = `
  SELECT p.*,
         c.nome AS categoria_nome,
         c.slug AS categoria_slug,
         c.cor AS categoria_cor,
         c.ordem AS categoria_ordem
  FROM padaria_produto p
  LEFT JOIN padaria_categoria c ON c.id = p.categoria_id
`;

function extrairProdutoRp(produto) {
  const codigo = String(produto.Codigo ?? produto.SKU ?? "").trim();
  const nomeRp = String(produto.Descricao ?? produto.descricao ?? "").trim();
  const preco = arredondarMoeda(
    produto.Preco ?? produto.PrecoPDV ?? produto.PrecoVenda ?? 0
  );
  const ativoRp =
    produto.Ativo !== false &&
    String(produto.Status ?? "").toUpperCase() !== "INATIVO";
  const departamentoCodigo = String(
    produto.CodigoDepartamento ?? produto.DepartamentoCodigo ?? ""
  ).trim();
  const departamentoNome = String(produto.Departamento ?? "").trim();
  const grupo = String(produto.Grupo ?? "").trim() || null;
  const unidadeMedida = String(
    produto.UnidadeMedida ?? produto.Unidade ?? "UN"
  )
    .trim()
    .toUpperCase()
    .slice(0, 10) || "UN";

  return {
    codigo,
    nomeRp,
    preco,
    ativoRp,
    departamentoCodigo: departamentoCodigo || null,
    departamentoNome,
    grupo,
    unidadeMedida: unidadeMedida === "KG" || unidadeMedida === "K" ? "KG" : "UN",
    dadosRp: produto,
  };
}

async function upsertProdutoDoRp(extraido, { origem = null } = {}) {
  await getPool().query(
    `INSERT INTO padaria_produto (
       codigo, nome_rp, preco, unidade_medida, ativo_rp,
       departamento_codigo, grupo, dados_rp, origem, sincronizado_em, atualizado_em
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, COALESCE($9, 'manual'), NOW(), NOW())
     ON CONFLICT (codigo) DO UPDATE SET
       nome_rp = EXCLUDED.nome_rp,
       preco = EXCLUDED.preco,
       unidade_medida = CASE
         WHEN padaria_produto.venda_por_kg THEN padaria_produto.unidade_medida
         ELSE EXCLUDED.unidade_medida
       END,
       ativo_rp = EXCLUDED.ativo_rp,
       departamento_codigo = EXCLUDED.departamento_codigo,
       grupo = EXCLUDED.grupo,
       dados_rp = EXCLUDED.dados_rp,
       origem = CASE
         WHEN padaria_produto.origem = 'manual' THEN 'manual'
         WHEN $9::text IS NOT NULL THEN $9::text
         ELSE padaria_produto.origem
       END,
       sincronizado_em = NOW(),
       atualizado_em = NOW()`,
    [
      extraido.codigo,
      extraido.nomeRp || extraido.codigo,
      extraido.preco,
      extraido.unidadeMedida,
      extraido.ativoRp,
      extraido.departamentoCodigo,
      extraido.grupo,
      JSON.stringify(extraido.dadosRp || {}),
      origem,
    ]
  );
}

export function obterStatusSyncPadaria() {
  return { ...syncStatus };
}

/**
 * Busca um produto no RP pelo código interno e cadastra/atualiza na padaria.
 * Não lista o departamento inteiro — só consulta aquele código.
 */
export async function adicionarProdutoPorCodigo(
  codigo,
  { ativarCatalogo = true } = {}
) {
  const codigoLimpo = String(codigo ?? "").trim();
  if (!codigoLimpo) throw new Error("Informe o código interno do produto");

  const config = await obterConfigPadaria();
  const unidade = config.unidade_rp || "001";
  const resultado = await buscarProdutoUnidadePorCodigo(codigoLimpo, unidade);
  if (!resultado.ok || !resultado.produto) {
    throw new Error(resultado.error || "Produto não encontrado no RP");
  }

  const extraido = extrairProdutoRp(resultado.produto);
  if (!extraido.codigo) throw new Error("Código inválido no RP");

  await upsertProdutoDoRp(extraido, { origem: "manual" });

  if (ativarCatalogo) {
    await getPool().query(
      `UPDATE padaria_produto SET
         origem = 'manual',
         ativo_catalogo = true,
         nome_catalogo = COALESCE(nome_catalogo, nome_rp),
         atualizado_em = NOW()
       WHERE codigo = $1`,
      [extraido.codigo]
    );
  } else {
    await getPool().query(
      `UPDATE padaria_produto SET origem = 'manual', atualizado_em = NOW()
       WHERE codigo = $1`,
      [extraido.codigo]
    );
  }

  const produto = await obterProdutoAdmin(extraido.codigo);
  await registrarAuditoriaPadaria({
    acao: "produto_adicionado",
    entidade: "produto",
    entidadeId: extraido.codigo,
    dados: { ativoCatalogo: ativarCatalogo, nome: produto?.nome },
  });
  return produto;
}

/**
 * Atualiza preço/nome RP somente dos produtos já cadastrados na padaria.
 */
export async function atualizarProdutosCadastrados({ forcar = false } = {}) {
  if (syncStatus.sincronizando && !forcar) {
    return { ok: true, emAndamento: true, status: obterStatusSyncPadaria() };
  }

  const config = await obterConfigPadaria();
  const unidade = config.unidade_rp || "001";

  const { rows } = await getPool().query(
    `SELECT codigo FROM padaria_produto WHERE origem = 'manual' ORDER BY codigo`
  );

  syncStatus = {
    sincronizando: true,
    total: rows.length,
    atualizados: 0,
    falhas: 0,
    erro: null,
    iniciadoEm: new Date().toISOString(),
    finalizadoEm: null,
    unidade,
  };

  (async () => {
    let atualizados = 0;
    let falhas = 0;
    try {
      for (const row of rows) {
        try {
          const resultado = await buscarProdutoUnidadePorCodigo(
            row.codigo,
            unidade
          );
          if (!resultado.ok || !resultado.produto) {
            falhas += 1;
          } else {
            const extraido = extrairProdutoRp(resultado.produto);
            if (extraido.codigo) {
              await upsertProdutoDoRp(extraido);
              atualizados += 1;
            } else {
              falhas += 1;
            }
          }
        } catch {
          falhas += 1;
        }
        syncStatus = {
          ...syncStatus,
          sincronizando: true,
          atualizados,
          falhas,
        };
      }

      syncStatus = {
        ...syncStatus,
        sincronizando: false,
        atualizados,
        falhas,
        erro: null,
        finalizadoEm: new Date().toISOString(),
      };
    } catch (error) {
      console.error("[padaria/atualizar-cadastrados]", error.message);
      syncStatus = {
        ...syncStatus,
        sincronizando: false,
        atualizados,
        falhas,
        erro: error.message,
        finalizadoEm: new Date().toISOString(),
      };
    }
  })();

  return { ok: true, emAndamento: true, status: obterStatusSyncPadaria() };
}

export async function listarCatalogoPublico({ busca = "", categoriaId = null } = {}) {
  const params = [];
  const conds = [
    "p.origem = 'manual'",
    "p.ativo_catalogo = true",
    "p.ativo_rp = true",
  ];
  let i = 1;

  if (busca.trim()) {
    conds.push(`(
      COALESCE(p.nome_catalogo, p.nome_rp) ILIKE $${i}
      OR p.nome_rp ILIKE $${i}
      OR p.codigo ILIKE $${i}
      OR COALESCE(p.cobertura, '') ILIKE $${i}
      OR COALESCE(p.recheio, '') ILIKE $${i}
    )`);
    params.push(`%${busca.trim()}%`);
    i += 1;
  }
  if (categoriaId) {
    conds.push(`p.categoria_id = $${i}`);
    params.push(Number(categoriaId));
  }

  const { rows } = await getPool().query(
    `${SELECT_PRODUTO}
     WHERE ${conds.join(" AND ")}
     ORDER BY COALESCE(c.ordem, 9999), COALESCE(p.nome_catalogo, p.nome_rp)`,
    params
  );
  const produtos = rows.map((r) => mapProduto(r, { publico: true }));
  const decoMap = await carregarDecoracoesPorProdutos(
    produtos.map((p) => p.codigo),
    { apenasAtivas: true }
  );
  return produtos.map((p) => ({
    ...p,
    decoracoes: decoMap.get(p.codigo) || [],
  }));
}

export async function obterProdutoCatalogo(codigo) {
  const { rows } = await getPool().query(
    `${SELECT_PRODUTO}
     WHERE p.codigo = $1 AND p.origem = 'manual'
       AND p.ativo_catalogo = true AND p.ativo_rp = true`,
    [String(codigo)]
  );
  const produto = mapProduto(rows[0], { publico: true });
  if (!produto) return null;
  produto.decoracoes = await listarDecoracoesPorProduto(produto.codigo, {
    apenasAtivas: true,
  });
  return produto;
}

export async function listarProdutosAdmin({
  busca = "",
  apenasCatalogo = false,
  filtro = "",
  limite = 200,
  offset = 0,
} = {}) {
  const params = [];
  const conds = ["p.origem = 'manual'"];
  let i = 1;

  const filtroNorm = String(filtro || "").trim().toLowerCase();
  if (filtroNorm === "catalogo" || apenasCatalogo) {
    conds.push("p.ativo_catalogo = true");
  } else if (filtroNorm === "ocultos") {
    conds.push("p.ativo_catalogo = false");
  } else if (filtroNorm === "inativos_rp") {
    conds.push("p.ativo_rp = false");
  } else if (filtroNorm === "sem_categoria") {
    conds.push("p.categoria_id IS NULL");
  }
  if (busca.trim()) {
    conds.push(
      `(COALESCE(p.nome_catalogo, p.nome_rp) ILIKE $${i} OR p.nome_rp ILIKE $${i} OR p.codigo ILIKE $${i}
        OR COALESCE(p.cobertura, '') ILIKE $${i} OR COALESCE(p.recheio, '') ILIKE $${i})`
    );
    params.push(`%${busca.trim()}%`);
    i += 1;
  }

  const where = `WHERE ${conds.join(" AND ")}`;
  const lim = Math.min(Math.max(Number(limite) || 200, 1), 500);
  const off = Math.max(Number(offset) || 0, 0);

  const countRes = await getPool().query(
    `SELECT COUNT(*)::int AS total FROM padaria_produto p ${where}`,
    params
  );

  const statsRes = await getPool().query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE ativo_catalogo)::int AS no_catalogo,
       COUNT(*) FILTER (WHERE NOT ativo_catalogo)::int AS fora_catalogo,
       COUNT(*) FILTER (WHERE NOT ativo_rp)::int AS inativos_rp,
       COUNT(*) FILTER (WHERE categoria_id IS NULL)::int AS sem_categoria
     FROM padaria_produto
     WHERE origem = 'manual'`
  );

  params.push(lim, off);
  const { rows } = await getPool().query(
    `${SELECT_PRODUTO}
     ${where}
     ORDER BY p.ativo_catalogo DESC, COALESCE(c.ordem, 9999), COALESCE(p.nome_catalogo, p.nome_rp)
     LIMIT $${i} OFFSET $${i + 1}`,
    params
  );

  const stats = statsRes.rows[0] || {};
  return {
    produtos: rows.map((r) => mapProduto(r)),
    total: countRes.rows[0]?.total ?? 0,
    limite: lim,
    offset: off,
    stats: {
      total: stats.total || 0,
      noCatalogo: stats.no_catalogo || 0,
      foraCatalogo: stats.fora_catalogo || 0,
      inativosRp: stats.inativos_rp || 0,
      semCategoria: stats.sem_categoria || 0,
    },
  };
}

export async function obterProdutoAdmin(codigo) {
  const { rows } = await getPool().query(
    `${SELECT_PRODUTO}
     WHERE p.codigo = $1 AND p.origem = 'manual'`,
    [String(codigo)]
  );
  const produto = mapProduto(rows[0]);
  if (!produto) return null;
  produto.decoracoes = await listarDecoracoesPorProduto(produto.codigo, {
    apenasAtivas: false,
  });
  return produto;
}

export async function atualizarProdutoPadaria(codigo, dados = {}) {
  const atual = await obterProdutoAdmin(codigo);
  if (!atual) throw new Error("Produto não encontrado");

  const campos = [];
  const params = [String(codigo)];
  let i = 2;

  if (dados.nomeCatalogo !== undefined) {
    campos.push(`nome_catalogo = $${i++}`);
    params.push(String(dados.nomeCatalogo || "").trim() || null);
  }
  if (dados.descricao !== undefined) {
    campos.push(`descricao = $${i++}`);
    params.push(String(dados.descricao || "").trim() || null);
  }
  if (dados.cobertura !== undefined) {
    campos.push(`cobertura = $${i++}`);
    params.push(String(dados.cobertura || "").trim() || null);
  }
  if (dados.recheio !== undefined) {
    campos.push(`recheio = $${i++}`);
    params.push(String(dados.recheio || "").trim() || null);
  }
  if (dados.imagemUrl !== undefined) {
    campos.push(`imagem_url = $${i++}`);
    params.push(String(dados.imagemUrl || "").trim() || null);
  }
  if (dados.vendaPorKg != null) {
    const porKg = Boolean(dados.vendaPorKg);
    campos.push(`venda_por_kg = $${i++}`);
    params.push(porKg);
    campos.push(`unidade_medida = $${i++}`);
    params.push(porKg ? "KG" : "UN");
  } else if (dados.unidadeMedida) {
    campos.push(`unidade_medida = $${i++}`);
    params.push(String(dados.unidadeMedida).toUpperCase().slice(0, 10));
  }
  if (dados.ativoCatalogo != null) {
    campos.push(`ativo_catalogo = $${i++}`);
    params.push(Boolean(dados.ativoCatalogo));
  }
  if (dados.categoriaId !== undefined) {
    campos.push(`categoria_id = $${i++}`);
    const raw = dados.categoriaId;
    params.push(raw === null || raw === "" ? null : Number(raw));
  }

  if (!campos.length) return atual;

  campos.push("atualizado_em = NOW()");

  const { rows } = await getPool().query(
    `UPDATE padaria_produto SET ${campos.join(", ")}
     WHERE codigo = $1 AND origem = 'manual'
     RETURNING *`,
    params
  );

  if (!rows[0]) throw new Error("Produto não encontrado");
  const produto = await obterProdutoAdmin(codigo);
  await registrarAuditoriaPadaria({
    acao: "produto_atualizado",
    entidade: "produto",
    entidadeId: codigo,
    dados: {
      ativoCatalogo: produto?.ativoCatalogo,
      categoriaId: produto?.categoriaId,
      nomeCatalogo: produto?.nomeCatalogo,
    },
  });
  return produto;
}

export async function definirImagemProduto(codigo, imagemUrl) {
  return atualizarProdutoPadaria(codigo, { imagemUrl });
}

/** Recarrega um código já cadastrado a partir do RP. */
export async function sincronizarProdutoCodigo(codigo) {
  const atual = await obterProdutoAdmin(codigo);
  if (!atual) {
    throw new Error("Produto não cadastrado. Use buscar e ativar pelo código.");
  }
  const config = await obterConfigPadaria();
  const unidade = config.unidade_rp || "001";
  const resultado = await buscarProdutoUnidadePorCodigo(codigo, unidade);
  if (!resultado.ok || !resultado.produto) {
    throw new Error(resultado.error || "Produto não encontrado no RP");
  }
  const extraido = extrairProdutoRp(resultado.produto);
  if (!extraido.codigo) throw new Error("Código inválido no RP");
  await upsertProdutoDoRp(extraido, { origem: "manual" });
  return obterProdutoAdmin(extraido.codigo);
}
