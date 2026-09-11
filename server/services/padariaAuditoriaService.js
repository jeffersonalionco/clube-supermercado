import { getPool } from "../db.js";

export async function registrarAuditoriaPadaria({
  usuarioId = null,
  usuarioNome = null,
  acao,
  entidade,
  entidadeId = null,
  dados = null,
} = {}) {
  if (!acao || !entidade) return;
  try {
    await getPool().query(
      `INSERT INTO padaria_auditoria (
         usuario_id, usuario_nome, acao, entidade, entidade_id, dados
       ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [
        usuarioId || null,
        usuarioNome ? String(usuarioNome).slice(0, 200) : null,
        String(acao).slice(0, 80),
        String(entidade).slice(0, 80),
        entidadeId != null ? String(entidadeId).slice(0, 80) : null,
        dados != null ? JSON.stringify(dados) : null,
      ]
    );
  } catch (error) {
    console.error("[padaria/auditoria]", error.message);
  }
}
