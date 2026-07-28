import bcrypt from "bcrypt";
import { getPool } from "../db.js";
import { normalizarCpfCnpj } from "./apiClient.js";

const SALT_ROUNDS = 10;

function extrairCodigoCliente(cliente) {
  if (!cliente || typeof cliente !== "object") return null;
  const codigo =
    cliente.codigo ??
    cliente.codigo_cliente ??
    cliente.cliente ??
    cliente.id;
  return codigo != null ? Number(codigo) : null;
}

function extrairNomeCliente(cliente) {
  if (!cliente || typeof cliente !== "object") return null;
  return (
    cliente.nome ??
    cliente.razaoSocial ??
    cliente.razao_social ??
    cliente.nome_fantasia ??
    cliente.descricao ??
    null
  );
}

export async function buscarUsuarioPorCpf(cpfCnpj) {
  const cpf = normalizarCpfCnpj(cpfCnpj);
  const { rows } = await getPool().query(
    `SELECT id, cpf, senha_hash, cliente_codigo, nome, dados_api, criado_em, atualizado_em,
            aceite_regulamento_em, aceite_privacidade_em, senha_versao
     FROM usuario WHERE cpf = $1`,
    [cpf]
  );
  return rows[0] || null;
}

export async function buscarUsuarioPorId(id) {
  const { rows } = await getPool().query(
    `SELECT id, cpf, senha_hash, cliente_codigo, nome, criado_em, senha_versao
     FROM usuario WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

export async function criarUsuario({ cpf, senha, clienteApi, dadosApi, registrarAceiteLegal = false }) {
  const cpfNorm = normalizarCpfCnpj(cpf);
  const senhaHash = await bcrypt.hash(senha, SALT_ROUNDS);
  const clienteCodigo = extrairCodigoCliente(clienteApi);
  const nome = extrairNomeCliente(clienteApi);

  const { rows } = await getPool().query(
    `INSERT INTO usuario (cpf, senha_hash, cliente_codigo, nome, dados_api, aceite_regulamento_em, aceite_privacidade_em)
     VALUES ($1, $2, $3, $4, $5, ${registrarAceiteLegal ? "NOW()" : "NULL"}, ${registrarAceiteLegal ? "NOW()" : "NULL"})
     RETURNING id, cpf, cliente_codigo, nome, criado_em, aceite_regulamento_em, aceite_privacidade_em`,
    [cpfNorm, senhaHash, clienteCodigo, nome, JSON.stringify(dadosApi ?? clienteApi ?? {})]
  );

  return rows[0];
}

export async function registrarAceiteLegalUsuario(id) {
  const { rows } = await getPool().query(
    `UPDATE usuario
     SET aceite_regulamento_em = COALESCE(aceite_regulamento_em, NOW()),
         aceite_privacidade_em = COALESCE(aceite_privacidade_em, NOW()),
         atualizado_em = NOW()
     WHERE id = $1
     RETURNING id, aceite_regulamento_em, aceite_privacidade_em`,
    [id]
  );
  return rows[0] || null;
}

export async function validarSenha(senha, senhaHash) {
  return bcrypt.compare(senha, senhaHash);
}

export async function atualizarDadosUsuario(id, { nome, clienteCodigo, dadosApi }) {
  const sets = [];
  const params = [id];
  let i = 2;

  if (nome != null) {
    sets.push(`nome = $${i++}`);
    params.push(nome);
  }
  if (clienteCodigo != null) {
    sets.push(`cliente_codigo = $${i++}`);
    params.push(clienteCodigo);
  }
  if (dadosApi != null) {
    sets.push(`dados_api = $${i++}`);
    params.push(JSON.stringify(dadosApi));
  }

  if (!sets.length) return null;

  const { rows } = await getPool().query(
    `UPDATE usuario SET ${sets.join(", ")} WHERE id = $1
     RETURNING id, cpf, cliente_codigo, nome, criado_em`,
    params
  );
  return rows[0] || null;
}

export function usuarioPublico(row) {
  return {
    id: row.id,
    cpf: row.cpf,
    clienteCodigo: row.cliente_codigo,
    nome: row.nome,
  };
}

function mapUsuarioAdmin(row) {
  return {
    id: row.id,
    cpf: row.cpf,
    nome: row.nome,
    clienteCodigo: row.cliente_codigo,
    criadoEm: row.criado_em,
    atualizadoEm: row.atualizado_em,
    aceiteRegulamentoEm: row.aceite_regulamento_em,
    aceitePrivacidadeEm: row.aceite_privacidade_em,
    saldoPontos: row.saldo_pontos != null ? Number(row.saldo_pontos) : 0,
  };
}

function montarFiltroBusca(busca) {
  const termo = String(busca || "").trim();
  if (!termo) {
    return { where: "", params: [] };
  }

  const cpfDigits = termo.replace(/\D/g, "");
  if (cpfDigits.length >= 3) {
    return {
      where: "WHERE u.cpf LIKE $1",
      params: [`%${cpfDigits}%`],
    };
  }

  return {
    where: "WHERE u.nome ILIKE $1",
    params: [`%${termo}%`],
  };
}

export async function listarUsuarios({ busca = "", limite = 50, offset = 0 } = {}) {
  const lim = Math.min(Math.max(Number(limite) || 50, 1), 200);
  const off = Math.max(Number(offset) || 0, 0);
  const { where, params } = montarFiltroBusca(busca);

  const listParams = [...params, lim, off];
  const limitIdx = params.length + 1;
  const offsetIdx = params.length + 2;

  const { rows } = await getPool().query(
    `SELECT u.id, u.cpf, u.nome, u.cliente_codigo, u.criado_em, u.atualizado_em,
            u.aceite_regulamento_em, u.aceite_privacidade_em,
            COALESCE(pc.saldo_pontos, 0)::int AS saldo_pontos
     FROM usuario u
     LEFT JOIN pontos_conta pc ON pc.cpf = u.cpf
     ${where}
     ORDER BY u.criado_em DESC
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    listParams
  );

  const countParams = [...params];
  const { rows: countRows } = await getPool().query(
    `SELECT COUNT(*)::int AS total FROM usuario u ${where}`,
    countParams
  );

  return {
    usuarios: rows.map(mapUsuarioAdmin),
    total: countRows[0]?.total ?? 0,
    limite: lim,
    offset: off,
  };
}

export async function alterarSenhaUsuario(id, novaSenha) {
  const senhaHash = await bcrypt.hash(novaSenha, SALT_ROUNDS);
  const { rows } = await getPool().query(
    `UPDATE usuario
     SET senha_hash = $2,
         senha_versao = COALESCE(senha_versao, 1) + 1,
         atualizado_em = NOW()
     WHERE id = $1
     RETURNING id, cpf, cliente_codigo, nome, criado_em, atualizado_em,
               aceite_regulamento_em, aceite_privacidade_em, senha_versao`,
    [id, senhaHash]
  );
  return rows[0] || null;
}
