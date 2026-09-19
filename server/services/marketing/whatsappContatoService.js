import { getPool } from "../../db.js";
import { buscarMembroClubePorTelefoneWa } from "../usuarioService.js";
import { normalizarTelefoneWa } from "./whatsappCloudService.js";

/**
 * Carteira de contatos WhatsApp (número de ofertas).
 * Inclui quem falou no bot + vínculo opcional com membro do Clube.
 */

function formatarTelefoneExibicao(tel) {
  const d = String(tel || "").replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("55")) {
    return `(${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  }
  if (d.length === 12 && d.startsWith("55")) {
    return `(${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
  }
  return tel || "—";
}

async function resolverFlagsClube(telefone) {
  try {
    const membro = await buscarMembroClubePorTelefoneWa(telefone, { fresh: true });
    if (!membro) {
      return {
        usuarioId: null,
        temClube: false,
        infoLiberada: false,
        nomeClube: null,
      };
    }
    return {
      usuarioId: membro.id || null,
      temClube: true,
      infoLiberada: Boolean(membro.infoLiberada),
      nomeClube: membro.nome || null,
    };
  } catch (err) {
    console.warn("[whatsapp/contato] flags clube:", err.message);
    return {
      usuarioId: null,
      temClube: false,
      infoLiberada: false,
      nomeClube: null,
    };
  }
}

/**
 * Upsert a cada mensagem inbound (exceto spam/sistema Meta).
 */
export async function registrarContatoWhatsappInbound({
  telefone,
  nomeWa = null,
  acao = null,
} = {}) {
  const tel = normalizarTelefoneWa(telefone);
  if (!tel) return null;

  const flags = await resolverFlagsClube(tel);
  const nome =
    String(nomeWa || "").trim().slice(0, 120) ||
    String(flags.nomeClube || "").trim().slice(0, 120) ||
    null;
  const ultimaAcao = String(acao || "message").slice(0, 40);

  const { rows } = await getPool().query(
    `INSERT INTO whatsapp_contato (
       telefone, nome_wa, primeiro_inbound_em, ultimo_inbound_em,
       ultima_acao, total_inbounds, usuario_id, tem_clube, info_liberada, atualizado_em
     ) VALUES ($1, $2, NOW(), NOW(), $3, 1, $4, $5, $6, NOW())
     ON CONFLICT (telefone) DO UPDATE SET
       nome_wa = COALESCE(NULLIF(EXCLUDED.nome_wa, ''), whatsapp_contato.nome_wa),
       ultimo_inbound_em = NOW(),
       ultima_acao = EXCLUDED.ultima_acao,
       total_inbounds = whatsapp_contato.total_inbounds + 1,
       usuario_id = COALESCE(EXCLUDED.usuario_id, whatsapp_contato.usuario_id),
       tem_clube = EXCLUDED.tem_clube,
       info_liberada = EXCLUDED.info_liberada,
       atualizado_em = NOW()
     RETURNING *`,
    [
      tel,
      nome,
      ultimaAcao,
      flags.usuarioId,
      flags.temClube,
      flags.infoLiberada,
    ]
  );
  return rows[0] || null;
}

export async function listarContatosWhatsapp({
  temClube = null,
  infoLiberada = null,
  busca = "",
  page = 1,
  limit = 50,
} = {}) {
  const db = getPool();
  const lim = Math.min(200, Math.max(10, Number(limit) || 50));
  const pag = Math.max(1, Number(page) || 1);
  const offset = (pag - 1) * lim;

  const where = [];
  const params = [];
  let i = 1;

  if (temClube === true || temClube === false) {
    where.push(`c.tem_clube = $${i++}`);
    params.push(temClube);
  }
  if (infoLiberada === true || infoLiberada === false) {
    where.push(`c.info_liberada = $${i++}`);
    params.push(infoLiberada);
  }

  const rawBusca = String(busca || "").trim();
  if (rawBusca) {
    const digits = rawBusca.replace(/\D/g, "");
    if (digits.length >= 3) {
      where.push(`(c.telefone LIKE $${i} OR COALESCE(c.nome_wa, '') ILIKE $${i + 1})`);
      params.push(`%${digits}%`);
      params.push(`%${rawBusca}%`);
      i += 2;
    } else {
      where.push(`COALESCE(c.nome_wa, '') ILIKE $${i++}`);
      params.push(`%${rawBusca}%`);
    }
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const { rows: countRows } = await db.query(
    `SELECT COUNT(*)::int AS total FROM whatsapp_contato c ${whereSql}`,
    params
  );
  const total = countRows[0]?.total || 0;

  const listParams = [...params, lim, offset];
  const { rows } = await db.query(
    `SELECT c.*,
            u.nome AS usuario_nome,
            u.cpf AS usuario_cpf,
            u.cliente_codigo,
            u.whatsapp_promocional_opt_out_em
     FROM whatsapp_contato c
     LEFT JOIN usuario u ON u.id = c.usuario_id
     ${whereSql}
     ORDER BY c.ultimo_inbound_em DESC NULLS LAST
     LIMIT $${i++} OFFSET $${i++}`,
    listParams
  );

  const { rows: resumoRows } = await db.query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE tem_clube)::int AS com_clube,
       COUNT(*) FILTER (WHERE NOT tem_clube)::int AS sem_clube,
       COUNT(*) FILTER (WHERE info_liberada)::int AS info_liberada
     FROM whatsapp_contato`
  );

  return {
    contatos: rows.map((r) => ({
      telefone: r.telefone,
      telefoneExibicao: formatarTelefoneExibicao(r.telefone),
      nomeWa: r.nome_wa || r.usuario_nome || null,
      nomeClube: r.usuario_nome || null,
      cpf: r.usuario_cpf || null,
      clienteCodigo: r.cliente_codigo || null,
      temClube: Boolean(r.tem_clube),
      infoLiberada: Boolean(r.info_liberada),
      optOut: Boolean(r.whatsapp_promocional_opt_out_em),
      primeiroInboundEm: r.primeiro_inbound_em,
      ultimoInboundEm: r.ultimo_inbound_em,
      ultimaAcao: r.ultima_acao,
      totalInbounds: r.total_inbounds,
      usuarioId: r.usuario_id,
    })),
    paginacao: {
      page: pag,
      limit: lim,
      total,
      pages: Math.max(1, Math.ceil(total / lim)),
    },
    resumo: resumoRows[0] || {
      total: 0,
      com_clube: 0,
      sem_clube: 0,
      info_liberada: 0,
    },
  };
}

/**
 * Destinatários da carteira para campanha.
 * filtro: todos | com_clube | sem_clube
 */
export async function listarDestinatariosCarteiraWhatsapp({
  filtro = "todos",
} = {}) {
  const db = getPool();
  const f = String(filtro || "todos").toLowerCase();
  let extra = "";
  if (f === "com_clube") extra = "AND c.tem_clube = TRUE";
  else if (f === "sem_clube") extra = "AND c.tem_clube = FALSE";

  const { rows } = await db.query(
    `SELECT c.telefone, c.usuario_id, c.nome_wa, u.cpf, u.nome,
            u.whatsapp_promocional_opt_out_em
     FROM whatsapp_contato c
     LEFT JOIN usuario u ON u.id = c.usuario_id
     WHERE 1=1 ${extra}
     ORDER BY c.ultimo_inbound_em DESC`
  );

  const destinatarios = [];
  let optOut = 0;
  for (const r of rows) {
    if (r.whatsapp_promocional_opt_out_em) {
      optOut += 1;
      continue;
    }
    destinatarios.push({
      usuarioId: r.usuario_id || null,
      cpf: r.cpf || null,
      nome: r.nome || r.nome_wa || null,
      telefone: r.telefone,
    });
  }

  return {
    destinatarios,
    resumo: {
      elegiveis: destinatarios.length,
      semTelefone: 0,
      optOut,
      especificosInvalidos: 0,
      carteiraFiltro: f,
    },
  };
}

/** Backfill a partir de métricas/estado já existentes (uma vez). */
export async function backfillContatosWhatsapp() {
  const db = getPool();
  const { rows } = await db.query(
    `SELECT telefone, MAX(criado_em) AS ultimo, COUNT(*)::int AS qtd,
            (ARRAY_AGG(acao ORDER BY criado_em DESC))[1] AS ultima_acao
     FROM whatsapp_auto_reply_metrica
     WHERE telefone IS NOT NULL AND telefone <> ''
     GROUP BY telefone`
  );

  let inseridos = 0;
  for (const r of rows) {
    const tel = normalizarTelefoneWa(r.telefone);
    if (!tel) continue;
    const flags = await resolverFlagsClube(tel);
    const { rowCount } = await db.query(
      `INSERT INTO whatsapp_contato (
         telefone, nome_wa, primeiro_inbound_em, ultimo_inbound_em,
         ultima_acao, total_inbounds, usuario_id, tem_clube, info_liberada, atualizado_em
       ) VALUES ($1, $2, COALESCE($3, NOW()), COALESCE($3, NOW()), $4, $5, $6, $7, $8, NOW())
       ON CONFLICT (telefone) DO NOTHING`,
      [
        tel,
        flags.nomeClube,
        r.ultimo,
        r.ultima_acao || "message",
        Math.max(1, r.qtd || 1),
        flags.usuarioId,
        flags.temClube,
        flags.infoLiberada,
      ]
    );
    if (rowCount) inseridos += 1;
  }

  // Também quem só aparece em estado (falou mas sem métrica)
  const { rows: estadoRows } = await db.query(
    `SELECT telefone, atualizado_em FROM whatsapp_auto_reply_estado`
  );
  for (const r of estadoRows) {
    const tel = normalizarTelefoneWa(r.telefone);
    if (!tel) continue;
    const flags = await resolverFlagsClube(tel);
    const { rowCount } = await db.query(
      `INSERT INTO whatsapp_contato (
         telefone, nome_wa, primeiro_inbound_em, ultimo_inbound_em,
         ultima_acao, total_inbounds, usuario_id, tem_clube, info_liberada, atualizado_em
       ) VALUES ($1, $2, COALESCE($3, NOW()), COALESCE($3, NOW()), 'estado', 1, $4, $5, $6, NOW())
       ON CONFLICT (telefone) DO NOTHING`,
      [
        tel,
        flags.nomeClube,
        r.atualizado_em,
        flags.usuarioId,
        flags.temClube,
        flags.infoLiberada,
      ]
    );
    if (rowCount) inseridos += 1;
  }

  return { inseridos, origemMetricas: rows.length };
}
