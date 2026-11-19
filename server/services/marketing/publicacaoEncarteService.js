import { randomUUID } from "node:crypto";
import { getPool } from "../../db.js";
import { obterFormatoCampanhaEncarte } from "../../../shared/modelosEncarte.js";
import { idImagemEncarte, tipoImagemEncarte } from "./imagensEncarteService.js";

export function dimensoesPublicacaoValidas(buffer, modelo) {
  return tipoImagemEncarte(buffer) === "image/png" &&
    buffer.length >= 33 &&
    buffer.toString("ascii", 12, 16) === "IHDR" &&
    buffer.readUInt32BE(16) === modelo.largura * 2 &&
    buffer.readUInt32BE(20) === modelo.altura * 2;
}

export async function listarPublicacoesEncarte(encarteId) {
  const { rows } = await getPool().query(
    "SELECT id, pagina, formato FROM marketing_encarte_publicacao WHERE encarte_id = $1 ORDER BY formato, pagina",
    [encarteId]
  );
  return rows;
}

export async function publicarPaginaEncarte(encarteId, pagina, conteudo, formatoSolicitado) {
  const db = getPool();
  const { rows: encartes } = await db.query(
    "SELECT dados FROM marketing_encarte WHERE id = $1 AND finalizado_em IS NOT NULL", [encarteId]
  );
  if (!encartes[0]) return { status: 404, error: "Encarte finalizado não encontrado." };
  const dados = encartes[0].dados;
  const modelo = obterFormatoCampanhaEncarte(dados, formatoSolicitado);
  if (!modelo) return { status: 400, error: "Formato indisponível neste encarte." };
  // A publicação do formato principal usa a mesma chave dos links já existentes.
  const formato = modelo.id === obterFormatoCampanhaEncarte(dados).id ? "" : modelo.id;
  const total = Math.ceil(dados.itens.length / (modelo.colunas * modelo.linhas));
  if (pagina < 1 || pagina > total || !dimensoesPublicacaoValidas(conteudo, modelo)) {
    return { status: 400, error: "A imagem precisa ser um PNG nas dimensões da página do encarte." };
  }

  const { rows } = await db.query(`
    INSERT INTO marketing_encarte_publicacao (id, encarte_id, pagina, conteudo, formato)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (encarte_id, formato, pagina) DO NOTHING
    RETURNING id, pagina, formato
  `, [randomUUID(), encarteId, pagina, conteudo, formato]);
  if (rows[0]) return { publicacao: rows[0] };

  const existente = await db.query(
    "SELECT id, pagina, formato FROM marketing_encarte_publicacao WHERE encarte_id = $1 AND pagina = $2 AND formato = $3",
    [encarteId, pagina, formato]
  );
  return { publicacao: existente.rows[0] };
}

export async function servirEncartePublicado(req, res) {
  const id = idImagemEncarte(req.params.id);
  if (!id) return res.sendStatus(404);
  try {
    const { rows } = await getPool().query(
      "SELECT conteudo FROM marketing_encarte_publicacao WHERE id = $1", [id]
    );
    if (!rows[0]) return res.sendStatus(404);
    res.removeHeader("Pragma");
    res.removeHeader("Expires");
    res.set({
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
    });
    return res.type("png").send(rows[0].conteudo);
  } catch (erro) {
    console.error("[encartes/publicados]", erro.message);
    return res.sendStatus(500);
  }
}
