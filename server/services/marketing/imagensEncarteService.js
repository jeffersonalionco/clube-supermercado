import { randomUUID } from "node:crypto";
import { getPool } from "../../db.js";

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function idImagemEncarte(valor) {
  return typeof valor === "string" && ID.test(valor) ? valor : null;
}

export function tipoImagemEncarte(buffer) {
  if (!buffer || buffer.length < 16) return null;
  if (buffer.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) return "image/png";
  if (buffer.subarray(0, 3).equals(Buffer.from("ffd8ff", "hex"))) return "image/jpeg";
  if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

export async function salvarImagemEncarte(codigo, descricao, tipo, conteudo, { apenasSeAusente = false } = {}) {
  const db = await getPool().connect();
  try {
    await db.query("BEGIN");
    await db.query("SELECT pg_advisory_xact_lock(hashtext('encarte-imagem'), hashtext($1))", [codigo]);
    if (apenasSeAusente) {
      const { rows } = await db.query(`
        SELECT id, codigo, descricao, criado_em FROM marketing_encarte_imagem
        WHERE codigo = $1 ORDER BY revisao DESC LIMIT 1
      `, [codigo]);
      if (rows[0]) {
        await db.query("COMMIT");
        return rows[0];
      }
    }
    const { rows } = await db.query(`
      INSERT INTO marketing_encarte_imagem (id, codigo, descricao, tipo, conteudo)
      VALUES ($1, $2, $3, $4, $5) RETURNING id, codigo, descricao, criado_em
    `, [randomUUID(), codigo, descricao, tipo, conteudo]);
    await db.query("COMMIT");
    return rows[0];
  } catch (erro) {
    await db.query("ROLLBACK");
    throw erro;
  } finally {
    db.release();
  }
}

export async function listarImagensEncarte(busca, pagina) {
  const limite = 24;
  const { rows } = await getPool().query(`
    SELECT * FROM (
      SELECT DISTINCT ON (codigo) id, codigo, descricao, criado_em
      FROM marketing_encarte_imagem WHERE codigo ~ '^[0-9]+$' ORDER BY codigo, revisao DESC
    ) AS recentes
    WHERE strpos(lower(descricao), lower($1)) > 0 OR strpos(codigo, $1) > 0
    ORDER BY criado_em DESC, id DESC LIMIT $2 OFFSET $3
  `, [busca, limite + 1, (pagina - 1) * limite]);
  return { imagens: rows.slice(0, limite), temMais: rows.length > limite };
}

export async function imagensAtuaisEncarte(codigos) {
  if (!codigos.length) return new Map();
  const { rows } = await getPool().query(`
    SELECT DISTINCT ON (codigo) codigo, id FROM marketing_encarte_imagem
    WHERE codigo = ANY($1::text[]) ORDER BY codigo, revisao DESC
  `, [codigos]);
  return new Map(rows.map(({ codigo, id }) => [codigo, id]));
}

export async function conferirImagensEncarte(itens) {
  const vinculados = itens.filter((item) => item.imagemId);
  if (!vinculados.length) return true;
  const { rows } = await getPool().query(
    "SELECT id, codigo FROM marketing_encarte_imagem WHERE id = ANY($1::uuid[])",
    [vinculados.map((item) => item.imagemId)]
  );
  const codigos = new Map(rows.map(({ id, codigo }) => [id, codigo]));
  return vinculados.every((item) => codigos.get(item.imagemId) === item.codigo);
}

export async function servirImagemEncarte(req, res) {
  const id = idImagemEncarte(req.params.id);
  if (!id) return res.sendStatus(404);
  try {
    const { rows } = await getPool().query(
      "SELECT tipo, conteudo FROM marketing_encarte_imagem WHERE id = $1", [id]
    );
    const imagem = rows[0];
    if (!imagem) return res.sendStatus(404);
    res.removeHeader("Pragma");
    res.removeHeader("Expires");
    res.set("Cache-Control", "public, max-age=31536000, immutable");
    res.type(imagem.tipo).send(imagem.conteudo);
  } catch (erro) {
    console.error("[encartes/imagens]", erro.message);
    res.sendStatus(500);
  }
}
