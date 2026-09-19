/**
 * Meta Pixel + espelho CAPI (dedupe via event_id).
 * Config vem de GET /api/marketing/meta-config (sem rebuild ao mudar Pixel ID).
 *
 * Uso:
 *   ensureMetaPixel()
 *   trackCatalogEvent("ViewContent"|"AddToCart"|"Purchase", [{ codigo, nome, preco }])
 */
import { loadSession } from "../utils/session.js";

const EVENTOS_OK = new Set(["ViewContent", "AddToCart", "Purchase"]);

let configPromise = null;
let pixelReady = false;
let pageViewEnviado = false;
const vistos = new Set(); // ViewContent por código na sessão

function novoEventId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `ev_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function lerCookie(nome) {
  try {
    const m = document.cookie.match(
      new RegExp(`(?:^|; )${nome.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=([^;]*)`)
    );
    return m ? decodeURIComponent(m[1]) : null;
  } catch {
    return null;
  }
}

function fbclidDaUrl() {
  try {
    const qs = new URLSearchParams(window.location.search);
    const hashQ = String(window.location.hash.split("?")[1] || "");
    const hq = new URLSearchParams(hashQ);
    return qs.get("fbclid") || hq.get("fbclid") || null;
  } catch {
    return null;
  }
}

function obterFbc() {
  const cookie = lerCookie("_fbc");
  if (cookie) return cookie;
  const fbclid = fbclidDaUrl();
  if (!fbclid) return null;
  return `fb.1.${Date.now()}.${fbclid}`;
}

function soLetras(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

function dadosAvancadosSessao() {
  try {
    const usuario = loadSession()?.usuario;
    if (!usuario) return {};
    const out = {};
    const email = String(usuario.email || "").trim().toLowerCase();
    if (email.includes("@")) out.em = email;
    const tel = String(usuario.telefone || usuario.celular || "").replace(/\D/g, "");
    if (tel.length >= 10) {
      out.ph = tel.length <= 11 ? `55${tel}` : tel;
    }
    const parts = String(usuario.nome || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (parts[0]) {
      const fn = soLetras(parts[0]);
      if (fn) out.fn = fn;
    }
    if (parts.length > 1) {
      const ln = soLetras(parts.slice(1).join(" "));
      if (ln) out.ln = ln;
    }
    const cpf = String(usuario.cpf || "").replace(/\D/g, "");
    if (cpf.length >= 11) out.external_id = cpf;
    out.country = "br";
    return out;
  } catch {
    return {};
  }
}

function userPayloadParaCapi() {
  const adv = dadosAvancadosSessao();
  return {
    email: adv.em || null,
    telefone: adv.ph || null,
    nome: loadSession()?.usuario?.nome || null,
    externalId: adv.external_id || null,
  };
}

async function carregarConfig() {
  if (configPromise) return configPromise;
  configPromise = fetch("/api/marketing/meta-config", { credentials: "omit" })
    .then((r) => (r.ok ? r.json() : { enabled: false }))
    .catch(() => ({ enabled: false }));
  return configPromise;
}

function injetarPixel(pixelId) {
  if (!pixelId || typeof window === "undefined") return;
  if (window.fbq && pixelReady) {
    const adv = dadosAvancadosSessao();
    if (Object.keys(adv).length) {
      try {
        window.fbq("init", pixelId, adv);
      } catch {
        /* ignore */
      }
    }
    return;
  }
  if (window.fbq) {
    pixelReady = true;
    return;
  }
  /* eslint-disable */
  !(function (f, b, e, v, n, t, s) {
    if (f.fbq) return;
    n = f.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    };
    if (!f._fbq) f._fbq = n;
    n.push = n;
    n.loaded = true;
    n.version = "2.0";
    n.queue = [];
    t = b.createElement(e);
    t.async = true;
    t.src = v;
    s = b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t, s);
  })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
  /* eslint-enable */
  const adv = dadosAvancadosSessao();
  if (Object.keys(adv).length) {
    window.fbq("init", pixelId, adv);
  } else {
    window.fbq("init", pixelId);
  }
  pixelReady = true;
}

function dispararPageView() {
  if (pageViewEnviado || !window.fbq) return;
  try {
    window.fbq("track", "PageView", {}, { eventID: novoEventId() });
    pageViewEnviado = true;
  } catch {
    /* ignore */
  }
}

function montarCustom(itens, { orderId } = {}) {
  const lista = (itens || [])
    .map((it) => {
      const id = String(it.codigo || it.id || "").trim();
      if (!id) return null;
      const qtd = Number(it.quantidade);
      const preco = Number(it.preco);
      const categoria = String(it.categoria || "").trim();
      return {
        id,
        nome: String(it.nome || "").trim() || undefined,
        quantidade: Number.isFinite(qtd) && qtd > 0 ? qtd : 1,
        preco: Number.isFinite(preco) && preco >= 0 ? preco : undefined,
        categoria: categoria || undefined,
      };
    })
    .filter(Boolean);

  const content_ids = lista.map((i) => i.id);
  const contents = lista.map((i) => {
    const row = { id: i.id, quantity: i.quantidade };
    if (i.preco != null) row.item_price = i.preco;
    return row;
  });

  let value = 0;
  let temPreco = false;
  for (const i of lista) {
    if (i.preco != null) {
      value += i.preco * i.quantidade;
      temPreco = true;
    }
  }
  const custom = {
    content_ids,
    contents,
    content_type: "product",
    currency: "BRL",
    num_items: lista.reduce((s, i) => s + i.quantidade, 0),
    value: temPreco ? Math.round(value * 100) / 100 : 0,
  };
  if (lista.length === 1 && lista[0].nome) {
    custom.content_name = lista[0].nome.slice(0, 200);
  }
  const categorias = [...new Set(lista.map((i) => i.categoria).filter(Boolean))];
  if (categorias.length === 1) {
    custom.content_category = categorias[0].slice(0, 200);
  }
  if (orderId) custom.order_id = String(orderId).slice(0, 100);
  return { custom, items: lista };
}

function urlEventoProduto(codigo, fallback) {
  try {
    const origin = window.location.origin;
    const id = String(codigo || "").trim();
    if (id) return `${origin}/#/padaria?codigo=${encodeURIComponent(id)}`;
    return fallback || window.location.href;
  } catch {
    return fallback || null;
  }
}

