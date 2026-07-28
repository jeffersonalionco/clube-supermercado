const FETCH_TIMEOUT_MS = Number(process.env.TV_SLIDES_TIMEOUT_MS || 8_000);
const STATE_CACHE_MS = Number(process.env.RADIO_STATE_CACHE_MS || 2_000);

let stateCache = { expiresAt: 0, payload: null };

export function radioBaseUrl() {
  return String(process.env.TV_SLIDES_URL || "http://10.1.1.110:5055").replace(
    /\/$/,
    ""
  );
}

function audioPathFromUrl(url) {
  const raw = String(url || "").trim().split("?")[0];
  if (!raw.startsWith("/radio/audio/")) return null;
  if (raw.includes("..") || raw.includes("//")) return null;
  if (!/^\/radio\/audio\/[A-Za-z0-9._-]+$/.test(raw)) return null;
  return raw;
}

export function resolverAudioRadioSeguro(arquivo) {
  const nome = String(arquivo || "").split("?")[0].replace(/^\/+/, "");
  if (!nome || nome.includes("..") || nome.includes("/")) return null;
  if (!/^[A-Za-z0-9._-]+$/.test(nome)) return null;
  return `/radio/audio/${nome}`;
}

async function fetchJson(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${radioBaseUrl()}${path}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Rádio respondeu ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Estado ao vivo da Rádio Mercado (somente leitura — não controla a loja).
 */
export async function obterEstadoRadio() {
  const agora = Date.now();
  if (stateCache.payload && stateCache.expiresAt > agora) {
    return stateCache.payload;
  }

  const raw = await fetchJson("/api/radio/state");
  const current = raw?.current || null;
  const audioPath = current ? audioPathFromUrl(current.url) : null;

  const payload = {
    station: String(raw?.station || "Rádio Superama").trim() || "Rádio Superama",
    playing: Boolean(raw?.playing),
    muted: Boolean(raw?.muted),
    positionMs: Number(raw?.positionMs) || 0,
    serverNow: Number(raw?.serverNow) || Date.now(),
    updatedAt: Number(raw?.updatedAt) || null,
    playerOnline: Boolean(raw?.playerOnline),
    current: current
      ? {
          id: String(current.id || ""),
          title: String(current.title || "No ar").trim() || "No ar",
          duration: Number(current.duration) || null,
          audioUrl: audioPath
            ? `/api/cliente/radio/audio/${audioPath.replace(/^\/radio\/audio\//, "")}`
            : null,
        }
      : null,
  };

  stateCache = { payload, expiresAt: agora + STATE_CACHE_MS };
  return payload;
}

export async function proxyAudioRadio(audioPath, reqHeaders = {}) {
  const url = `${radioBaseUrl()}${audioPath}`;
  const headers = {};
  if (reqHeaders.range) headers.Range = reqHeaders.range;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS * 6);

  try {
    return await fetch(url, { headers, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
