import bcrypt from "bcrypt";
import { getPool } from "../db.js";
import { normalizarCpfCnpj } from "./apiClient.js";
import { normalizarTelefoneWa } from "./marketing/whatsappCloudService.js";

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
            aceite_regulamento_em, aceite_privacidade_em, senha_versao,
            whatsapp_info_liberado_em, whatsapp_info_telefone
     FROM usuario WHERE cpf = $1`,
    [cpf]
  );
  return rows[0] || null;
}

export async function buscarUsuarioPorId(id) {
  const { rows } = await getPool().query(
    `SELECT id, cpf, senha_hash, cliente_codigo, nome, dados_api, criado_em,
            aceite_regulamento_em, senha_versao,
            whatsapp_info_liberado_em, whatsapp_info_telefone
     FROM usuario WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

/** CPF só com dígitos → `123.***.***-89` (início + fim). */
export function mascararCpfParcial(cpf) {
  const d = String(cpf || "").replace(/\D/g, "");
  if (d.length < 11) return null;
  return `${d.slice(0, 3)}.***.***-${d.slice(-2)}`;
}

export function primeiroNomePessoa(nome) {
  const p = String(nome || "")
    .trim()
    .split(/\s+/)
    .find(Boolean);
  if (!p) return null;
  const lower = p.toLocaleLowerCase("pt-BR");
  return lower.charAt(0).toLocaleUpperCase("pt-BR") + lower.slice(1);
}

function digitosTelefone(v) {
  return String(v || "").replace(/\D/g, "");
}

/** Compara WhatsApp E.164 com telefone do cadastro (aceita variação do 9º dígito). */
function telefonesWaEquivalentes(waA, waB) {
  const a = digitosTelefone(waA);
  const b = digitosTelefone(waB);
  if (!a || !b) return false;
  if (a === b) return true;
  const localA = a.startsWith("55") ? a.slice(2) : a;
  const localB = b.startsWith("55") ? b.slice(2) : b;
  if (localA.length < 10 || localB.length < 10) return false;
  // mesmo DDD + mesmos 8 finais (ignora o 9º dígito móvel)
  return localA.slice(0, 2) === localB.slice(0, 2) && localA.slice(-8) === localB.slice(-8);
}

function telefoneDosDadosApi(dadosApi) {
  if (!dadosApi || typeof dadosApi !== "object") return null;
  const fontes = [dadosApi, dadosApi.cliente, dadosApi.response?.cliente].filter(
    Boolean
  );
  for (const fonte of fontes) {
    if (typeof fonte !== "object") continue;
    for (const key of [
      "foneCel",
      "celular",
      "telefone",
      "fone",
      "foneCelular",
      "celularWhatsapp",
    ]) {
      const n = normalizarTelefoneWa(fonte[key]);
      if (n) return n;
    }
  }
  return null;
}

const cacheMembroPorWa = new Map(); // wa -> { em, membro }
const CACHE_MEMBRO_WA_MS = 5 * 60 * 1000;

/**
 * Localiza membro do Clube pelo número de WhatsApp (dados_api / cliente ERP).
 * Se várias contas compartilham o mesmo celular, prioriza a que liberou o WhatsApp.
 * @param {string} telefoneWa
 * @param {{ fresh?: boolean }} [opts]
 */
