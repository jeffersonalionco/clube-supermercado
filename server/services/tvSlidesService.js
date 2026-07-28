const CACHE_MS = Number(process.env.TV_SLIDES_CACHE_MS || 45_000);
const FETCH_TIMEOUT_MS = Number(process.env.TV_SLIDES_TIMEOUT_MS || 8_000);

let cache = {
  expiresAt: 0,
  payload: null,
};

export function tvSlidesBaseUrl() {
  return String(process.env.TV_SLIDES_URL || "http://10.1.1.110:5055").replace(
    /\/$/,
    ""
  );
}

function mediaPathFromUrl(url) {
  const raw = String(url || "").trim();
  if (!raw.startsWith("/media/")) return null;
  const semQuery = raw.split("?")[0];
  // só arquivos sob /media/, sem path traversal
  if (semQuery.includes("..") || semQuery.includes("//")) return null;
  if (!/^\/media\/[A-Za-z0-9._-]+$/.test(semQuery)) return null;
  return semQuery;
}

async function fetchState() {
  const agora = Date.now();
  if (cache.payload && cache.expiresAt > agora) {
    return cache.payload;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(`${tvSlidesBaseUrl()}/api/state`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`TV Slides respondeu ${res.status}`);
    }
    const data = await res.json();
    cache = { payload: data, expiresAt: agora + CACHE_MS };
    return data;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Playlist ativa das TVs da loja, pronta para o app do clube.
 */
export async function listarOfertasTv() {
  const state = await fetchState();
  const imageSeconds = Number(state?.settings?.imageSeconds) || 8;
  const itens = (state?.playlist || [])
    .filter((item) => item && item.enabled !== false)
    .map((item) => {
      const mediaPath = mediaPathFromUrl(item.url);
      if (!mediaPath) return null;
      const tipo = item.type === "video" ? "video" : "image";
      return {
        id: String(item.id),
        tipo,
        nome: String(item.name || "").trim() || null,
        mediaPath,
        mediaUrl: `/api/cliente/ofertas/media${mediaPath.replace(/^\/media/, "")}`,
      };
    })
    .filter(Boolean);

  return {
    itens,
    imageSeconds,
    playlistId: state?.activePlaylistId || state?.settings?.activePlaylistId || null,
    atualizadoEm: new Date().toISOString(),
  };
}

/**
 * Resolve caminho seguro de mídia a partir do path da rota.
 * Ex.: "1784828714197-8ee089f9.png" → "/media/1784828714197-8ee089f9.png"
 */
export function resolverMediaPathSeguro(arquivo) {
  const nome = String(arquivo || "").split("?")[0].replace(/^\/+/, "");
  if (!nome || nome.includes("..") || nome.includes("/")) return null;
  if (!/^[A-Za-z0-9._-]+$/.test(nome)) return null;
  return `/media/${nome}`;
}

export async function proxyMediaTv(mediaPath, reqHeaders = {}) {
  const url = `${tvSlidesBaseUrl()}${mediaPath}`;
  const headers = {};
  if (reqHeaders.range) headers.Range = reqHeaders.range;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS * 4);

  try {
    const upstream = await fetch(url, { headers, signal: controller.signal });
    return upstream;
  } finally {
    clearTimeout(timer);
  }
}
