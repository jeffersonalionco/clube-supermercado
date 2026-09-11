import { getPool } from "../db.js";
import { registrarAuditoriaPadaria } from "./padariaAuditoriaService.js";

function slugify(nome) {
  return String(nome || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function mapCategoria(row) {
  if (!row) return null;
  return {
    id: row.id,
    nome: row.nome,
    slug: row.slug,
    ordem: row.ordem,
    cor: row.cor || "#0f766e",
    ativo: Boolean(row.ativo),
    criadoEm: row.criado_em,
    atualizadoEm: row.atualizado_em,
  };
}

export async function listarCategoriasPadaria({ apenasAtivas = false } = {}) {
  const where = apenasAtivas ? "WHERE ativo = true" : "";
  const { rows } = await getPool().query(
    `SELECT * FROM padaria_categoria ${where} ORDER BY ordem ASC, nome ASC`
  );
  return rows.map(mapCategoria);
}

export async function criarCategoriaPadaria({ nome, cor, ordem } = {}) {
  const nomeLimpo = String(nome || "").trim();
  if (nomeLimpo.length < 2) throw new Error("Informe o nome da categoria");
  let slug = slugify(nomeLimpo);
  if (!slug) slug = `cat-${Date.now()}`;

  const { rows } = await getPool().query(
    `INSERT INTO padaria_categoria (nome, slug, ordem, cor)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [
      nomeLimpo,
      slug,
      Number.isFinite(Number(ordem)) ? Number(ordem) : 100,
      String(cor || "#0f766e").slice(0, 20),
    ]
  );
  const cat = mapCategoria(rows[0]);
  await registrarAuditoriaPadaria({
    acao: "categoria_criada",
    entidade: "categoria",
    entidadeId: cat.id,
    dados: { nome: cat.nome },
  });
  return cat;
}

export async function atualizarCategoriaPadaria(id, dados = {}) {
  const campos = [];
  const params = [Number(id)];
  let i = 2;

  if (dados.nome !== undefined) {
    const nomeLimpo = String(dados.nome || "").trim();
    if (nomeLimpo.length < 2) throw new Error("Informe o nome da categoria");
    campos.push(`nome = $${i++}`);
    params.push(nomeLimpo);
    campos.push(`slug = $${i++}`);
    params.push(slugify(nomeLimpo) || `cat-${id}`);
  }
  if (dados.cor !== undefined) {
    campos.push(`cor = $${i++}`);
    params.push(String(dados.cor || "#0f766e").slice(0, 20));
  }
  if (dados.ordem !== undefined) {
    campos.push(`ordem = $${i++}`);
    params.push(Number(dados.ordem) || 0);
  }
  if (dados.ativo != null) {
    campos.push(`ativo = $${i++}`);
    params.push(Boolean(dados.ativo));
  }

  if (!campos.length) {
    const { rows } = await getPool().query(
      `SELECT * FROM padaria_categoria WHERE id = $1`,
      [Number(id)]
    );
    return mapCategoria(rows[0]);
  }

  campos.push("atualizado_em = NOW()");
  const { rows } = await getPool().query(
    `UPDATE padaria_categoria SET ${campos.join(", ")}
     WHERE id = $1
     RETURNING *`,
    params
  );
  if (!rows[0]) throw new Error("Categoria não encontrada");
  const cat = mapCategoria(rows[0]);
  await registrarAuditoriaPadaria({
    acao: "categoria_atualizada",
    entidade: "categoria",
    entidadeId: cat.id,
    dados: { nome: cat.nome, ativo: cat.ativo, ordem: cat.ordem },
  });
  return cat;
}

export async function excluirCategoriaPadaria(id) {
  const catId = Number(id);
  const { rows: uso } = await getPool().query(
    `SELECT COUNT(*)::int AS n FROM padaria_produto WHERE categoria_id = $1`,
    [catId]
  );
  if (uso[0]?.n > 0) {
    throw new Error(
      `Não é possível excluir: ${uso[0].n} produto(s) ainda usam esta categoria. Reatribua ou desative-a.`
    );
  }
  const { rowCount } = await getPool().query(
    `DELETE FROM padaria_categoria WHERE id = $1`,
    [catId]
  );
  if (!rowCount) throw new Error("Categoria não encontrada");
  await registrarAuditoriaPadaria({
    acao: "categoria_excluida",
    entidade: "categoria",
    entidadeId: catId,
  });
  return { ok: true };
}