function esperarFbp(ms = 280) {
  const ja = lerCookie("_fbp");
  if (ja) return Promise.resolve(ja);
  return new Promise((resolve) => {
    window.setTimeout(() => resolve(lerCookie("_fbp")), ms);
  });
}

function enviarEspelhoCapi(payload) {
  const body = JSON.stringify(payload);
  try {
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon("/api/marketing/meta-event", blob)) return;
    }
  } catch {
    /* fallback fetch */
  }
  fetch("/api/marketing/meta-event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "omit",
    keepalive: true,
    body,
  }).catch(() => {});
}

/** Sobe o Pixel (PageView) assim que o catálogo abre — não espera o 1º ViewContent. */
export async function ensureMetaPixel() {
  if (typeof window === "undefined") return { ok: false, skipped: true };
  const cfg = await carregarConfig();
  if (!cfg?.enabled || !cfg.pixelId) {
    return { ok: true, skipped: true, motivo: "pixel_off" };
  }
  injetarPixel(cfg.pixelId);
  dispararPageView();
  return { ok: true, pixelId: cfg.pixelId };
}

/**
 * @param {"ViewContent"|"AddToCart"|"Purchase"} eventName
 * @param {Array<{ codigo: string, nome?: string, preco?: number, quantidade?: number, categoria?: string }>} itens
 * @param {{ onceKey?: string, eventSourceUrl?: string, orderId?: string }} [opts]
 */
