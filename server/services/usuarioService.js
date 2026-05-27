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
    `SELECT id, cpf, senha_hash, cliente_codigo, nome, criado_em
     FROM usuario WHERE cpf = $1`,
    [cpf]
  );
  return rows[0] || null;
}

export async function buscarUsuarioPorId(id) {
  const { rows } = await getPool().query(
    `SELECT id, cpf, senha_hash, cliente_codigo, nome, criado_em
     FROM usuario WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

export async function criarUsuario({ cpf, senha, clienteApi, dadosApi }) {
  const cpfNorm = normalizarCpfCnpj(cpf);
  const senhaHash = await bcrypt.hash(senha, SALT_ROUNDS);
  const clienteCodigo = extrairCodigoCliente(clienteApi);
  const nome = extrairNomeCliente(clienteApi);

  const { rows } = await getPool().query(
    `INSERT INTO usuario (cpf, senha_hash, cliente_codigo, nome, dados_api)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, cpf, cliente_codigo, nome, criado_em`,
    [cpfNorm, senhaHash, clienteCodigo, nome, JSON.stringify(dadosApi ?? clienteApi ?? {})]
  );

  return rows[0];
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