export async function buscarMembroClubePorTelefoneWa(telefoneWa, opts = {}) {
  const wa = normalizarTelefoneWa(telefoneWa);
  if (!wa) return null;

  const fresh = Boolean(opts.fresh);
  if (!fresh) {
    const hit = cacheMembroPorWa.get(wa);
    if (hit && Date.now() - hit.em < CACHE_MEMBRO_WA_MS) return hit.membro;
  }

  const local = wa.startsWith("55") ? wa.slice(2) : wa;
  const sufixo8 = local.slice(-8);
  if (sufixo8.length < 8) {
    cacheMembroPorWa.set(wa, { em: Date.now(), membro: null });
    return null;
  }

  // Telefone costuma estar em dados_api.cliente.* (espelho ERP)
  const { rows } = await getPool().query(
    `SELECT id, cpf, nome, dados_api, cliente_codigo,
            whatsapp_info_liberado_em, whatsapp_info_telefone
     FROM usuario
     WHERE right(regexp_replace(COALESCE(dados_api->>'foneCel', ''), '\\D', '', 'g'), 8) = $1
        OR right(regexp_replace(COALESCE(dados_api->>'celular', ''), '\\D', '', 'g'), 8) = $1
        OR right(regexp_replace(COALESCE(dados_api->>'telefone', ''), '\\D', '', 'g'), 8) = $1
        OR right(regexp_replace(COALESCE(dados_api->>'fone', ''), '\\D', '', 'g'), 8) = $1
        OR right(regexp_replace(COALESCE(dados_api->'cliente'->>'foneCel', ''), '\\D', '', 'g'), 8) = $1
        OR right(regexp_replace(COALESCE(dados_api->'cliente'->>'celular', ''), '\\D', '', 'g'), 8) = $1
        OR right(regexp_replace(COALESCE(dados_api->'cliente'->>'telefone', ''), '\\D', '', 'g'), 8) = $1
        OR right(regexp_replace(COALESCE(dados_api->'cliente'->>'fone', ''), '\\D', '', 'g'), 8) = $1
        OR right(regexp_replace(COALESCE(whatsapp_info_telefone, ''), '\\D', '', 'g'), 8) = $1
     ORDER BY
       CASE
         WHEN whatsapp_info_liberado_em IS NOT NULL
          AND right(regexp_replace(COALESCE(whatsapp_info_telefone, ''), '\\D', '', 'g'), 8) = $1
         THEN 0 ELSE 1
       END,
       atualizado_em DESC NULLS LAST,
       id DESC
     LIMIT 30`,
    [sufixo8]
  );

  const candidatos = [];
  for (const row of rows) {
    const telCadastro =
      telefoneDosDadosApi(row.dados_api) ||
      normalizarTelefoneWa(row.whatsapp_info_telefone);
    if (!telCadastro || !telefonesWaEquivalentes(wa, telCadastro)) continue;
    const cpfMascarado = mascararCpfParcial(row.cpf);
    const primeiroNome = primeiroNomePessoa(row.nome);
    if (!primeiroNome || !cpfMascarado) continue;
    const infoLiberada = Boolean(
      row.whatsapp_info_liberado_em &&
        row.whatsapp_info_telefone &&
        telefonesWaEquivalentes(wa, row.whatsapp_info_telefone)
    );
    candidatos.push({
      id: row.id,
      cpf: row.cpf,
      nome: String(row.nome || "").trim(),
      primeiroNome,
      cpfMascarado,
      clienteCodigo:
        row.cliente_codigo != null ? String(row.cliente_codigo) : null,
      infoLiberada,
      telefoneCadastro: telCadastro,
    });
  }

  const membro =
    candidatos.find((c) => c.infoLiberada) || candidatos[0] || null;

  cacheMembroPorWa.set(wa, { em: Date.now(), membro });
  return membro;
}

export function invalidarCacheMembroPorWa(telefoneWa) {
  const wa = normalizarTelefoneWa(telefoneWa);
  if (wa) cacheMembroPorWa.delete(wa);
}

export function telefoneUsuarioDosDados(usuario) {
  return telefoneDosDadosApi(usuario?.dados_api) || null;
}

/**
 * Liga/desliga o acesso a informações sensíveis no WhatsApp para o número do cadastro.
 */
export async function definirWhatsappInfoLiberado(usuarioId, { liberado, telefoneWa }) {
  const id = Number(usuarioId);
  if (!Number.isFinite(id)) return { ok: false, error: "Usuário inválido" };

  if (!liberado) {
    const { rows } = await getPool().query(
      `UPDATE usuario
       SET whatsapp_info_liberado_em = NULL,
           whatsapp_info_telefone = NULL,
           atualizado_em = NOW()
       WHERE id = $1
       RETURNING id, whatsapp_info_liberado_em, whatsapp_info_telefone, dados_api`,
      [id]
    );
    const u = rows[0];
    if (u) invalidarCacheMembroPorWa(telefoneUsuarioDosDados(u));
    return { ok: true, liberado: false, usuario: u };
  }

  const wa = normalizarTelefoneWa(telefoneWa);
  if (!wa) {
    return {
      ok: false,
      error:
        "Cadastre um celular válido no perfil antes de liberar o WhatsApp.",
    };
  }

  const { rows } = await getPool().query(
    `UPDATE usuario
     SET whatsapp_info_liberado_em = NOW(),
         whatsapp_info_telefone = $2,
         atualizado_em = NOW()
     WHERE id = $1
     RETURNING id, whatsapp_info_liberado_em, whatsapp_info_telefone, dados_api, nome, cliente_codigo, cpf`,
    [id, wa]
  );
  const u = rows[0];
  if (!u) return { ok: false, error: "Usuário não encontrado" };
  invalidarCacheMembroPorWa(wa);
  return { ok: true, liberado: true, usuario: u, telefone: wa };
}

