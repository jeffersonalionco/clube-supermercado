import { getPool } from "../../db.js";
import { buscarMembroClubePorTelefoneWa } from "../usuarioService.js";

const ACOES = [
  "menu",
  "menu_membro",
  "menu_visitante",
  "conversar",
  "clube",
  "facebook",
  "ofertas",
  "ver_menu",
  "ice_ofertas",
  "ice_clube",
  "ice_cadastro",
  "catalog_inquiry",
  "catalog_order",
  "catalog_order_multi",
  "catalog_inquiry_multi",
  "catalog_pedido_pronto",
  "catalog_pedido_multiplo",
  "catalog_cancelou",
  "meu_clube",
  "clube_mais",
  "clube_liberar",
  "clube_compra",
  "clube_credito",
  "clube_voltar",
  "cooldown_menu",
  "cooldown_ofertas",
  "rate_limit",
];

const ACOES_MENU = ["menu", "menu_membro", "menu_visitante"];
const ACOES_BLOQUEIO = ["cooldown_menu", "cooldown_ofertas", "rate_limit"];

function formatarTelefoneWaExibicao(waE164) {
  const d = String(waE164 || "").replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("55")) {
    return `+55 (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  }
  if (d.length === 12 && d.startsWith("55")) {
    return `+55 (${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
  }
  return d || null;
}

async function enriquecerRecententes(recentes) {
  const cache = new Map();
  const out = [];
  for (const r of recentes) {
    const tel = r.telefone || null;
    let membro = null;
    if (tel) {
      if (!cache.has(tel)) {
        try {
          cache.set(
            tel,
            await buscarMembroClubePorTelefoneWa(tel, { fresh: false })
          );
        } catch {
          cache.set(tel, null);
        }
      }
      membro = cache.get(tel);
    }
    out.push({
      id: Number(r.id),
      telefone: tel,
      telefoneExibicao: formatarTelefoneWaExibicao(tel) || tel,
      acao: r.acao,
      criadoEm: r.criado_em,
      nome: membro?.nome || null,
      cpfMascarado: membro?.cpfMascarado || null,
      clienteCodigo: membro?.clienteCodigo || null,
      ehMembro: Boolean(membro),
    });
  }
  return out;
}

function pct(parte, total) {
  if (!total) return 0;
  return Math.round((Number(parte) / Number(total)) * 1000) / 10;
}

function dataLocalISO(d) {
  const x = new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function zerarContagens(chaves) {
  const o = {};
  for (const k of chaves) o[k] = 0;
  return o;
}

/**
 * Registra evento de auto-resposta (menu, clique, bloqueio, Meu Clube…).
 */
export async function registrarMetricaAutoReply({
  acao,
  telefone,
  wamid = null,
  messageId = null,
}) {
  const a = String(acao || "").trim();
  if (!ACOES.includes(a)) return;
  try {
    await getPool().query(
      `INSERT INTO whatsapp_auto_reply_metrica
         (telefone, acao, wamid, message_id)
       VALUES ($1, $2, $3, $4)`,
      [
        telefone ? String(telefone).slice(0, 32) : null,
        a,
        wamid ? String(wamid).slice(0, 128) : null,
        messageId ? String(messageId).slice(0, 128) : null,
      ]
    );
  } catch (err) {
    console.error("[whatsapp/metricas] registrar", err.message);
  }
}

export async function obterMetricasAutoReply({ dias = 7 } = {}) {
  const d = Math.min(90, Math.max(1, Number(dias) || 7));
  const db = getPool();

  const { rows: totaisRows } = await db.query(
    `SELECT acao,
            COUNT(*)::int AS total,
            COUNT(DISTINCT telefone)::int AS unicos
     FROM whatsapp_auto_reply_metrica
     WHERE criado_em >= NOW() - ($1::text || ' days')::interval
     GROUP BY acao`,
    [String(d)]
  );

  const rawTotais = zerarContagens(ACOES);
  const rawUnicos = zerarContagens(ACOES);
  for (const row of totaisRows) {
    if (rawTotais[row.acao] != null) {
      rawTotais[row.acao] = row.total;
      rawUnicos[row.acao] = row.unicos;
    }
  }

  const menusEnviados =
    rawTotais.menu + rawTotais.menu_membro + rawTotais.menu_visitante;
  const menusUnicosQuery = await db.query(
    `SELECT COUNT(DISTINCT telefone)::int AS n
     FROM whatsapp_auto_reply_metrica
     WHERE acao = ANY($1::text[])
       AND criado_em >= NOW() - ($2::text || ' days')::interval`,
    [ACOES_MENU, String(d)]
  );
  const menusUnicos = menusUnicosQuery.rows[0]?.n || 0;

  const totais = {
    menu: menusEnviados,
    conversar: rawTotais.conversar,
    clube: rawTotais.clube,
    facebook: rawTotais.facebook,
    ofertas: rawTotais.ofertas,
    meu_clube: rawTotais.meu_clube,
    clube_mais: rawTotais.clube_mais,
    clube_liberar: rawTotais.clube_liberar,
    clube_compra: rawTotais.clube_compra,
    clube_voltar: rawTotais.clube_voltar,
    cooldown_menu: rawTotais.cooldown_menu,
    cooldown_ofertas: rawTotais.cooldown_ofertas,
    rate_limit: rawTotais.rate_limit,
  };
  const unicos = {
    menu: menusUnicos,
    conversar: rawUnicos.conversar,
    clube: rawUnicos.clube,
    facebook: rawUnicos.facebook,
    ofertas: rawUnicos.ofertas,
    meu_clube: rawUnicos.meu_clube,
    clube_mais: rawUnicos.clube_mais,
    clube_liberar: rawUnicos.clube_liberar,
    clube_compra: rawUnicos.clube_compra,
    clube_voltar: rawUnicos.clube_voltar,
    cooldown_menu: rawUnicos.cooldown_menu,
    cooldown_ofertas: rawUnicos.cooldown_ofertas,
    rate_limit: rawUnicos.rate_limit,
  };

  const cliques =
    totais.conversar + totais.clube + totais.facebook + totais.ofertas;
  const cliquesUnicosQuery = await db.query(
    `SELECT COUNT(DISTINCT telefone)::int AS n
     FROM whatsapp_auto_reply_metrica
     WHERE acao IN ('conversar', 'clube', 'facebook', 'ofertas')
       AND criado_em >= NOW() - ($1::text || ' days')::interval`,
    [String(d)]
  );
  const cliquesUnicos = cliquesUnicosQuery.rows[0]?.n || 0;

  const bloqueiosTotal =
    totais.cooldown_menu + totais.cooldown_ofertas + totais.rate_limit;
  const tentativasMenu = menusEnviados + totais.cooldown_menu + totais.rate_limit;
  const tentativasOfertas = totais.ofertas + totais.cooldown_ofertas;

  const menusClassificados =
    rawTotais.menu_membro + rawTotais.menu_visitante;
  const ctaClubeTotal = rawTotais.meu_clube + rawTotais.clube;
  const audiencia = {
    menuMembro: rawTotais.menu_membro,
    menuVisitante: rawTotais.menu_visitante,
    menuLegado: rawTotais.menu,
    menuMembroUnicos: rawUnicos.menu_membro,
    menuVisitanteUnicos: rawUnicos.menu_visitante,
    pctMenusMembro: pct(rawTotais.menu_membro, menusClassificados),
    pctMenusVisitante: pct(rawTotais.menu_visitante, menusClassificados),
    meuClube: rawTotais.meu_clube,
    abrirClube: rawTotais.clube,
    pctCtaMembro: pct(rawTotais.meu_clube, ctaClubeTotal),
    pctCtaVisitante: pct(rawTotais.clube, ctaClubeTotal),
  };

  const meuClube = {
    totais: {
      meu_clube: rawTotais.meu_clube,
      clube_mais: rawTotais.clube_mais,
      clube_liberar: rawTotais.clube_liberar,
      clube_compra: rawTotais.clube_compra,
      clube_voltar: rawTotais.clube_voltar,
    },
    unicos: {
      meu_clube: rawUnicos.meu_clube,
      clube_mais: rawUnicos.clube_mais,
      clube_liberar: rawUnicos.clube_liberar,
      clube_compra: rawUnicos.clube_compra,
      clube_voltar: rawUnicos.clube_voltar,
    },
    conversoes: {
      beneficios: pct(rawTotais.clube_mais, rawTotais.meu_clube),
      liberar: pct(rawTotais.clube_liberar, rawTotais.meu_clube),
      compra: pct(rawTotais.clube_compra, rawTotais.meu_clube),
      voltar: pct(rawTotais.clube_voltar, rawTotais.meu_clube),
    },
  };

  const bloqueios = {
    cooldown_menu: totais.cooldown_menu,
    cooldown_ofertas: totais.cooldown_ofertas,
    rate_limit: totais.rate_limit,
    total: bloqueiosTotal,
    unicos: {
      cooldown_menu: unicos.cooldown_menu,
      cooldown_ofertas: unicos.cooldown_ofertas,
      rate_limit: unicos.rate_limit,
    },
    pctMenuBloqueado: pct(totais.cooldown_menu, tentativasMenu),
    pctOfertasCooldown: pct(totais.cooldown_ofertas, tentativasOfertas),
    pctRateLimit: pct(totais.rate_limit, tentativasMenu),
  };

  const { rows: serieRows } = await db.query(
    `SELECT d::date AS dia,
            COALESCE(SUM(CASE WHEN m.acao = ANY($2::text[]) THEN 1 ELSE 0 END), 0)::int AS menu,
            COALESCE(SUM(CASE WHEN m.acao = 'menu_membro' THEN 1 ELSE 0 END), 0)::int AS menu_membro,
            COALESCE(SUM(CASE WHEN m.acao = 'menu_visitante' THEN 1 ELSE 0 END), 0)::int AS menu_visitante,
            COALESCE(SUM(CASE WHEN m.acao = 'conversar' THEN 1 ELSE 0 END), 0)::int AS conversar,
            COALESCE(SUM(CASE WHEN m.acao = 'clube' THEN 1 ELSE 0 END), 0)::int AS clube,
            COALESCE(SUM(CASE WHEN m.acao = 'facebook' THEN 1 ELSE 0 END), 0)::int AS facebook,
            COALESCE(SUM(CASE WHEN m.acao = 'ofertas' THEN 1 ELSE 0 END), 0)::int AS ofertas,
            COALESCE(SUM(CASE WHEN m.acao = 'meu_clube' THEN 1 ELSE 0 END), 0)::int AS meu_clube,
            COALESCE(SUM(CASE WHEN m.acao = 'clube_mais' THEN 1 ELSE 0 END), 0)::int AS clube_mais,
            COALESCE(SUM(CASE WHEN m.acao = 'clube_liberar' THEN 1 ELSE 0 END), 0)::int AS clube_liberar,
            COALESCE(SUM(CASE WHEN m.acao = 'clube_compra' THEN 1 ELSE 0 END), 0)::int AS clube_compra,
            COALESCE(SUM(CASE WHEN m.acao = ANY($3::text[]) THEN 1 ELSE 0 END), 0)::int AS bloqueios
     FROM generate_series(
       ((NOW() AT TIME ZONE 'America/Sao_Paulo')::date - ($1::int - 1)),
       (NOW() AT TIME ZONE 'America/Sao_Paulo')::date,
       interval '1 day'
     ) AS d
     LEFT JOIN whatsapp_auto_reply_metrica m
       ON (m.criado_em AT TIME ZONE 'America/Sao_Paulo')::date = d::date
     GROUP BY d
     ORDER BY d ASC`,
    [d, ACOES_MENU, ACOES_BLOQUEIO]
  );

  const serieDiaria = serieRows.map((row) => ({
    data:
      row.dia instanceof Date
        ? dataLocalISO(row.dia)
        : String(row.dia).slice(0, 10),
    menu: row.menu,
    menu_membro: row.menu_membro,
    menu_visitante: row.menu_visitante,
    conversar: row.conversar,
    clube: row.clube,
    facebook: row.facebook,
    ofertas: row.ofertas,
    meu_clube: row.meu_clube,
    clube_mais: row.clube_mais,
    clube_liberar: row.clube_liberar,
    clube_compra: row.clube_compra,
    bloqueios: row.bloqueios,
  }));

  const { rows: recentes } = await db.query(
    `SELECT id, telefone, acao, criado_em
     FROM whatsapp_auto_reply_metrica
     WHERE criado_em >= NOW() - ($1::text || ' days')::interval
     ORDER BY id DESC
     LIMIT 40`,
    [String(d)]
  );

  return {
    periodo: { dias: d },
    totais,
    unicos,
    cliques,
    cliquesUnicos,
    conversoes: {
      qualquer: pct(cliques, menusEnviados),
      conversar: pct(totais.conversar, menusEnviados),
      clube: pct(totais.clube, menusEnviados),
      facebook: pct(totais.facebook, menusEnviados),
      ofertas: pct(totais.ofertas, menusEnviados),
      meu_clube: pct(totais.meu_clube, menusEnviados),
      qualquerUnicos: pct(cliquesUnicos, menusUnicos),
    },
    audiencia,
    meuClube,
    bloqueios,
    serieDiaria,
    recentes: await enriquecerRecententes(recentes),
  };
}
