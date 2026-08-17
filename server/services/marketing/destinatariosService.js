import { getPool } from "../../db.js";
import { buscarClientePorCpfCnpj } from "../apiClient.js";
import { emailValido } from "../../utils/validacaoCadastro.js";

function extrairEmailCliente(cliente, raw) {
  const fontes = [cliente, raw, raw?.cliente, raw?.response?.cliente].filter(
    Boolean
  );
  for (const fonte of fontes) {
    if (typeof fonte !== "object") continue;
    const email = fonte.email ?? fonte.eMail ?? fonte.mail;
    if (email && String(email).includes("@")) {
      return String(email).trim().toLowerCase();
    }
  }
  return null;
}

function normalizarListaEmails(lista) {
  const set = new Set();
  for (const item of lista || []) {
    const email = String(item || "")
      .trim()
      .toLowerCase();
    if (emailValido(email)) set.add(email);
  }
  return [...set];
}

async function resolverEmailUsuario(usuario) {
  if (usuario?.dados_api) {
    const doCache = extrairEmailCliente(null, usuario.dados_api);
    if (doCache && emailValido(doCache)) return doCache;
  }
  try {
    const consulta = await buscarClientePorCpfCnpj(usuario.cpf);
    if (consulta.ok) {
      const email = extrairEmailCliente(consulta.cliente, consulta.raw);
      if (email && emailValido(email)) return email;
    }
  } catch {
    /* ignora falha pontual do ERP */
  }
  return null;
}

/**
 * Lista destinatários elegíveis para campanha promocional.
 * @param {{ publico: string, emailsEspecificos?: string[] }} opts
 */
export async function listarDestinatariosCampanha({
  publico = "todos_elegiveis",
  emailsEspecificos = [],
} = {}) {
  const db = getPool();

  if (publico === "emails_especificos") {
    const emails = normalizarListaEmails(emailsEspecificos);
    if (!emails.length) {
      return {
        destinatarios: [],
        resumo: {
          elegiveis: 0,
          semEmail: 0,
          optOut: 0,
          especificosInvalidos: (emailsEspecificos || []).length,
        },
      };
    }

    const { rows: usuarios } = await db.query(
      `SELECT id, cpf, nome, dados_api, email_promocional_opt_out_em
       FROM usuario
       ORDER BY id ASC`
    );

    const porEmail = new Map();
    for (const u of usuarios) {
      const email = await resolverEmailUsuario(u);
      if (!email) continue;
      if (!porEmail.has(email)) porEmail.set(email, u);
    }

    const destinatarios = [];
    let optOut = 0;
    let invalidos = 0;

    for (const raw of emailsEspecificos || []) {
      const email = String(raw || "")
        .trim()
        .toLowerCase();
      if (!emailValido(email)) {
        invalidos += 1;
        continue;
      }
      const usuario = porEmail.get(email) || null;
      if (usuario?.email_promocional_opt_out_em) {
        optOut += 1;
        continue;
      }
      destinatarios.push({
        usuarioId: usuario?.id ?? null,
        cpf: usuario?.cpf ?? null,
        nome: usuario?.nome ?? null,
        email,
      });
    }

    // dedupe por e-mail
    const unicos = [];
    const visto = new Set();
    for (const d of destinatarios) {
      if (visto.has(d.email)) continue;
      visto.add(d.email);
      unicos.push(d);
    }

    return {
      destinatarios: unicos,
      resumo: {
        elegiveis: unicos.length,
        semEmail: 0,
        optOut,
        especificosInvalidos: invalidos,
      },
    };
  }

  // todos_elegiveis
  const { rows: usuarios } = await db.query(
    `SELECT id, cpf, nome, dados_api, email_promocional_opt_out_em
     FROM usuario
     ORDER BY id ASC`
  );

  const destinatarios = [];
  let semEmail = 0;
  let optOut = 0;

  for (const u of usuarios) {
    if (u.email_promocional_opt_out_em) {
      optOut += 1;
      continue;
    }
    const email = await resolverEmailUsuario(u);
    if (!email) {
      semEmail += 1;
      continue;
    }
    destinatarios.push({
      usuarioId: u.id,
      cpf: u.cpf,
      nome: u.nome,
      email,
    });
  }

  const { rows: optRows } = await db.query(
    `SELECT COUNT(*)::int AS total
     FROM usuario
     WHERE email_promocional_opt_out_em IS NOT NULL`
  );

  return {
    destinatarios,
    resumo: {
      elegiveis: destinatarios.length,
      semEmail,
      optOut: optRows[0]?.total ?? optOut,
      especificosInvalidos: 0,
    },
  };
}