export function resumirWhatsappInfo(usuario) {
  const liberado = Boolean(usuario?.whatsapp_info_liberado_em);
  const tel =
    normalizarTelefoneWa(usuario?.whatsapp_info_telefone) ||
    telefoneUsuarioDosDados(usuario);
  const local = tel && tel.startsWith("55") ? tel.slice(2) : tel;
  let telefoneMascarado = null;
  if (local && local.length >= 10) {
    telefoneMascarado = `(${local.slice(0, 2)}) ${local.slice(2, 3)}****-${local.slice(-4)}`;
  }
  return {
    liberado,
    liberadoEm: usuario?.whatsapp_info_liberado_em || null,
    telefoneConfirmado: liberado ? telefoneMascarado : null,
    telefoneCadastro: telefoneMascarado,
    temTelefoneCadastro: Boolean(telefoneUsuarioDosDados(usuario)),
  };
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

function normalizarDataFiltro(valor, rotulo) {
  const data = String(valor || "").trim();
  if (!data) return null;

  const match = data.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    throw new Error(`${rotulo} inválida`);
  }

  const ano = Number(match[1]);
  const mes = Number(match[2]);
  const dia = Number(match[3]);
  const teste = new Date(Date.UTC(ano, mes - 1, dia));
  if (
    teste.getUTCFullYear() !== ano ||
    teste.getUTCMonth() !== mes - 1 ||
    teste.getUTCDate() !== dia
  ) {
    throw new Error(`${rotulo} inválida`);
  }

  return data;
}

function montarFiltrosUsuarios(busca, dataInicio, dataFim) {
  const condicoes = [];
  const params = [];
  const termo = String(busca || "").trim();

  if (termo) {
    const cpfDigits = termo.replace(/\D/g, "");
    params.push(cpfDigits.length >= 3 ? `%${cpfDigits}%` : `%${termo}%`);
    condicoes.push(
      cpfDigits.length >= 3
        ? `u.cpf LIKE $${params.length}`
        : `u.nome ILIKE $${params.length}`
    );
  }

  const inicio = normalizarDataFiltro(dataInicio, "Data inicial");
  const fim = normalizarDataFiltro(dataFim, "Data final");

  if (inicio && fim && inicio > fim) {
    throw new Error("A data inicial não pode ser posterior à data final");
  }

  if (inicio) {
    params.push(inicio);
    condicoes.push(
      `u.criado_em >= ($${params.length}::date AT TIME ZONE 'America/Sao_Paulo')`
    );
  }

  if (fim) {
    params.push(fim);
    condicoes.push(
      `u.criado_em < (($${params.length}::date + INTERVAL '1 day') AT TIME ZONE 'America/Sao_Paulo')`
    );
  }

  return {
    where: condicoes.length ? `WHERE ${condicoes.join(" AND ")}` : "",
    params,
  };
}

export async function listarUsuarios({
  busca = "",
  dataInicio = "",
  dataFim = "",
  limite = 50,
  offset = 0,
} = {}) {
  const lim = Math.min(Math.max(Number(limite) || 50, 1), 200);
  const off = Math.max(Number(offset) || 0, 0);
  const { where, params } = montarFiltrosUsuarios(busca, dataInicio, dataFim);

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
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE COALESCE(pc.saldo_pontos, 0) > 0)::int AS com_saldo
     FROM usuario u
     LEFT JOIN pontos_conta pc ON pc.cpf = u.cpf
     ${where}`,
    countParams
  );

  const total = countRows[0]?.total ?? 0;

  return {
    usuarios: rows.map(mapUsuarioAdmin),
    total,
    comSaldo: countRows[0]?.com_saldo ?? 0,
    limite: lim,
    offset: off,
    pagina: Math.floor(off / lim) + 1,
    totalPaginas: Math.max(1, Math.ceil(total / lim)),
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
