import { getPool } from "../db.js";
import { obterContextoRequisicao } from "../utils/requestMeta.js";

export const EVENTOS_CLIENTE = {
  LOGIN_SUCESSO: "login_sucesso",
  LOGIN_FALHA_SENHA: "login_falha_senha",
  LOGIN_FALHA_VALIDACAO: "login_falha_validacao",
  CADASTRO_PLATAFORMA: "cadastro_plataforma",
  CADASTRO_CLUBE_API: "cadastro_clube_api",
  ATUALIZACAO_PERFIL: "atualizacao_perfil",
  SENHA_ADMIN: "senha_admin",
  SENHA_RECUPERADA: "senha_recuperada",
  RESGATE_COMPROVANTE: "resgate_comprovante",
  RESGATE_ASSINATURA: "resgate_assinatura",
};

export const ROTULOS_EVENTO = {
  [EVENTOS_CLIENTE.LOGIN_SUCESSO]: "Login realizado",
  [EVENTOS_CLIENTE.LOGIN_FALHA_SENHA]: "Tentativa de login (senha incorreta)",
  [EVENTOS_CLIENTE.LOGIN_FALHA_VALIDACAO]: "Tentativa de login (dados inválidos)",
  [EVENTOS_CLIENTE.CADASTRO_PLATAFORMA]: "Cadastro na plataforma",
  [EVENTOS_CLIENTE.CADASTRO_CLUBE_API]: "Cadastro no clube (API)",
  [EVENTOS_CLIENTE.ATUALIZACAO_PERFIL]: "Alteração de dados cadastrais",
  [EVENTOS_CLIENTE.SENHA_ADMIN]: "Senha redefinida pelo administrador",
  [EVENTOS_CLIENTE.SENHA_RECUPERADA]: "Senha redefinida por recuperação",
  [EVENTOS_CLIENTE.RESGATE_COMPROVANTE]: "Resgate de prêmio(s) com comprovante",
  [EVENTOS_CLIENTE.RESGATE_ASSINATURA]: "Assinatura do comprovante de resgate confirmada",
};

function snapshotPerfil(payload) {
  if (!payload || typeof payload !== "object") return {};

  const end = payload.enderecoResidencial || payload.endereco || {};

  return {
    nome: payload.nome ?? null,
    email: payload.email ?? null,
    celular: payload.celular ?? null,
    fone: payload.fone ?? null,
    dataNascimento: payload.dataNascimento ?? null,
    sexo: payload.sexo ?? null,
    estadoCivil: payload.estadoCivil ?? null,
    endereco: {
      uf: end.uf ?? null,
      cep: end.cep ?? null,
      cidade: end.cidade ?? null,
      endereco: end.endereco ?? null,
      bairro: end.bairro ?? null,
      numero: end.numero ?? null,
      complemento: end.complemento ?? null,
    },
  };
}

function diffValores(antes, depois, prefixo = "") {
  const alteracoes = [];

  const chaves = new Set([
    ...Object.keys(antes || {}),
    ...Object.keys(depois || {}),
  ]);

  for (const chave of chaves) {
    const campo = prefixo ? `${prefixo}.${chave}` : chave;
    const valorAntes = antes?.[chave];
    const valorDepois = depois?.[chave];

    if (
      valorAntes &&
      typeof valorAntes === "object" &&
      !Array.isArray(valorAntes) &&
      valorDepois &&
      typeof valorDepois === "object" &&
      !Array.isArray(valorDepois)
    ) {
      alteracoes.push(...diffValores(valorAntes, valorDepois, campo));
      continue;
    }

    if (JSON.stringify(valorAntes) !== JSON.stringify(valorDepois)) {
      alteracoes.push({
        campo,
        de: valorAntes ?? null,
        para: valorDepois ?? null,
      });
    }
  }

  return alteracoes;
}

export function compararAlteracoesPerfil(antesPayload, depoisPayload) {
  return diffValores(snapshotPerfil(antesPayload), snapshotPerfil(depoisPayload));
}

export async function registrarEventoCliente({
  usuarioId = null,
  cpf,
  evento,
  sucesso = true,
  req = null,
  detalhes = null,
}) {
  if (!cpf || !evento) return null;

  const ctx = req ? obterContextoRequisicao(req) : {};

  try {
    const { rows } = await getPool().query(
      `INSERT INTO cliente_auditoria (
         usuario_id, cpf, evento, sucesso, ip, user_agent,
         dispositivo, navegador, sistema, detalhes
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, criado_em`,
      [
        usuarioId,
        cpf,
        evento,
        sucesso,
        ctx.ip || null,
        ctx.userAgent || null,
        ctx.dispositivo || null,
        ctx.navegador || null,
        ctx.sistema || null,
        detalhes ? JSON.stringify(detalhes) : null,
      ]
    );

    return rows[0] || null;
  } catch (error) {
    console.error("[clienteAuditoria]", error.message);
    return null;
  }
}

export async function listarAuditoriaCliente(cpf, { limite = 50, evento = null } = {}) {
  const params = [cpf];
  let filtro = "";

  if (evento) {
    params.push(evento);
    filtro = ` AND evento = $${params.length}`;
  }

  params.push(Math.min(Math.max(Number(limite) || 50, 1), 200));

  const { rows } = await getPool().query(
    `SELECT id, usuario_id, cpf, evento, sucesso, ip, user_agent,
            dispositivo, navegador, sistema, detalhes, criado_em
     FROM cliente_auditoria
     WHERE cpf = $1${filtro}
     ORDER BY criado_em DESC
     LIMIT $${params.length}`,
    params
  );

  return rows.map((row) => ({
    id: row.id,
    usuarioId: row.usuario_id,
    cpf: row.cpf,
    evento: row.evento,
    eventoLabel: ROTULOS_EVENTO[row.evento] || row.evento,
    sucesso: row.sucesso,
    ip: row.ip,
    userAgent: row.user_agent,
    dispositivo: row.dispositivo,
    navegador: row.navegador,
    sistema: row.sistema,
    detalhes: row.detalhes,
    criadoEm: row.criado_em,
  }));
}