/**
 * Lista clientes do clube para seleção no admin (usa e-mail em cache local).
 * Rápido o suficiente para UI com busca e checkboxes.
 */
export async function listarClientesParaSelecaoMarketing({
  busca = "",
  apenasElegiveis = false,
} = {}) {
  const db = getPool();
  const { rows } = await db.query(
    `SELECT id, cpf, nome, dados_api, email_promocional_opt_out_em
     FROM usuario
     ORDER BY COALESCE(NULLIF(trim(nome), ''), cpf) ASC`
  );

  const rawBusca = String(busca || "").trim().toLowerCase();
  const digitsBusca = rawBusca.replace(/\D/g, "");
  const buscaPorCpf =
    digitsBusca.length >= 3 &&
    /^[\d.\-\/\s]+$/.test(String(busca || "").trim());

  const clientes = [];
  let elegiveis = 0;
  let semEmail = 0;
  let optOut = 0;

  for (const u of rows) {
    const email = u?.dados_api
      ? extrairEmailCliente(null, u.dados_api)
      : null;
    const emailOk = email && emailValido(email) ? email : null;
    const temOptOut = Boolean(u.email_promocional_opt_out_em);
    const elegivel = Boolean(emailOk) && !temOptOut;

    if (!emailOk) semEmail += 1;
    if (temOptOut) optOut += 1;
    if (elegivel) elegiveis += 1;

    if (apenasElegiveis && !elegivel) continue;

    const nome = String(u.nome || "").trim() || "Sem nome";
    const cpfDigits = String(u.cpf || "").replace(/\D/g, "");

    if (rawBusca) {
      if (buscaPorCpf) {
        if (!cpfDigits.includes(digitsBusca)) continue;
      } else {
        const hay = `${nome} ${emailOk || ""} ${cpfDigits}`.toLowerCase();
        if (!hay.includes(rawBusca)) continue;
      }
    }

    clientes.push({
      id: u.id,
      cpf: u.cpf,
      nome,
      email: emailOk,
      optOut: temOptOut,
      elegivel,
      motivo: temOptOut
        ? "Opt-out de propaganda"
        : !emailOk
          ? "Sem e-mail no cadastro"
          : null,
    });
  }

  return {
    clientes,
    resumo: {
      total: rows.length,
      elegiveis,
      semEmail,
      optOut,
      filtrados: clientes.length,
    },
  };
}

export async function obterResumoMarketing() {
  const db = getPool();
  const [selecao, campanhas, opt] = await Promise.all([
    listarClientesParaSelecaoMarketing({ apenasElegiveis: false }),
    db.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status = 'concluida')::int AS concluidas,
              MAX(enviado_em) AS ultimo_envio
       FROM marketing_campanha
       WHERE canal = 'email'`
    ),
    db.query(
      `SELECT COUNT(*)::int AS total
       FROM usuario
       WHERE email_promocional_opt_out_em IS NOT NULL`
    ),
  ]);

  return {
    elegiveis: selecao.resumo.elegiveis,
    semEmail: selecao.resumo.semEmail,
    optOut: opt.rows[0]?.total ?? 0,
    campanhasEmail: campanhas.rows[0]?.total ?? 0,
    campanhasConcluidas: campanhas.rows[0]?.concluidas ?? 0,
    ultimoEnvio: campanhas.rows[0]?.ultimo_envio ?? null,
    amostra: [],
  };
}
