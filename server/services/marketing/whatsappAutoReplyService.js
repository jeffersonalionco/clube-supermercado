import { createHmac, timingSafeEqual } from "crypto";
import { getPool } from "../../db.js";
import {
  enviarIndicadorDigitandoWhatsapp,
  enviarMensagemBotoesWhatsapp,
  enviarMensagemCtaUrlWhatsapp,
  enviarMensagemTextoWhatsapp,
  normalizarTelefoneWa,
  whatsappCloudConfigurado,
} from "./whatsappCloudService.js";
import { registrarMetricaAutoReply } from "./whatsappMetricasService.js";
import { obterOfertasParaWhatsapp } from "./whatsappOfertasService.js";
import { buscarMembroClubePorTelefoneWa } from "../usuarioService.js";
import {
  BTN_MEU_CLUBE,
  acaoMetricaMeuClube,
  isBotaoMeuClube,
  limparSessaoMeuClube,
  renovarOuExpirarSessao,
  responderMeuClubeBotao,
  enviarPainelMeuClube,
} from "./whatsappMeuClubeService.js";
import {
  continuarPedidoCatalogo,
  iniciarPedidoCatalogo,
  isBotaoCatalogoPedido,
  limparSessaoCatalogoPedido,
  obterSessaoCatalogoPedido,
} from "./whatsappCatalogoPedidoService.js";

const BTN_OFERTAS = "btn_ofertas";
const BTN_CONVERSAR = "btn_conversar";
const BTN_CLUBE = "btn_clube";
/** Abre o menu completo a partir das boas-vindas (quebra-gelo). */
const BTN_VER_MENU = "btn_ver_menu";

/** Textos das “mensagens iniciais” / ice breakers configurados no Meta. */
const QUEBRA_GELO = {
  ofertas: {
    id: "ofertas",
    metrica: "ice_ofertas",
    // frases aceitas (após normalizar)
    match: (t) =>
      t.includes("quais sao as ofertas de hoje") ||
      (t.includes("ofertas de hoje") && t.length < 80) ||
      (t.includes("ofertas") && t.includes("hoje") && t.includes("quais")),
  },
  clube: {
    id: "clube",
    metrica: "ice_clube",
    match: (t) =>
      t.includes("quero saber mais sobre o clube") ||
      t.includes("saber mais sobre o clube superama") ||
      (t.includes("saber mais") && t.includes("clube") && t.includes("superama")),
  },
  cadastro: {
    id: "cadastro",
    metrica: "ice_cadastro",
    match: (t) =>
      t.includes("como faco para me cadastrar") ||
      t.includes("me cadastrar no clube") ||
      (t.includes("cadastrar") && t.includes("clube") && t.includes("superama")),
  },
};

function normalizarTextoIntent(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s+]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function detectarQuebraGelo(texto) {
  const t = normalizarTextoIntent(texto);
  if (!t || t.length > 200) return null;
  for (const item of Object.values(QUEBRA_GELO)) {
    if (item.match(t)) return item;
  }
  return null;
}

/** Fila simples em memória para absorver picos sem bloquear o webhook. */
const fila = [];
let processandoFila = false;
const MAX_FILA = Number(process.env.WHATSAPP_WEBHOOK_MAX_FILA || 2000);

function envFlag(nome, padrao = true) {
  const v = process.env[nome];
  if (v == null || v === "") return padrao;
  return !["0", "false", "off", "no"].includes(String(v).toLowerCase());
}

function cooldownMenuMs() {
  const min = Number(process.env.WHATSAPP_AUTO_REPLY_COOLDOWN_MIN || 10);
  return Math.max(1, min) * 60 * 1000;
}

function maxEnviosPorMinuto() {
  return Math.max(2, Number(process.env.WHATSAPP_AUTO_REPLY_MAX_POR_MIN || 8));
}

function formatarTelefoneBrExibicao(waE164) {
  const d = String(waE164 || "").replace(/\D/g, "");
  // 55 + DDD (2) + número (8 ou 9)
  if (d.length === 12 && d.startsWith("55")) {
    return `(${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
  }
  if (d.length === 13 && d.startsWith("55")) {
    return `(${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  }
  return d || "";
}

/** Bom dia / Boa tarde / Boa noite no fuso de Brasília. */
export function saudacaoPorHorario(agora = new Date()) {
  const hora = Number(
    new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "numeric",
      hour12: false,
    }).format(agora)
  );
  if (hora >= 5 && hora < 12) return "Bom dia";
  if (hora >= 12 && hora < 18) return "Boa tarde";
  return "Boa noite";
}

