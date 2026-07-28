import { getPool } from "../db.js";

function mapNovidade(row) {
  if (!row) return null;
  return {
    id: row.id,
    titulo: row.titulo,
    resumo: row.resumo,
    corpo: row.corpo,
    imagemUrl: row.imagem_url,
    ativo: Boolean(row.ativo),
    publicadoEm: row.publicado_em,
    criadoEm: row.criado_em,
    atualizadoEm: row.atualizado_em,
  };
}

export function mapNovidadePublica(row) {
  const n = mapNovidade(row);
  if (!n) return null;
  return {
    id: n.id,
    titulo: n.titulo,
    resumo: n.resumo,
    corpo: n.corpo,
    imagemUrl: n.imagemUrl,
    publicadoEm: n.publicadoEm,
  };
}

export async function listarNovidadesPublicas({ limite = 50 } = {}) {
  const lim = Math.min(Math.max(Number(limite) || 50, 1), 100);
  const { rows } = await getPool().query(
    `SELECT id, titulo, resumo, corpo, imagem_url, ativo, publicado_em, criado_em, atualizado_em
     FROM novidade
     WHERE ativo = true
     ORDER BY COALESCE(publicado_em, criado_em) DESC, id DESC
     LIMIT $1`,
    [lim]
  );
  return rows.map(mapNovidadePublica);
}

export async function buscarNovidadePublica(id) {
  const { rows } = await getPool().query(
    `SELECT id, titulo, resumo, corpo, imagem_url, ativo, publicado_em, criado_em, atualizado_em
     FROM novidade
     WHERE id = $1 AND ativo = true`,
    [id]
  );
  return mapNovidadePublica(rows[0] || null);
}

export async function listarNovidadesAdmin() {
  const { rows } = await getPool().query(
    `SELECT id, titulo, resumo, corpo, imagem_url, ativo, publicado_em, criado_em, atualizado_em
     FROM novidade
     ORDER BY COALESCE(publicado_em, criado_em) DESC, id DESC`
  );
  return rows.map(mapNovidade);
}

export async function buscarNovidadeAdmin(id) {
  const { rows } = await getPool().query(
    `SELECT id, titulo, resumo, corpo, imagem_url, ativo, publicado_em, criado_em, atualizado_em
     FROM novidade WHERE id = $1`,
    [id]
  );
  return mapNovidade(rows[0] || null);
}

export function validarNovidadeInput(body, { parcial = false } = {}) {
  const titulo = String(body?.titulo ?? "").trim();
  const resumo = String(body?.resumo ?? "").trim();
  const corpo = String(body?.corpo ?? "").trim();
  const imagemUrl =
    body?.imagemUrl != null ? String(body.imagemUrl).trim() : body?.imagem_url != null
      ? String(body.imagem_url).trim()
      : "";

  if (!parcial || body?.titulo != null) {
    if (!titulo || titulo.length > 160) {
      return { ok: false, error: "Informe um título com até 160 caracteres" };
    }
  }
  if (!parcial || body?.resumo != null) {
    if (resumo.length > 400) {
      return { ok: false, error: "Resumo deve ter até 400 caracteres" };
    }
  }
  if (!parcial || body?.corpo != null) {
    if (!corpo || corpo.length > 20000) {
      return { ok: false, error: "Informe o texto da novidade (até 20 mil caracteres)" };
    }
  }
  if (imagemUrl && imagemUrl.length > 500) {
    return { ok: false, error: "URL da imagem muito longa" };
  }

  const ativo =
    body?.ativo === undefined ? undefined : Boolean(body.ativo);

  return {
    ok: true,
    data: {
      titulo: parcial && body?.titulo == null ? undefined : titulo,
      resumo: parcial && body?.resumo == null ? undefined : resumo,
      corpo: parcial && body?.corpo == null ? undefined : corpo,
      imagemUrl:
        body?.imagemUrl === undefined && body?.imagem_url === undefined
          ? undefined
          : imagemUrl || null,
      ativo,
    },
  };
}

export async function criarNovidade(input) {
  const { rows } = await getPool().query(
    `INSERT INTO novidade (titulo, resumo, corpo, imagem_url, ativo, publicado_em)
     VALUES ($1, $2, $3, $4, $5, CASE WHEN $5 THEN NOW() ELSE NULL END)
     RETURNING id, titulo, resumo, corpo, imagem_url, ativo, publicado_em, criado_em, atualizado_em`,
    [
      input.titulo,
      input.resumo || "",
      input.corpo,
      input.imagemUrl || null,
      input.ativo !== false,
    ]
  );
  return mapNovidade(rows[0]);
}

export async function atualizarNovidade(id, input) {
  const atual = await buscarNovidadeAdmin(id);
  if (!atual) return null;

  const titulo = input.titulo ?? atual.titulo;
  const resumo = input.resumo ?? atual.resumo ?? "";
  const corpo = input.corpo ?? atual.corpo;
  const imagemUrl =
    input.imagemUrl !== undefined ? input.imagemUrl : atual.imagemUrl;
  const ativo = input.ativo !== undefined ? input.ativo : atual.ativo;

  const { rows } = await getPool().query(
    `UPDATE novidade
     SET titulo = $2,
         resumo = $3,
         corpo = $4,
         imagem_url = $5,
         ativo = $6,
         publicado_em = CASE
           WHEN $6 AND publicado_em IS NULL THEN NOW()
           WHEN NOT $6 THEN publicado_em
           ELSE publicado_em
         END,
         atualizado_em = NOW()
     WHERE id = $1
     RETURNING id, titulo, resumo, corpo, imagem_url, ativo, publicado_em, criado_em, atualizado_em`,
    [id, titulo, resumo, corpo, imagemUrl, ativo]
  );
  return mapNovidade(rows[0]);
}

export async function excluirNovidade(id) {
  const { rowCount } = await getPool().query(
    `DELETE FROM novidade WHERE id = $1`,
    [id]
  );
  return rowCount > 0;
}
