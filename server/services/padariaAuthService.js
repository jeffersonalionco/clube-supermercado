import bcrypt from "bcrypt";
import { getPool } from "../db.js";
import { criarTokenPadaria } from "./padariaToken.js";
import { registrarAuditoriaPadaria } from "./padariaAuditoriaService.js";

const SALT_ROUNDS = 10;
const PAPEIS = new Set(["atendente", "padaria", "gestor"]);

function mapUsuario(row) {
  if (!row) return null;
  return {
    id: row.id,
    login: row.login,
    nome: row.nome,
    papel: row.papel,
    ativo: row.ativo,
    ultimoAcessoEm: row.ultimo_acesso_em || null,
    criadoEm: row.criado_em,
    atualizadoEm: row.atualizado_em,
  };
}

export async function autenticarUsuarioPadaria(login, senha) {
  const loginNorm = String(login || "").trim().toLowerCase();
  if (!loginNorm || !senha) {
    return { ok: false, error: "Informe usuário e senha" };
  }

  const { rows } = await getPool().query(
    `SELECT * FROM padaria_usuario WHERE lower(login) = $1 LIMIT 1`,
    [loginNorm]
  );
  const usuario = rows[0];
  if (!usuario || !usuario.ativo) {
    return { ok: false, error: "Usuário ou senha inválidos" };
  }

  const ok = await bcrypt.compare(String(senha), usuario.senha_hash);
  if (!ok) {
    return { ok: false, error: "Usuário ou senha inválidos" };
  }

  await getPool().query(
    `UPDATE padaria_usuario SET ultimo_acesso_em = NOW(), atualizado_em = NOW()
     WHERE id = $1`,
    [usuario.id]
  );

  const token = criarTokenPadaria({
    id: usuario.id,
    login: usuario.login,
    nome: usuario.nome,
    papel: usuario.papel,
  });

  return { ok: true, token, usuario: mapUsuario(usuario) };
}

export async function listarUsuariosPadaria() {
  const { rows } = await getPool().query(
    `SELECT id, login, nome, papel, ativo, ultimo_acesso_em, criado_em, atualizado_em
     FROM padaria_usuario
     ORDER BY nome`
  );
  return rows.map(mapUsuario);
}

export async function criarUsuarioPadaria({ login, senha, nome, papel }) {
  const loginNorm = String(login || "").trim().toLowerCase();
  const nomeNorm = String(nome || "").trim();
  const papelNorm = String(papel || "").trim();

  if (!loginNorm || loginNorm.length < 3) {
    throw new Error("Login deve ter ao menos 3 caracteres");
  }
  if (!nomeNorm) throw new Error("Informe o nome");
  if (!PAPEIS.has(papelNorm)) {
    throw new Error("Papel inválido (atendente, padaria ou gestor)");
  }
  if (!senha || String(senha).length < 6) {
    throw new Error("Senha deve ter ao menos 6 caracteres");
  }

  const senhaHash = await bcrypt.hash(String(senha), SALT_ROUNDS);
  try {
    const { rows } = await getPool().query(
      `INSERT INTO padaria_usuario (login, senha_hash, nome, papel)
       VALUES ($1, $2, $3, $4)
       RETURNING id, login, nome, papel, ativo, ultimo_acesso_em, criado_em, atualizado_em`,
      [loginNorm, senhaHash, nomeNorm, papelNorm]
    );
    const usuario = mapUsuario(rows[0]);
    await registrarAuditoriaPadaria({
      acao: "usuario_criado",
      entidade: "usuario",
      entidadeId: usuario.id,
      dados: { login: usuario.login, papel: usuario.papel },
    });
    return usuario;
  } catch (error) {
    if (error.code === "23505") {
      throw new Error("Já existe um usuário com este login");
    }
    throw error;
  }
}

export async function atualizarUsuarioPadaria(id, { nome, papel, ativo, senha }) {
  const usuarioId = Number(id);
  if (!usuarioId) throw new Error("Usuário inválido");

  const atualRes = await getPool().query(
    `SELECT * FROM padaria_usuario WHERE id = $1`,
    [usuarioId]
  );
  const atual = atualRes.rows[0];
  if (!atual) throw new Error("Usuário não encontrado");

  if (ativo === false && atual.papel === "gestor" && atual.ativo) {
    const { rows } = await getPool().query(
      `SELECT COUNT(*)::int AS n FROM padaria_usuario
       WHERE papel = 'gestor' AND ativo = true AND id <> $1`,
      [usuarioId]
    );
    if (!(rows[0]?.n > 0)) {
      throw new Error("Não é possível desativar o último gestor ativo");
    }
  }

  if (papel != null && papel !== "gestor" && atual.papel === "gestor" && atual.ativo) {
    const { rows } = await getPool().query(
      `SELECT COUNT(*)::int AS n FROM padaria_usuario
       WHERE papel = 'gestor' AND ativo = true AND id <> $1`,
      [usuarioId]
    );
    if (!(rows[0]?.n > 0)) {
      throw new Error("Não é possível remover o papel do último gestor ativo");
    }
  }

  const campos = [];
  const params = [];
  let i = 1;

  if (nome != null) {
    const nomeNorm = String(nome).trim();
    if (!nomeNorm) throw new Error("Nome inválido");
    campos.push(`nome = $${i++}`);
    params.push(nomeNorm);
  }
  if (papel != null) {
    const papelNorm = String(papel).trim();
    if (!PAPEIS.has(papelNorm)) throw new Error("Papel inválido");
    campos.push(`papel = $${i++}`);
    params.push(papelNorm);
  }
  if (ativo != null) {
    campos.push(`ativo = $${i++}`);
    params.push(Boolean(ativo));
  }
  if (senha != null && String(senha).length > 0) {
    if (String(senha).length < 6) throw new Error("Senha deve ter ao menos 6 caracteres");
    const senhaHash = await bcrypt.hash(String(senha), SALT_ROUNDS);
    campos.push(`senha_hash = $${i++}`);
    params.push(senhaHash);
  }

  if (!campos.length) throw new Error("Nada para atualizar");

  campos.push(`atualizado_em = NOW()`);
  params.push(usuarioId);

  const { rows } = await getPool().query(
    `UPDATE padaria_usuario
     SET ${campos.join(", ")}
     WHERE id = $${i}
     RETURNING id, login, nome, papel, ativo, ultimo_acesso_em, criado_em, atualizado_em`,
    params
  );

  if (!rows[0]) throw new Error("Usuário não encontrado");
  const usuario = mapUsuario(rows[0]);
  await registrarAuditoriaPadaria({
    acao: ativo === false ? "usuario_desativado" : "usuario_atualizado",
    entidade: "usuario",
    entidadeId: usuario.id,
    dados: {
      login: usuario.login,
      papel: usuario.papel,
      ativo: usuario.ativo,
      senhaAlterada: Boolean(senha),
    },
  });
  return usuario;
}