export function montarCorpoMenuPadrao(telefoneExibicao, { membro } = {}) {
  const saudacao = saudacaoPorHorario();
  const tel = telefoneExibicao || "(45) 9816-1551";
  const abertura = membro?.primeiroNome
    ? `Olá, *${membro.primeiroNome}*! *${saudacao}* 👋\n\n`
    : `Olá, *${saudacao}* 👋\n\n`;

  const blocoClube = membro?.cpfMascarado
    ? `*Clube Superama+*\n` +
      `Identificamos você no Clube.\n` +
      `No caixa, informe o CPF *${membro.cpfMascarado}* para o preço exclusivo.`
    : `*Clube Superama+*\n` +
      `Para garantir o preço exclusivo, informe seu CPF no caixa.`;

  return (
    abertura +
    `Você está no canal oficial de ofertas do Superama.\n\n` +
    `🛒 *OFERTAS DE HOJE*\n\n` +
    `Consulte as ofertas do dia e confira os preços exclusivos do Clube Superama+.\n\n` +
    `👉 Toque em *Ofertas de hoje* para consultar.\n\n` +
    `💬 *ATENDIMENTO*\n` +
    `Para dúvidas, pedidos ou atendimento, fale diretamente com nossa equipe:\n\n` +
    `📞 ${tel}\n\n` +
    `━━━━━━━━━━━━━━\n\n` +
    blocoClube
  );
}

export function autoReplyConfig() {
  const waNumero = normalizarTelefoneWa(
    process.env.WHATSAPP_REDIRECT_WA || "4598161551"
  );
  const telefoneExibicao = formatarTelefoneBrExibicao(waNumero) || "(45) 9816-1551";
  const corpoPadrao = montarCorpoMenuPadrao(telefoneExibicao);
  return {
    enabled: envFlag("WHATSAPP_AUTO_REPLY_ENABLED", true),
    verifyToken: String(process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || "").trim(),
    appSecret: String(process.env.WHATSAPP_APP_SECRET || "").trim(),
    telefoneExibicao,
    corpoMenu:
      String(process.env.WHATSAPP_AUTO_REPLY_BODY || "").trim() || corpoPadrao,
    links: {
      conversar: waNumero
        ? `https://wa.me/${waNumero}`
        : "https://wa.me/554598161551",
      clube:
        String(process.env.WHATSAPP_REDIRECT_CLUBE || "").trim() ||
        "https://clube.mercadosuperama.com.br",
      facebook:
        String(process.env.WHATSAPP_REDIRECT_FACEBOOK || "").trim() ||
        "https://www.facebook.com/superamasupermercado.supermercadoalianca",
    },
    equipeWa: waNumero,
  };
}

/**
 * Detecta interesse no catálogo Meta:
 * - "Message business" em um produto → context.referred_product
 * - Carrinho enviado → type=order
 */
function extrairIntentCatalogo(msg) {
  const raw = msg.raw || {};
  const referred =
    raw.context?.referred_product ||
    raw.context?.whatsapp_referred_product ||
    null;

  if (referred?.product_retailer_id) {
    return {
      tipo: "inquiry",
      catalogId: referred.catalog_id || null,
      itens: [
        {
          codigo: String(referred.product_retailer_id).trim(),
          quantidade: 1,
          preco: null,
        },
      ],
      textoCliente: msg.text || null,
    };
  }

  if (msg.type === "order" || raw.type === "order" || raw.order) {
    const order = raw.order || {};
    const itens = (order.product_items || [])
      .map((it) => ({
        codigo: String(it.product_retailer_id || "").trim(),
        quantidade: Number(it.quantity) || 1,
        preco:
          it.item_price != null && Number.isFinite(Number(it.item_price))
            ? Number(it.item_price)
            : null,
      }))
      .filter((it) => it.codigo);
    if (itens.length) {
      return {
        tipo: "order",
        catalogId: order.catalog_id || null,
        itens,
        textoCliente: order.text || msg.text || null,
      };
    }
  }

  return null;
}

