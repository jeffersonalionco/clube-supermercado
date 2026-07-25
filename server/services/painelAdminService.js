import bcrypt from "bcrypt";
import { getPool } from "../db.js";
import { validarSenhaCadastro } from "../utils/senha.js";

const BCRYPT_ROUNDS = 12;

function normalizarUsuario(usuario) {
  return String(usuario || "").trim().toLowerCase();
}

function mapAdmin(row) {
  if (!row) return null;
  return {
    id: row.id,
    usuario: row.usuario,
    nome: row.nome,
    ativo: row.ativo,
    criadoEm: row.criado_em,
    atualizadoEm: row.atualizado_em,
  };
}

export async function contarAdminsAtivos() {
  const { rows } = await getPool().query(
    `SELECT COUNT(*)::int AS total FROM painel_admin WHERE ativo = true`
  );
  return rows[0]?.total ?? 0;
}

export async function credenciaisAdminDisponiveis() {
  const ativos = await contarAdminsAtivos();
  if (ativos > 0) return true;

  return Boolean(
    process.env.ADMIN_USUARIO &&
      (process.env.ADMIN_SENHA_HASH || process.env.ADMIN_SENHA)
  );
}

export async function buscarAdminAtivoPorUsuario(usuario) {
  const login = normalizarUsuario(usuario);
  if (!login) return null;

  const { rows } = await getPool().query(
    `SELECT id, usuario, nome, senha_hash, ativo, criado_em, atualizado_em
     FROM painel_admin
     WHERE usuario = $1 AND ativo = true`,
    [login]
  );

  return rows[0] || null;
}

export async function listarAdministradores() {
  const { rows } = await getPool().query(
    `SELECT id, usuario, nome, ativo, criado_em, atualizado_em
     FROM painel_admin
     ORDER BY ativo DESC, usuario ASC`
  );
  return rows.map(mapAdmin);
}

export async function buscarAdministradorPorId(id) {
  const { rows } = await getPool().query(
    `SELECT id, usuario, nome, ativo, criado_em, atualizado_em
     FROM painel_admin
     WHERE id = $1`,
    [id]
  );
  return mapAdmin(rows[0]);
}

export async function criarAdministrador({ usuario, nome, senha }) {
  const login = normalizarUsuario(usuario);
  if (!login || login.length < 3) {
    throw new Error("Informe um usuário com pelo menos 3 caracteres");
  }

  if (!/^[a-z0-9._-]+$/.test(login)) {
    throw new Error("Usuário só pode conter letras, números, ponto, hífen e sublinhado");
  }

  const validacao = validarSenhaCadastro(senha);
  if (!validacao.ok) {
    throw new Error(validacao.error);
  }

  const senhaHash = await bcrypt.hash(String(senha), BCRYPT_ROUNDS);
  const nomeExibicao = String(nome || "").trim() || login;

  try {
    const { rows } = await getPool().query(
      `INSERT INTO painel_admin (usuario, nome, senha_hash)
       VALUES ($1, $2, $3)
       RETURNING id, usuario, nome, ativo, criado_em, atualizado_em`,
      [login, nomeExibicao, senhaHash]
    );
    return mapAdmin(rows[0]);
  } catch (error) {
    if (error.code === "23505") {
      throw new Error("Já existe um administrador com este usuário");
    }
    throw error;
  }
}

export async function alterarSenhaAdministrador(id, novaSenha) {
  const validacao = validarSenhaCadastro(novaSenha);
  if (!validacao.ok) {
    throw new Error(validacao.error);
  }

  const admin = await buscarAdministradorPorId(id);
  if (!admin) {
    throw new Error("Administrador não encontrado");
  }

  const senhaHash = await bcrypt.hash(String(novaSenha), BCRYPT_ROUNDS);

  const { rows } = await getPool().query(
    `UPDATE painel_admin
     SET senha_hash = $2, atualizado_em = NOW()
     WHERE id = $1
     RETURNING id, usuario, nome, ativo, criado_em, atualizado_em`,
    [id, senhaHash]
  );

  return mapAdmin(rows[0]);
}

export async function atualizarAdministrador(id, { nome, ativo }, { usuarioLogado } = {}) {
  const admin = await buscarAdministradorPorId(id);
  if (!admin) {
    throw new Error("Administrador não encontrado");
  }

  const nomeNovo = nome != null ? String(nome).trim() || admin.usuario : admin.nome;
  const ativoNovo = ativo != null ? Boolean(ativo) : admin.ativo;

  if (admin.ativo && !ativoNovo) {
    const loginAtual = normalizarUsuario(usuarioLogado);
    if (loginAtual === admin.usuario) {
      throw new Error("Você não pode desativar o seu próprio acesso");
    }
    const ativos = await contarAdminsAtivos();
    if (ativos <= 1) {
      throw new Error("Não é possível desativar o último administrador ativo");
    }
  }

  const { rows } = await getPool().query(
    `UPDATE painel_admin
     SET nome = $2, ativo = $3, atualizado_em = NOW()
     WHERE id = $1
     RETURNING id, usuario, nome, ativo, criado_em, atualizado_em`,
    [id, nomeNovo, ativoNovo]
  );

  return mapAdmin(rows[0]);
}

export async function seedAdministradorDoEnv() {
  const { rows } = await getPool().query(`SELECT COUNT(*)::int AS n FROM painel_admin`);
  if ((rows[0]?.n ?? 0) > 0) return false;

  const usuario = process.env.ADMIN_USUARIO;
  if (!usuario) return false;

  let senhaHash = process.env.ADMIN_SENHA_HASH;
  if (!senhaHash && process.env.ADMIN_SENHA) {
    senhaHash = await bcrypt.hash(String(process.env.ADMIN_SENHA), BCRYPT_ROUNDS);
  }
  if (!senhaHash) return false;

  await getPool().query(
    `INSERT INTO painel_admin (usuario, nome, senha_hash)
     VALUES ($1, $2, $3)`,
    [normalizarUsuario(usuario), "Administrador principal", senhaHash]
  );

  console.log("Administrador do .env importado para painel_admin.");
  return true;
}
