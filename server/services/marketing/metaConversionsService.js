/**
 * Meta Pixel / Conversions API — match de catálogo (Loja / Advantage+).
 *
 * Regra de negócio (pagamento na loja física):
 * - ViewContent  → viu produto no catálogo público
 * - AddToCart    → iniciou pedido (site / WhatsApp / CTA)
 * - Purchase     → pedido confirmado para retirada (não é pagamento no caixa)
 *
 * content_ids / contents[].id = código do produto no catálogo Meta (mesmo id do sync).
 *
 * Env:
 *   META_PIXEL_ID=
 *   META_CAPI_TOKEN=          (opcional; senão META_CATALOG_TOKEN / WHATSAPP_CLOUD_TOKEN)
 *   META_CAPI_TEST_CODE=      (só homologação / Events Manager → Test events)
 *   META_TRACKING_ENABLED=true|false
 */
import { createHash, randomUUID } from "crypto";

const EVENTOS_OK = new Set(["ViewContent", "AddToCart", "Purchase"]);

function apiVersion() {
  return String(process.env.WHATSAPP_CLOUD_API_VERSION || "v21.0").replace(
    /^\/*/,
    ""
  );
}

export function metaPixelId() {
  return String(process.env.META_PIXEL_ID || "").trim();
}

function capiToken() {
  return (
    String(process.env.META_CAPI_TOKEN || "").trim() ||
    String(process.env.META_CATALOG_TOKEN || "").trim() ||
    String(process.env.WHATSAPP_CLOUD_TOKEN || "").trim()
  );
}

export function metaTrackingEnabled() {
  if (String(process.env.META_TRACKING_ENABLED || "true").toLowerCase() === "false") {
    return false;
  }
  return Boolean(metaPixelId());
}

export function metaCapiDisponivel() {
  return metaTrackingEnabled() && Boolean(capiToken());
}

export function metaPixelPublicConfig() {
  const pixelId = metaPixelId();
  return {
    enabled: metaTrackingEnabled() && Boolean(pixelId),
    pixelId: pixelId || null,
  };
}

function appPublicBase() {
  return String(process.env.APP_PUBLIC_URL || "https://clube.mercadosuperama.com.br")
    .trim()
    .replace(/\/$/, "");
}

function hashSha256(valor) {
  const raw = String(valor || "").trim().toLowerCase();
  if (!raw) return null;
  return createHash("sha256").update(raw).digest("hex");
}

function soLetras(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

/** Telefone só dígitos, com DDI 55 quando parecer BR. */
export function normalizarTelefoneParaHash(tel) {
  let d = String(tel || "").replace(/\D/g, "");
  if (!d) return null;
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  if (d.length < 12 || d.length > 15) return null;
  return d;
}

export function partirNomeParaHash(nome) {
  const parts = String(nome || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return { fn: null, ln: null };
  const fn = soLetras(parts[0]) || null;
  const ln =
    parts.length > 1 ? soLetras(parts.slice(1).join(" ")) || null : null;
  return { fn, ln };
}

/**
 * Normaliza itens do catálogo para custom_data da Meta.
 * Inclui `contents` (id + quantity + item_price) — flag exigida p/ catálogo.
 * @param {Array<{ codigo?: string, id?: string, nome?: string, preco?: number, quantidade?: number, categoria?: string }>} itens
 */
export function montarCustomDataCatalogo(itens = []) {
  const lista = (Array.isArray(itens) ? itens : [])
    .map((it) => {
      const id = String(it.codigo || it.id || "").trim();
      if (!id) return null;
      const qtd = Number(it.quantidade);
      const preco = Number(it.preco);
      const categoria = String(it.categoria || it.content_category || "").trim();
      return {
        id,
        nome: String(it.nome || "").trim() || null,
        quantidade: Number.isFinite(qtd) && qtd > 0 ? qtd : 1,
        preco: Number.isFinite(preco) && preco >= 0 ? preco : null,
        categoria: categoria || null,
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
  const num_items = lista.reduce((s, i) => s + i.quantidade, 0);

  const custom = {
    content_ids,
    contents,
    content_type: "product",
    currency: "BRL",
    num_items,
    value: temPreco ? Math.round(value * 100) / 100 : 0,
  };
  if (lista.length === 1 && lista[0].nome) {
    custom.content_name = lista[0].nome.slice(0, 200);
  }
  const categorias = [...new Set(lista.map((i) => i.categoria).filter(Boolean))];
  if (categorias.length === 1) {
    custom.content_category = categorias[0].slice(0, 200);
  }
  return { custom, content_ids, lista };
}

function montarUserData({
  telefone,
  email,
  nome,
  externalId,
  clientIp,
  userAgent,
  fbp,
  fbc,
  country = "br",
} = {}) {
  const user_data = {};
  const ph = normalizarTelefoneParaHash(telefone);
  if (ph) user_data.ph = [hashSha256(ph)];

  const em = String(email || "").trim().toLowerCase();
  if (em.includes("@")) user_data.em = [hashSha256(em)];

  const { fn, ln } = partirNomeParaHash(nome);
  if (fn) user_data.fn = [hashSha256(fn)];
  if (ln) user_data.ln = [hashSha256(ln)];

  const ext = String(externalId || "").replace(/\D/g, "");
  if (ext.length >= 11) {
    user_data.external_id = [hashSha256(ext)];
  } else if (ph) {
    user_data.external_id = [hashSha256(ph)];
  }

  const countryNorm = String(country || "br").trim().toLowerCase().slice(0, 2);
  if (countryNorm) user_data.country = [hashSha256(countryNorm)];

  if (clientIp) user_data.client_ip_address = String(clientIp).slice(0, 64);
  if (userAgent) user_data.client_user_agent = String(userAgent).slice(0, 512);
  if (fbp) user_data.fbp = String(fbp).slice(0, 128);
  if (fbc) user_data.fbc = String(fbc).slice(0, 512);
  return user_data;
}

/**
 * Envia evento à Conversions API.
 * @returns {Promise<{ ok: boolean, skipped?: boolean, eventsReceived?: number, error?: string }>}
 */
export async function enviarEventoCapi({
  eventName,
  eventId = null,
  eventTime = null,
  items = [],
  actionSource = "website",
  eventSourceUrl = null,
  telefone = null,
  email = null,
  nome = null,
  externalId = null,
  clientIp = null,
  userAgent = null,
  fbp = null,
  fbc = null,
  messagingChannel = null,
  orderId = null,
} = {}) {
  if (!EVENTOS_OK.has(eventName)) {
    return { ok: false, error: "evento_invalido" };
  }
  if (!metaCapiDisponivel()) {
    return { ok: true, skipped: true, motivo: "capi_off" };
  }

  const { custom, content_ids } = montarCustomDataCatalogo(items);
  if (!content_ids.length) {
    return { ok: false, error: "sem_content_ids" };
  }

  if (eventName === "Purchase") {
    custom.delivery_category = "in_store";
  }
  if (orderId) custom.order_id = String(orderId).slice(0, 100);

  const pixelId = metaPixelId();
  const eid = String(eventId || randomUUID());
  const source =
    actionSource === "chat" ? "business_messaging" : actionSource;
  const data = {
    event_name: eventName,
    event_time: eventTime || Math.floor(Date.now() / 1000),
    event_id: eid,
    action_source: source,
    user_data: montarUserData({
      telefone,
      email,
      nome,
      externalId,
      clientIp,
      userAgent,
      fbp,
      fbc,
    }),
    custom_data: custom,
  };

  const urlEvento =
    eventSourceUrl ||
    `${appPublicBase()}/#/padaria${
      content_ids.length === 1
        ? `?codigo=${encodeURIComponent(content_ids[0])}`
        : ""
    }`;
  data.event_source_url = urlEvento;

  if (source === "business_messaging") {
    data.messaging_channel = messagingChannel || "whatsapp";
  }

  const body = {
    data: [data],
  };
  const testCode = String(process.env.META_CAPI_TEST_CODE || "").trim();
  if (testCode) body.test_event_code = testCode;

  try {
    const res = await fetch(
      `https://graph.facebook.com/${apiVersion()}/${pixelId}/events`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${capiToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.error) {
      const msg =
        json?.error?.message || json?.error?.error_user_msg || `HTTP ${res.status}`;
      console.warn("[meta/capi]", eventName, content_ids.join(","), msg);
      return { ok: false, error: msg, eventId: eid };
    }
    console.log(
      "[meta/capi]",
      eventName,
      content_ids.join(","),
      `recv=${json.events_received ?? "?"}`,
      eid.slice(0, 8)
    );
    return {
      ok: true,
      eventId: eid,
      eventsReceived: json.events_received,
    };
  } catch (err) {
    console.warn("[meta/capi]", eventName, err.message);
    return { ok: false, error: err.message, eventId: eid };
  }
}

/** Atalho server-side (WhatsApp / jobs). Fire-and-forget seguro. */
export function trackCatalogoMetaFireAndForget(opts) {
  enviarEventoCapi(opts).catch((err) =>
    console.warn("[meta/capi] async:", err.message)
  );
}