export function validarAssinaturaWebhook(rawBody, signatureHeader) {
  const cfg = autoReplyConfig();
  if (!cfg.appSecret) return true; // opcional até configurar
  if (!signatureHeader || !rawBody) return false;
  const esperado =
    "sha256=" +
    createHmac("sha256", cfg.appSecret).update(rawBody).digest("hex");
  try {
    const a = Buffer.from(esperado);
    const b = Buffer.from(String(signatureHeader));
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

async function registrarEventoUnico(wamid, telefone, tipo) {
  if (!wamid) return true;
  try {
    const { rows } = await getPool().query(
      `INSERT INTO whatsapp_webhook_evento (wamid, telefone, tipo)
       VALUES ($1, $2, $3)
       ON CONFLICT (wamid) DO NOTHING
       RETURNING id`,
      [
        String(wamid).slice(0, 128),
        telefone || null,
        String(tipo || "message").slice(0, 40),
      ]
    );
    return rows.length > 0;
  } catch (err) {
    if (err?.code === "23505") return false;
    console.error("[whatsapp/webhook] dedupe", err.message);
    return true;
  }
}

async function checarEAtualizarRateLimit(telefone, { tipo }) {
  const db = getPool();
  const agora = new Date();
  const { rows } = await db.query(
    `SELECT * FROM whatsapp_auto_reply_estado WHERE telefone = $1`,
    [telefone]
  );
  let estado = rows[0] || null;

  if (!estado) {
    await db.query(
      `INSERT INTO whatsapp_auto_reply_estado
         (telefone, ultimo_menu_em, ultimo_botao_em, envios_janela, janela_inicio, atualizado_em)
       VALUES ($1, NULL, NULL, 0, $2, $2)
       ON CONFLICT (telefone) DO NOTHING`,
      [telefone, agora]
    );
    const again = await db.query(
      `SELECT * FROM whatsapp_auto_reply_estado WHERE telefone = $1`,
      [telefone]
    );
    estado = again.rows[0];
  }

  let envios = Number(estado.envios_janela || 0);
  let janelaInicio = estado.janela_inicio
    ? new Date(estado.janela_inicio)
    : agora;
  if (agora - janelaInicio > 60_000) {
    envios = 0;
    janelaInicio = agora;
  }

  if (envios >= maxEnviosPorMinuto()) {
    return { ok: false, motivo: "rate_limit" };
  }

  if (tipo === "menu") {
    const ultimo = estado.ultimo_menu_em
      ? new Date(estado.ultimo_menu_em)
      : null;
    if (ultimo && agora - ultimo < cooldownMenuMs()) {
      return { ok: false, motivo: "cooldown_menu" };
    }
  }

  envios += 1;
  await db.query(
    `UPDATE whatsapp_auto_reply_estado
     SET envios_janela = $2,
         janela_inicio = $3,
         ultimo_menu_em = CASE WHEN $4 = 'menu' THEN $5 ELSE ultimo_menu_em END,
         ultimo_botao_em = CASE WHEN $4 = 'botao' THEN $5 ELSE ultimo_botao_em END,
         atualizado_em = $5
     WHERE telefone = $1`,
    [telefone, envios, janelaInicio, tipo, agora]
  );

  return { ok: true };
}

function cooldownOfertasMs() {
  const min = Number(process.env.WHATSAPP_OFERTAS_COOLDOWN_MIN || 20);
  return Math.max(1, min) * 60 * 1000;
}

async function enviarMenuPadrao(telefone, { wamid } = {}) {
  const cfg = autoReplyConfig();
  await pausaDigitando(wamid);

  let membro = null;
  try {
    membro = await buscarMembroClubePorTelefoneWa(telefone);
  } catch (err) {
    console.warn("[whatsapp/auto-reply] lookup membro:", err.message);
  }

  // Sai da sessão Meu Clube ao voltar ao menu principal
  try {
    await limparSessaoMeuClube(telefone);
  } catch {
    /* ignore */
  }

  // Corpo estático do .env só quando não há personalização
  const corpoEnv = String(process.env.WHATSAPP_AUTO_REPLY_BODY || "").trim();
  const corpo =
    !membro && corpoEnv
      ? corpoEnv
      : montarCorpoMenuPadrao(cfg.telefoneExibicao, { membro });

  const botoes = [
    { id: BTN_OFERTAS, title: "Ofertas de hoje" },
    { id: BTN_CONVERSAR, title: "Falar com a loja" },
    membro
      ? { id: BTN_MEU_CLUBE, title: "Meu Clube" }
      : { id: BTN_CLUBE, title: "Abrir o Clube" },
  ];

  const r = await enviarMensagemBotoesWhatsapp({
    telefone,
    cabecalho: "SUPERMERCADO SUPERAMA",
    corpo,
    rodape: membro
      ? `Clube Superama+ · CPF ${membro.cpfMascarado}`
      : "Clube Superama+ · CPF no caixa",
    botoes,
  });
  return {
    ...r,
    metricaAcao: membro ? "menu_membro" : "menu_visitante",
  };
}

function acaoPorBotao(buttonId) {
  if (buttonId === BTN_OFERTAS) return "ofertas";
  if (buttonId === BTN_CONVERSAR) return "conversar";
  if (buttonId === BTN_CLUBE) return "clube";
  if (buttonId === BTN_VER_MENU) return "ver_menu";
  return acaoMetricaMeuClube(buttonId);
}

/**
 * Boas-vindas das quebras de gelo: não abre o menu direto —
 * mensagem de entrada + botões para ofertas/clube/menu.
 */
async function enviarBoasVindasQuebraGelo(telefone, intent, { wamid } = {}) {
  const cfg = autoReplyConfig();
  await pausaDigitando(wamid);

  let membro = null;
  try {
    membro = await buscarMembroClubePorTelefoneWa(telefone);
  } catch {
    /* ignore */
  }

  try {
    await limparSessaoMeuClube(telefone);
  } catch {
    /* ignore */
  }

  const nome = membro?.primeiroNome ? `, *${membro.primeiroNome}*` : "";
  const saudacao = saudacaoPorHorario();

  let cabecalho = "SUPERAMA";
  let corpo = "";
  let botoes = [];
  let rodape = "Toque em um botão ↓";

  if (intent.id === "ofertas") {
    cabecalho = "OFERTAS DO DIA";
    corpo =
      `${saudacao}${nome}! ✨\n\n` +
      `Você chegou no canal certo.\n` +
      `Aqui as *ofertas de hoje* do Superama saem fresquinhas — ` +
      `e com preço de *Clube Superama+* no caixa.\n\n` +
      `👇 Escolha: ver as ofertas agora ou abrir o *menu* completo.`;
    botoes = [
      { id: BTN_OFERTAS, title: "Ver ofertas agora" },
      { id: BTN_VER_MENU, title: "Abrir o menu" },
      membro
        ? { id: BTN_MEU_CLUBE, title: "Meu Clube" }
        : { id: BTN_CLUBE, title: "Conhecer o Clube" },
    ];
  } else if (intent.id === "clube") {
    cabecalho = "CLUBE SUPERAMA+";
    corpo =
      `${saudacao}${nome}! 💛\n\n` +
      `O *Clube Superama+* é o seu acesso a preço exclusivo, ` +
      `benefícios e um jeito mais inteligente de fazer a feira.\n\n` +
      `No caixa, é só informar o CPF${
        membro?.cpfMascarado ? ` (*${membro.cpfMascarado}*)` : ""
      }.\n\n` +
      `👇 Explore o Clube ou abra o menu de ofertas.`;
    botoes = [
      membro
        ? { id: BTN_MEU_CLUBE, title: "Meu Clube" }
        : { id: BTN_CLUBE, title: "Abrir o Clube" },
      { id: BTN_OFERTAS, title: "Ver ofertas" },
      { id: BTN_VER_MENU, title: "Abrir o menu" },
    ];
  } else {
    // cadastro
    cabecalho = "CADASTRE-SE";
    corpo =
      `${saudacao}${nome}! 🌟\n\n` +
      `Entrar no *Clube Superama+* é rápido:\n` +
      `1️⃣ Abra o site do Clube\n` +
      `2️⃣ Cadastre-se com seu CPF\n` +
      `3️⃣ No caixa, informe o CPF e pronto — preço de membro\n\n` +
      `👇 Comece o cadastro ou veja o menu enquanto isso.`;
    botoes = [
      { id: BTN_CLUBE, title: "Quero me cadastrar" },
      { id: BTN_OFERTAS, title: "Ver ofertas" },
      { id: BTN_VER_MENU, title: "Abrir o menu" },
    ];
    // CTA reforça o caminho de cadastro (logo após a mensagem com botões)
  }

  // Gancho curto antes dos botões (chama atenção)
  const gancho =
    intent.id === "ofertas"
      ? `🛒 *Ofertas na mão* — preparei um atalho pra você.`
      : intent.id === "clube"
        ? `💎 *Clube Superama+* — vale a pena conhecer de perto.`
        : `🚀 *Seu lugar no Clube* começa em poucos toques.`;

  await enviarMensagemTextoWhatsapp({
    telefone,
    texto: gancho,
  });

  const r = await enviarMensagemBotoesWhatsapp({
    telefone,
    cabecalho,
    corpo,
    rodape,
    botoes,
  });

  // Cadastro: reforço com CTA URL para o site
  if (intent.id === "cadastro" && r.ok) {
    await enviarCtaOuTexto({
      telefone,
      corpo:
        `Quando estiver pronto, toque abaixo e faça o cadastro no *Clube Superama+*.`,
      url: cfg.links.clube,
      displayText: "Cadastrar no site",
      textoFallback: `Cadastre-se no Clube:\n${cfg.links.clube}`,
    });
  }

  return {
    ...r,
    metricaAcao: intent.metrica,
  };
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function typingDelayMs() {
  const n = Number(process.env.WHATSAPP_TYPING_MS || 1600);
  return Math.min(4000, Math.max(800, Number.isFinite(n) ? n : 1600));
}

/** Exibe "digitando…" e espera ~1–2s para parecer atendimento humano. */
async function pausaDigitando(wamid) {
  if (wamid) {
    try {
      await enviarIndicadorDigitandoWhatsapp({ messageId: wamid });
    } catch (err) {
      console.warn("[whatsapp/auto-reply] typing:", err.message);
    }
  }
  await sleep(typingDelayMs());
}

async function podeEnviarOfertas(telefone) {
  try {
    const { rows } = await getPool().query(
      `SELECT criado_em
       FROM whatsapp_auto_reply_metrica
       WHERE telefone = $1 AND acao = 'ofertas'
       ORDER BY id DESC
       LIMIT 1`,
      [telefone]
    );
    if (!rows[0]?.criado_em) return { ok: true };
    const elapsed = Date.now() - new Date(rows[0].criado_em).getTime();
    if (elapsed < cooldownOfertasMs()) {
      const faltaMin = Math.ceil((cooldownOfertasMs() - elapsed) / 60000);
      return { ok: false, faltaMin };
    }
    return { ok: true };
  } catch {
    return { ok: true };
  }
}

async function enviarOfertasDoDia(telefone, { wamid } = {}) {
  const cfg = autoReplyConfig();
  await pausaDigitando(wamid);
  const gate = await podeEnviarOfertas(telefone);
  if (!gate.ok) {
    const r = await enviarMensagemTextoWhatsapp({
      telefone,
      texto:
        `Você já pediu as ofertas há pouco.\n` +
        `Peça de novo em cerca de *${gate.faltaMin} min* — assim o canal fica leve para todo mundo.`,
    });
    return {
      ...r,
      skipMetric: true,
      metricaAcao: "cooldown_ofertas",
      qtd: 0,
    };
  }

  const MIN_ITENS = 5;
  let ofertas = await obterOfertasParaWhatsapp();

  // Cache de outro dia / ainda sincronizando o dia atual: NÃO envia lista velha
  const precisaEsperar =
    ofertas.aguardandoDiaAtual ||
    (ofertas.sincronizando && ofertas.itens.length < MIN_ITENS) ||
    (ofertas.itens.length < MIN_ITENS &&
      (ofertas.sincronizando || !ofertas.itens.length));

  if (precisaEsperar) {
    await enviarMensagemTextoWhatsapp({
      telefone,
      texto: ofertas.aguardandoDiaAtual
        ? `Atualizando as *ofertas de hoje*…\nJá te envio a lista fresquinha.`
        : !ofertas.itens.length
          ? `Buscando as ofertas do Clube no sistema…\nJá te envio a lista.`
          : `Atualizando a lista de ofertas…\nJá te mando em instantes.`,
    });
    // Até ~60s: espera o sync do dia atual (parcial já serve se for de hoje)
    for (let i = 0; i < 20; i++) {
      await sleep(3000);
      ofertas = await obterOfertasParaWhatsapp();
      if (
        !ofertas.aguardandoDiaAtual &&
        ofertas.itens.length >= MIN_ITENS
      ) {
        break;
      }
      if (
        !ofertas.aguardandoDiaAtual &&
        !ofertas.sincronizando &&
        ofertas.itens.length > 0
      ) {
        break;
      }
      if (
        !ofertas.aguardandoDiaAtual &&
        !ofertas.sincronizando &&
        !ofertas.itens.length
      ) {
        break;
      }
    }
  }

  if (!ofertas.itens.length) {
    const r = await enviarMensagemTextoWhatsapp({
      telefone,
      texto:
        `Ainda não consegui montar a lista de *preço 2*.\n` +
        `O catálogo pode estar sincronizando — toque de novo em *Ofertas de hoje* em 1 minuto.\n\n` +
        `Ou abra o Clube:\n${cfg.links.clube}`,
    });
    return { ...r, skipMetric: true, qtd: 0 };
  }

  let ultimo = { ok: true, messageId: null };
  for (let i = 0; i < ofertas.mensagens.length; i++) {
    // Já houve pausa no início; nas próximas partes simula digitação de novo
    if (i > 0) await pausaDigitando(wamid);
    ultimo = await enviarMensagemTextoWhatsapp({
      telefone,
      texto: ofertas.mensagens[i],
    });
    if (!ultimo.ok) return ultimo;
    await sleep(400);
  }

  // Digitando de novo antes do botão/CTA do Clube
  await pausaDigitando(wamid);
  await enviarCtaOuTexto({
    telefone,
    corpo:
      "Gostou? No Clube você confere o catálogo completo e seus benefícios.",
    url: cfg.links.clube,
    displayText: "Abrir o Clube",
    textoFallback: `Abra o Clube Superama+:\n${cfg.links.clube}`,
  });
  return {
    ok: true,
    messageId: ultimo.messageId,
    qtd: ofertas.itens.length,
  };
}

/** CTA URL com fallback para texto clicável se a Meta recusar o tipo. */
async function enviarCtaOuTexto({ telefone, corpo, url, displayText, textoFallback }) {
  const cta = await enviarMensagemCtaUrlWhatsapp({
    telefone,
    corpo,
    url,
    displayText,
  });
  if (cta.ok) return cta;
  console.warn("[whatsapp/auto-reply] CTA falhou, fallback texto:", cta.error);
  return enviarMensagemTextoWhatsapp({
    telefone,
    texto: textoFallback || `${corpo}\n\n${url}`,
  });
}

async function responderBotao(telefone, buttonId, { wamid } = {}) {
  const cfg = autoReplyConfig();

  if (buttonId === BTN_VER_MENU) {
    return enviarMenuPadrao(telefone, { wamid });
  }

  if (buttonId === BTN_OFERTAS) {
    return enviarOfertasDoDia(telefone, { wamid });
  }

  if (buttonId === BTN_CONVERSAR) {
    await pausaDigitando(wamid);
    const corpo =
      `Toque no botão abaixo para abrir o atendimento no WhatsApp ${cfg.telefoneExibicao}.`;
    return enviarCtaOuTexto({
      telefone,
      corpo,
      url: cfg.links.conversar,
      displayText: "Abrir WhatsApp",
      textoFallback:
        `Toque no link para abrir o atendimento (${cfg.telefoneExibicao}):\n${cfg.links.conversar}`,
    });
  }

  if (buttonId === BTN_CLUBE) {
    await pausaDigitando(wamid);
    return enviarCtaOuTexto({
      telefone,
      corpo: "Toque no botão para acessar o Clube Superama+.",
      url: cfg.links.clube,
      displayText: "Abrir o Clube",
      textoFallback: `Acesse o Clube Superama+:\n${cfg.links.clube}`,
    });
  }

  if (isBotaoMeuClube(buttonId)) {
    await pausaDigitando(wamid);
    const r = await responderMeuClubeBotao(telefone, buttonId, { wamid, cfg });
    if (r?.voltarMenu || r?._reabrirMenu || r?.expired) {
      return enviarMenuPadrao(telefone, { wamid });
    }
    return r;
  }

  // Botões antigos (ex.: Facebook) → menu atualizado
  return enviarMenuPadrao(telefone, { wamid });
}

function extrairMensagensEntrada(body) {
  const out = [];
  const entries = body?.entry || [];
  for (const entry of entries) {
    for (const change of entry.changes || []) {
      if (change.field && change.field !== "messages") continue;
      const value = change.value || {};
      const contatosPerfil = {};
      for (const c of value.contacts || []) {
        const waId = String(c.wa_id || "").replace(/\D/g, "");
        if (waId) contatosPerfil[waId] = c.profile?.name || null;
      }
      for (const msg of value.messages || []) {
        const fromDigits = String(msg.from || "").replace(/\D/g, "");
        out.push({
          wamid: msg.id,
          from: msg.from,
          timestamp: msg.timestamp,
          type: msg.type,
          text: msg.text?.body || null,
          nomeWa: contatosPerfil[fromDigits] || null,
          buttonId:
            msg.interactive?.button_reply?.id ||
            msg.button?.payload ||
            msg.interactive?.list_reply?.id ||
            null,
          buttonTitle:
            msg.interactive?.button_reply?.title ||
            msg.button?.text ||
            null,
          // Payload bruto — necessário p/ códigos Meta (às vezes type=unsupported)
          raw: msg,
          errors: value.errors || null,
        });
      }
    }
  }
  return out;
}

async function processarMensagem(msg) {
  const cfg = autoReplyConfig();
  if (!cfg.enabled || !whatsappCloudConfigurado()) {
    console.warn("[whatsapp/auto-reply] desabilitado ou Cloud API sem config");
    return;
  }

  const telefone = normalizarTelefoneWa(msg.from);
  if (!telefone) {
    console.warn("[whatsapp/auto-reply] telefone inválido:", msg.from);
    return;
  }

  const novo = await registrarEventoUnico(
    msg.wamid,
    telefone,
    msg.buttonId || msg.type || "message"
  );
  if (!novo) {
    console.log("[whatsapp/auto-reply] duplicado ignorado", msg.wamid);
    return;
  }

  // Carteira de contatos (número de ofertas) — ignora mensagens sistema Meta
  if (msg.type !== "unsupported" && msg.type !== "system" && msg.type !== "unknown") {
    try {
      const { registrarContatoWhatsappInbound } = await import(
        "./whatsappContatoService.js"
      );
      await registrarContatoWhatsappInbound({
        telefone,
        nomeWa: msg.nomeWa || null,
        acao: msg.buttonId || msg.type || "message",
      });
    } catch (err) {
      console.warn("[whatsapp/contato] upsert:", err.message);
    }
  }

  console.log("[whatsapp/auto-reply] inbound", {
    telefone,
    type: msg.type,
    buttonId: msg.buttonId || null,
    text: msg.text || null,
    wamid: msg.wamid,
  });

  // Mensagens que a Cloud API não decodifica (ex.: código de verificação Meta)
  if (msg.type === "unsupported" || msg.type === "system" || msg.type === "unknown") {
    console.log(
      "[whatsapp/auto-reply] MENSAGEM ESPECIAL (possível código):",
      JSON.stringify({ raw: msg.raw, errors: msg.errors }, null, 2)
    );
    return;
  }

  // Catálogo Meta: "enviar mensagem" no produto ou pedido do carrinho
  const intentCatalogo = extrairIntentCatalogo(msg);
  if (intentCatalogo) {
    const lim = await checarEAtualizarRateLimit(telefone, { tipo: "botao" });
    if (!lim.ok) {
      console.log("[whatsapp/auto-reply] bloqueado", lim.motivo, telefone);
      await registrarMetricaAutoReply({
        acao: lim.motivo,
        telefone,
        wamid: msg.wamid,
      });
      return;
    }
    try {
      await limparSessaoMeuClube(telefone);
    } catch {
      /* ignore */
    }
    const r = await iniciarPedidoCatalogo(telefone, intentCatalogo, {
      wamid: msg.wamid,
      nomeWa: msg.nomeWa || null,
      cfg: autoReplyConfig(),
    });
    if (!r.ok) {
      console.warn("[whatsapp/auto-reply] catálogo falhou:", r.error);
    } else {
      await registrarMetricaAutoReply({
        acao: r.metricaAcao || "catalog_inquiry",
        telefone,
        wamid: msg.wamid,
        messageId: r.messageId,
      });
      console.log(
        "[whatsapp/auto-reply] catálogo ok",
        intentCatalogo.tipo,
        r.catalogCodigo,
        r.messageId
      );
    }
    return;
  }

  // Sessão ativa de encomenda (peso → retirada → telefone)
  try {
    const sessCat = await obterSessaoCatalogoPedido(telefone);
    if (sessCat.ativa) {
      const botaoCat = msg.buttonId && isBotaoCatalogoPedido(msg.buttonId);
      if (msg.buttonId && !botaoCat) {
        // Sai do fluxo e segue o botão do menu
        await limparSessaoCatalogoPedido(telefone);
      } else {
        const lim = await checarEAtualizarRateLimit(telefone, { tipo: "botao" });
        if (!lim.ok) {
          await registrarMetricaAutoReply({
            acao: lim.motivo,
            telefone,
            wamid: msg.wamid,
          });
          return;
        }
        const r = await continuarPedidoCatalogo(telefone, msg.text || "", {
          wamid: msg.wamid,
          dados: sessCat.dados,
          buttonId: botaoCat ? msg.buttonId : null,
        });
        if (r?._reabrirMenu) {
          const menu = await enviarMenuPadrao(telefone, { wamid: msg.wamid });
          if (menu.ok) {
            await registrarMetricaAutoReply({
              acao: menu.metricaAcao || "menu",
              telefone,
              wamid: msg.wamid,
              messageId: menu.messageId,
            });
          }
          return;
        }
        if (r?.metricaAcao) {
          await registrarMetricaAutoReply({
            acao: r.metricaAcao,
            telefone,
            wamid: msg.wamid,
            messageId: r.messageId,
          });
        }
        console.log(
          "[whatsapp/auto-reply] catálogo passo",
          sessCat.dados?.passo,
          r?.messageId
        );
        return;
      }
    }
  } catch (err) {
    console.warn("[whatsapp/auto-reply] sessão catálogo:", err.message);
  }

  if (msg.buttonId) {
    const lim = await checarEAtualizarRateLimit(telefone, { tipo: "botao" });
    if (!lim.ok) {
      console.log("[whatsapp/auto-reply] bloqueado", lim.motivo, telefone);
      await registrarMetricaAutoReply({
        acao: lim.motivo,
        telefone,
        wamid: msg.wamid,
      });
      return;
    }
    const r = await responderBotao(telefone, msg.buttonId, {
      wamid: msg.wamid,
    });
    if (!r.ok) {
      console.warn("[whatsapp/auto-reply] botão falhou:", r.error);
    } else {
      const acaoBotao = acaoPorBotao(msg.buttonId);
      let acao = null;
      if (r.metricaAcao === "cooldown_ofertas") {
        acao = "cooldown_ofertas";
      } else if (acaoBotao && !r.skipMetric) {
        acao = acaoBotao;
      } else if (r.metricaAcao && !r.skipMetric) {
        acao = r.metricaAcao;
      }
      if (acao) {
        await registrarMetricaAutoReply({
          acao,
          telefone,
          wamid: msg.wamid,
          messageId: r.messageId,
        });
      }
      console.log(
        "[whatsapp/auto-reply] botão ok",
        msg.buttonId,
        r.messageId,
        r.qtd != null ? `qtd=${r.qtd}` : ""
      );
    }
    return;
  }

  // Quebras de gelo (Meta): mensagem de entrada → depois botões p/ menu
  if (msg.type === "text" && msg.text) {
    const intent = detectarQuebraGelo(msg.text);
    if (intent) {
      const lim = await checarEAtualizarRateLimit(telefone, { tipo: "botao" });
      if (!lim.ok) {
        console.log("[whatsapp/auto-reply] bloqueado", lim.motivo, telefone);
        await registrarMetricaAutoReply({
          acao: lim.motivo,
          telefone,
          wamid: msg.wamid,
        });
        return;
      }
      const r = await enviarBoasVindasQuebraGelo(telefone, intent, {
        wamid: msg.wamid,
      });
      if (!r.ok) {
        console.warn("[whatsapp/auto-reply] quebra-gelo falhou:", r.error);
      } else {
        await registrarMetricaAutoReply({
          acao: r.metricaAcao || intent.metrica,
          telefone,
          wamid: msg.wamid,
          messageId: r.messageId,
        });
        console.log(
          "[whatsapp/auto-reply] quebra-gelo ok",
          intent.id,
          r.messageId
        );
      }
      return;
    }
  }

  // Sessão Meu Clube ativa: texto não reabre o menu principal
  try {
    const sess = await renovarOuExpirarSessao(telefone);
    if (sess.ativa) {
      const lim = await checarEAtualizarRateLimit(telefone, { tipo: "botao" });
      if (!lim.ok) {
        console.log("[whatsapp/auto-reply] bloqueado", lim.motivo, telefone);
        await registrarMetricaAutoReply({
          acao: lim.motivo,
          telefone,
          wamid: msg.wamid,
        });
        return;
      }
      await pausaDigitando(msg.wamid);
      const r = await enviarPainelMeuClube(telefone, {
        wamid: msg.wamid,
        cfg: autoReplyConfig(),
      });
      if (!r.ok) {
        console.warn("[whatsapp/auto-reply] sessão clube falhou:", r.error);
      } else {
        await registrarMetricaAutoReply({
          acao: "meu_clube",
          telefone,
          wamid: msg.wamid,
          messageId: r.messageId,
        });
      }
      return;
    }
    if (sess.expirou) {
      console.log("[whatsapp/auto-reply] sessão Meu Clube expirou", telefone);
    }
  } catch (err) {
    console.warn("[whatsapp/auto-reply] sessão:", err.message);
  }

  // Qualquer outra mensagem (texto, áudio, imagem, sticker…) → menu
  const lim = await checarEAtualizarRateLimit(telefone, { tipo: "menu" });
  if (!lim.ok) {
    console.log("[whatsapp/auto-reply] bloqueado", lim.motivo, telefone);
    await registrarMetricaAutoReply({
      acao: lim.motivo,
      telefone,
      wamid: msg.wamid,
    });
    return;
  }
  const r = await enviarMenuPadrao(telefone, { wamid: msg.wamid });
  if (!r.ok) {
    console.warn("[whatsapp/auto-reply] menu falhou:", r.error);
  } else {
    await registrarMetricaAutoReply({
      acao: r.metricaAcao || "menu",
      telefone,
      wamid: msg.wamid,
      messageId: r.messageId,
    });
    console.log("[whatsapp/auto-reply] menu ok", r.messageId);
  }
}

async function drenarFila() {
  if (processandoFila) return;
  processandoFila = true;
  try {
    while (fila.length) {
      const msg = fila.shift();
      try {
        await processarMensagem(msg);
      } catch (err) {
        console.error("[whatsapp/auto-reply]", err.message);
      }
    }
  } finally {
    processandoFila = false;
  }
}

/**
 * Aceita o webhook da Meta e enfileira mensagens (responde 200 rápido).
 */
export function enfileirarWebhookWhatsapp(body) {
  const msgs = extrairMensagensEntrada(body);
  if (!msgs.length) {
    // status/outros eventos — ignora em silêncio baixo
    const fields = [];
    for (const entry of body?.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field) fields.push(change.field);
      }
    }
    if (fields.length) {
      console.log("[whatsapp/webhook] evento sem messages:", fields.join(","));
    }
  }
  for (const msg of msgs) {
    if (fila.length >= MAX_FILA) {
      console.warn("[whatsapp/webhook] fila cheia — descartando mensagem");
      continue;
    }
    fila.push(msg);
  }
  if (msgs.length) {
    console.log("[whatsapp/webhook] enfileiradas", msgs.length, "fila", fila.length);
    setImmediate(() => {
      drenarFila().catch((err) =>
        console.error("[whatsapp/webhook] fila", err.message)
      );
    });
  }
  return { recebidas: msgs.length, fila: fila.length };
}

/** Limpeza ocasional de eventos antigos (anti-crescimento da tabela). */
export async function limparEventosWebhookAntigos(dias = 14) {
  const d = Math.max(3, Number(dias) || 14);
  await getPool().query(
    `DELETE FROM whatsapp_webhook_evento
     WHERE processado_em < NOW() - ($1::text || ' days')::interval`,
    [String(d)]
  );
}