export async function trackCatalogEvent(eventName, itens, opts = {}) {
  if (!EVENTOS_OK.has(eventName)) return { ok: false, skipped: true };
  if (typeof window === "undefined") return { ok: false, skipped: true };

  const cfg = await carregarConfig();
  if (!cfg?.enabled || !cfg.pixelId) {
    return { ok: true, skipped: true, motivo: "pixel_off" };
  }

  const { custom, items } = montarCustom(itens, { orderId: opts.orderId });
  if (!custom.content_ids?.length) {
    return { ok: false, skipped: true, motivo: "sem_ids" };
  }

  if (eventName === "Purchase") {
    custom.delivery_category = "in_store";
  }

  const onceKey = opts.onceKey || (eventName === "ViewContent" ? custom.content_ids[0] : null);
  if (onceKey) {
    const key = `${eventName}:${onceKey}`;
    if (vistos.has(key)) return { ok: true, skipped: true, motivo: "dedupe_session" };
    vistos.add(key);
  }

  injetarPixel(cfg.pixelId);
  dispararPageView();
  const eventId = novoEventId();
  if (eventName === "Purchase" && !custom.order_id) {
    custom.order_id = eventId;
  }
  const eventSourceUrl =
    opts.eventSourceUrl ||
    urlEventoProduto(custom.content_ids[0], window.location.href);

  try {
    if (window.fbq) {
      window.fbq("track", eventName, custom, { eventID: eventId });
    }
  } catch {
    /* ignore */
  }

  const fbp = await esperarFbp();
  const user = userPayloadParaCapi();
  enviarEspelhoCapi({
    eventName,
    eventId,
    items: items.map((i) => ({
      codigo: i.id,
      nome: i.nome,
      preco: i.preco,
      quantidade: i.quantidade,
      categoria: i.categoria,
    })),
    eventSourceUrl,
    fbp,
    fbc: obterFbc(),
    orderId: custom.order_id || null,
    email: user.email,
    telefone: user.telefone,
    nome: user.nome,
    externalId: user.externalId,
  });

  return { ok: true, eventId };
}

function itemDeProduto(produto) {
  const codigo = String(produto?.codigo || "").trim();
  if (!codigo) return null;
  return {
    codigo,
    nome: produto.nome,
    preco: produto.preco,
    quantidade: 1,
    categoria: produto.categoriaNome || produto.categoria || undefined,
  };
}

export function trackViewContentProduto(produto) {
  const item = itemDeProduto(produto);
  if (!item) return Promise.resolve({ ok: false, skipped: true });
  return trackCatalogEvent("ViewContent", [item], {
    onceKey: item.codigo,
    eventSourceUrl: urlEventoProduto(item.codigo),
  });
}

export function trackAddToCartProduto(produto) {
  const item = itemDeProduto(produto);
  if (!item) return Promise.resolve({ ok: false, skipped: true });
  return trackCatalogEvent("AddToCart", [item], {
    eventSourceUrl: urlEventoProduto(item.codigo),
  });
}

export function trackPurchaseProduto(produto, opts = {}) {
  const item = itemDeProduto(produto);
  if (!item) return Promise.resolve({ ok: false, skipped: true });
  return trackCatalogEvent("Purchase", [item], {
    orderId: opts.orderId || `web_${item.codigo}_${Date.now()}`,
    eventSourceUrl: urlEventoProduto(item.codigo),
  });
}

/** ViewContent + AddToCart no Pixel do site (o catálogo Meta exige os dois). */
export function rastrearInteresseProduto(produto) {
  const item = itemDeProduto(produto);
  if (!item) return Promise.resolve({ ok: false, skipped: true });
  trackViewContentProduto(produto);
  return trackAddToCartProduto(produto);
}

/** AddToCart + Purchase no clique de encomenda, antes de abrir o WhatsApp. */
export async function trackFunilEncomenda(produto) {
  const item = itemDeProduto(produto);
  if (!item) return { ok: false, skipped: true };
  await trackAddToCartProduto(produto);
  await trackPurchaseProduto(produto);
  return { ok: true };
}
