/**
 * Sync de produtos da padaria → Catálogo Meta (Commerce / WhatsApp).
 *
 * Requer no .env:
 *   META_CATALOG_ID=...          (ID do catálogo no Commerce Manager)
 *   META_CATALOG_TOKEN=...       (opcional; senão usa WHATSAPP_CLOUD_TOKEN)
 *
 * O token precisa da permissão catalog_management (e acesso ao catálogo
 * no Business Manager → Usuário do sistema → Ativos).
 */
import { getPool } from "../../db.js";

function apiVersion() {
  return String(process.env.WHATSAPP_CLOUD_API_VERSION || "v21.0").replace(
    /^\/*/,
    ""
  );
}

export function metaCatalogConfigurado() {
  return Boolean(
    String(process.env.META_CATALOG_ID || "").trim() &&
      (String(process.env.META_CATALOG_TOKEN || "").trim() ||
        String(process.env.WHATSAPP_CLOUD_TOKEN || "").trim())
  );
}

function catalogToken() {
  return (
    String(process.env.META_CATALOG_TOKEN || "").trim() ||
    String(process.env.WHATSAPP_CLOUD_TOKEN || "").trim()
  );
}

function catalogId() {
  return String(process.env.META_CATALOG_ID || "").trim();
}

function appPublicBase() {
  return String(process.env.APP_PUBLIC_URL || "")
    .trim()
    .replace(/\/$/, "");
}

export function urlPublicaImagem(imagemUrl) {
  const raw = String(imagemUrl || "").trim();
  if (!raw) return null;
  if (/^https:\/\//i.test(raw)) return raw;
  const base = appPublicBase();
  if (!base || !/^https:\/\//i.test(base)) return null;
  if (raw.startsWith("/")) return `${base}${raw}`;
  return `${base}/${raw}`;
}

function formatarPrecoMeta(preco) {
  const n = Number(preco);
  if (!Number.isFinite(n) || n < 0) return null;
  return `${n.toFixed(2)} BRL`;
}

const META_BRAND = "Padaria Superama";

function montarProductType(produto) {
  const cat = String(produto.categoriaNome || "").trim();
  if (cat) return `${META_BRAND} > ${cat}`.slice(0, 750);
  return META_BRAND;
}

function montarDescricao(produto) {
  const partes = [];
  if (produto.categoriaNome) {
    partes.push(`Categoria: ${String(produto.categoriaNome).trim()}`);
  }
  if (produto.descricao) partes.push(String(produto.descricao).trim());
  if (produto.recheio) partes.push(`Recheio: ${String(produto.recheio).trim()}`);
  if (produto.cobertura) {
    partes.push(`Cobertura: ${String(produto.cobertura).trim()}`);
  }
  if (produto.vendaPorKg || produto.unidadeMedida === "KG") {
    partes.push("Preço por kg. Peso final na balança da padaria.");
  }
  partes.push(`${META_BRAND} — peça pelo WhatsApp ou na loja.`);
  return partes.filter(Boolean).join("\n").slice(0, 9000);
}

function mapRowProduto(row) {
  if (!row) return null;
  return {
    codigo: row.codigo,
    nome:
      String(row.nome_catalogo || row.nome_rp || "").trim() || row.codigo,
    preco: Number(row.preco) || 0,
    unidadeMedida: row.unidade_medida || "UN",
    vendaPorKg: Boolean(row.venda_por_kg),
    ativoRp: Boolean(row.ativo_rp),
    ativoCatalogo: Boolean(row.ativo_catalogo),
    syncMetaCatalog: Boolean(row.sync_meta_catalog),
    descricao: row.descricao,
    cobertura: row.cobertura,
    recheio: row.recheio,
    imagemUrl: row.imagem_url,
    categoriaId: row.categoria_id ?? null,
    categoriaNome: row.categoria_nome || null,
    metaPrecoEnviado:
      row.meta_preco_enviado != null ? Number(row.meta_preco_enviado) : null,
    metaSyncEm: row.meta_sync_em,
    metaSyncErro: row.meta_sync_erro,
  };
}

const SQL_PRODUTO_COM_CATEGORIA = `
  SELECT p.*,
         c.nome AS categoria_nome,
         c.slug AS categoria_slug
  FROM padaria_produto p
  LEFT JOIN padaria_categoria c ON c.id = p.categoria_id
`;

async function graphPost(path, body) {
  const url = `https://graph.facebook.com/${apiVersion()}/${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${catalogToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    const msg =
      data?.error?.message ||
      data?.error?.error_user_msg ||
      `HTTP ${res.status}`;
    const err = new Error(msg);
    err.code = data?.error?.code;
    err.raw = data;
    throw err;
  }
  return data;
}

/**
 * Envia/atualiza um item no catálogo Meta (assíncrono na Meta).
 */
export async function enviarProdutoParaCatalogoMeta(produto, { soPreco = false } = {}) {
  if (!metaCatalogConfigurado()) {
    throw new Error(
      "Configure META_CATALOG_ID (e token com permissão catalog_management) no .env"
    );
  }

  const retailerId = String(produto.codigo);
  const price = formatarPrecoMeta(produto.preco);
  if (!price) throw new Error("Preço inválido para o catálogo Meta");

  const availability =
    produto.ativoRp && produto.ativoCatalogo ? "in stock" : "out of stock";

  let data;
  if (soPreco) {
    data = {
      id: retailerId,
      price,
      availability,
    };
  } else {
    const imageLink = urlPublicaImagem(produto.imagemUrl);
    if (!imageLink) {
      throw new Error(
        "Produto sem imagem HTTPS pública (APP_PUBLIC_URL + foto no admin)"
      );
    }
    const base =
      appPublicBase() || "https://clube.mercadosuperama.com.br";
    data = {
      id: retailerId,
      title: String(produto.nome).slice(0, 200),
      description: montarDescricao(produto),
      availability,
      condition: "new",
      price,
      link: `${base}/#/padaria?codigo=${encodeURIComponent(retailerId)}`,
      image_link: imageLink,
      brand: META_BRAND,
      product_type: montarProductType(produto),
    };
  }

  const resultado = await graphPost(`${catalogId()}/items_batch`, {
    item_type: "PRODUCT_ITEM",
    allow_upsert: true,
    requests: [
      {
        method: "UPDATE",
        data,
      },
    ],
  });

  // Meta pode devolver erros de validação sem HTTP 4xx
  const validation = resultado.validation_status || [];
  const errs = validation.flatMap((v) => v.errors || []);
  if (errs.length) {
    throw new Error(errs.map((e) => e.message).join("; ") || "validação Meta");
  }

  const handle =
    resultado.handle ||
    (Array.isArray(resultado.handles) ? resultado.handles[0] : null);

  return {
    ok: true,
    handle,
    retailerId,
    price,
  };
}

async function marcarSyncResultado(codigo, { ok, preco, erro }) {
  if (ok) {
    await getPool().query(
      `UPDATE padaria_produto SET
         meta_preco_enviado = $2,
         meta_sync_em = NOW(),
         meta_sync_erro = NULL,
         atualizado_em = NOW()
       WHERE codigo = $1`,
      [codigo, preco]
    );
  } else {
    await getPool().query(
      `UPDATE padaria_produto SET
         meta_sync_erro = $2,
         meta_sync_em = NOW(),
         atualizado_em = NOW()
       WHERE codigo = $1`,
      [codigo, String(erro || "erro").slice(0, 500)]
    );
  }
}

/**
 * Sincroniza um produto marcado (ou força). Se o preço local = último enviado,
 * só reenvia se force=true.
 */
export async function sincronizarProdutoMetaCatalog(
  codigo,
  { force = false, soPreco = false } = {}
) {
  const { rows } = await getPool().query(
    `${SQL_PRODUTO_COM_CATEGORIA} WHERE p.codigo = $1`,
    [String(codigo)]
  );
  const produto = mapRowProduto(rows[0]);
  if (!produto) throw new Error("Produto não encontrado");
  if (!produto.syncMetaCatalog && !force) {
    return { ok: true, skipped: true, motivo: "sync_meta_desligado" };
  }

  const precoAtual = Number(produto.preco) || 0;
  if (
    !force &&
    soPreco &&
    produto.metaPrecoEnviado != null &&
    Math.abs(produto.metaPrecoEnviado - precoAtual) < 0.001
  ) {
    return { ok: true, skipped: true, motivo: "preco_igual" };
  }

  try {
    const r = await enviarProdutoParaCatalogoMeta(produto, {
      soPreco: soPreco && produto.metaPrecoEnviado != null && !force,
    });
    await marcarSyncResultado(codigo, { ok: true, preco: precoAtual });
    console.log(
      "[meta/catalog] sync ok",
      codigo,
      r.price,
      r.handle ? `handle=${r.handle}` : ""
    );
    return { ok: true, ...r, preco: precoAtual };
  } catch (err) {
    await marcarSyncResultado(codigo, { ok: false, erro: err.message });
    console.warn("[meta/catalog] sync falhou", codigo, err.message);
    return { ok: false, error: err.message, code: err.code };
  }
}

/** Após update de preço no RP — empurra para Meta se marcado. */
export async function aposAtualizarPrecoPadaria(codigo, precoAnterior, precoNovo) {
  try {
    const { rows } = await getPool().query(
      `SELECT sync_meta_catalog FROM padaria_produto WHERE codigo = $1`,
      [String(codigo)]
    );
    if (!rows[0]?.sync_meta_catalog) return;
    const a = Number(precoAnterior);
    const b = Number(precoNovo);
    if (Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 0.001) {
      return;
    }
    await sincronizarProdutoMetaCatalog(codigo, { soPreco: true });
  } catch (err) {
    console.warn("[meta/catalog] apos preco:", err.message);
  }
}

export async function definirSyncMetaCatalog(codigo, ligado) {
  const { rows } = await getPool().query(
    `UPDATE padaria_produto SET
       sync_meta_catalog = $2,
       atualizado_em = NOW()
     WHERE codigo = $1
     RETURNING codigo`,
    [String(codigo), Boolean(ligado)]
  );
  if (!rows[0]) throw new Error("Produto não encontrado");
  if (ligado) {
    const sync = await sincronizarProdutoMetaCatalog(codigo, { force: true });
    const { rows: full } = await getPool().query(
      `${SQL_PRODUTO_COM_CATEGORIA} WHERE p.codigo = $1`,
      [String(codigo)]
    );
    return { produto: mapRowProduto(full[0]), sync };
  }
  const { rows: full } = await getPool().query(
    `${SQL_PRODUTO_COM_CATEGORIA} WHERE p.codigo = $1`,
    [String(codigo)]
  );
  return {
    produto: mapRowProduto(full[0]),
    sync: { ok: true, skipped: true, motivo: "desligado" },
  };
}

export async function sincronizarTodosMetaCatalog({ force = false } = {}) {
  const { rows } = await getPool().query(
    `SELECT codigo FROM padaria_produto
     WHERE sync_meta_catalog = TRUE
     ORDER BY codigo`
  );
  const resultados = [];
  for (const row of rows) {
    resultados.push({
      codigo: row.codigo,
      ...(await sincronizarProdutoMetaCatalog(row.codigo, {
        force,
        soPreco: !force,
      })),
    });
  }
  return {
    total: rows.length,
    ok: resultados.filter((r) => r.ok && !r.skipped).length,
    skipped: resultados.filter((r) => r.skipped).length,
    falhas: resultados.filter((r) => !r.ok).length,
    resultados,
  };
}

/**
 * Marca sync_meta em todos os produtos do catálogo ativo (com foto)
 * e envia para a Meta com brand/categoria "Padaria Superama".
 */
export async function sincronizarCatalogoAtivoPadariaMeta() {
  if (!metaCatalogConfigurado()) {
    throw new Error(
      "Configure META_CATALOG_ID (e token com permissão catalog_management) no .env"
    );
  }

  const marcado = await getPool().query(
    `UPDATE padaria_produto SET
       sync_meta_catalog = TRUE,
       atualizado_em = NOW()
     WHERE ativo_catalogo = TRUE
       AND COALESCE(TRIM(imagem_url), '') <> ''
     RETURNING codigo`
  );

  const resultados = [];
  for (const row of marcado.rows) {
    resultados.push({
      codigo: row.codigo,
      ...(await sincronizarProdutoMetaCatalog(row.codigo, { force: true })),
    });
  }

  const semImagem = await getPool().query(
    `SELECT codigo FROM padaria_produto
     WHERE ativo_catalogo = TRUE
       AND COALESCE(TRIM(imagem_url), '') = ''
     ORDER BY codigo`
  );

  return {
    marcados: marcado.rowCount,
    total: resultados.length,
    ok: resultados.filter((r) => r.ok && !r.skipped).length,
    falhas: resultados.filter((r) => !r.ok).length,
    semImagem: semImagem.rows.map((r) => r.codigo),
    resultados,
  };
}

/**
 * Job: puxa preço do RP e, se mudou, atualiza Meta.
 * Chamado periodicamente quando META_CATALOG_ID está configurado.
 */
let jobTimer = null;

export function iniciarJobSyncPrecoMetaCatalog() {
  if (jobTimer) return;
  const min = Number(process.env.META_CATALOG_SYNC_MIN || 30);
  if (!Number.isFinite(min) || min <= 0) return;
  if (!metaCatalogConfigurado()) {
    console.log(
      "[meta/catalog] job off — defina META_CATALOG_ID e token com catalog_management"
    );
    return;
  }
  const ms = Math.max(5, min) * 60 * 1000;
  const tick = async () => {
    try {
      const { atualizarProdutosMarcadosMeta } = await import(
        "../padariaProdutosService.js"
      );
      await atualizarProdutosMarcadosMeta();
    } catch (err) {
      console.warn("[meta/catalog] job:", err.message);
    }
  };
  jobTimer = setInterval(tick, ms);
  // primeira passagem após 45s (deixa o server subir)
  setTimeout(tick, 45_000);
  console.log(`[meta/catalog] job a cada ${Math.max(5, min)} min`);
}
