import { APP_VERSION } from "../version.js";

const STORAGE_KEY = "superama_app_version";
const RELOAD_ATTEMPT_KEY = "superama_reload_for";
const CHECK_MS = 60_000;

function lerVersaoServidor() {
  return fetch(`/api/app-version?t=${Date.now()}`, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  })
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      const v = data?.version != null ? String(data.version).trim() : "";
      return v || null;
    })
    .catch(() => null);
}

async function limparCachesLocais() {
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((reg) => reg.unregister().catch(() => {})));
    }
  } catch {
    /* ignore */
  }
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k).catch(() => {})));
    }
  } catch {
    /* ignore */
  }
}

function limparParametroCacheBust() {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("_v")) return;
    url.searchParams.delete("_v");
    const limpa = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState(window.history.state, "", limpa);
  } catch {
    /* ignore */
  }
}

/**
 * Recarrega a página com cache bypass (melhor esforço em mobile).
 */
export async function forcarAtualizacaoApp() {
  await limparCachesLocais();
  const url = new URL(window.location.href);
  url.searchParams.set("_v", String(Date.now()));
  window.location.replace(url.toString());
}

function jaTentouReloadPara(versaoRemota) {
  try {
    return sessionStorage.getItem(RELOAD_ATTEMPT_KEY) === String(versaoRemota);
  } catch {
    return false;
  }
}

function marcarTentativaReload(versaoRemota) {
  try {
    sessionStorage.setItem(RELOAD_ATTEMPT_KEY, String(versaoRemota));
  } catch {
    /* ignore */
  }
}

function limparTentativaReload() {
  try {
    sessionStorage.removeItem(RELOAD_ATTEMPT_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Compara a versão embutida no JS com a do servidor.
 * Atualiza no máximo 1 vez por versão (evita loop infinito).
 */
export function iniciarMonitorVersaoApp() {
  if (typeof window === "undefined") return () => {};

  let parado = false;
  let checando = false;
  const local = String(APP_VERSION || "").trim();

  async function checar() {
    if (parado || checando) return;
    checando = true;
    try {
      const remota = await lerVersaoServidor();
      if (!remota || parado) return;

      if (remota === local) {
        limparTentativaReload();
        limparParametroCacheBust();
        try {
          localStorage.setItem(STORAGE_KEY, local);
        } catch {
          /* ignore */
        }
        return;
      }

      // Versões diferentes: só tenta reload UMA vez por versão remota
      if (jaTentouReloadPara(remota)) {
        return;
      }

      marcarTentativaReload(remota);
      await forcarAtualizacaoApp();
    } finally {
      checando = false;
    }
  }

  const t0 = window.setTimeout(() => {
    checar();
  }, 4000);

  const intervalo = window.setInterval(() => {
    if (document.visibilityState === "visible") checar();
  }, CHECK_MS);

  const onVisivel = () => {
    if (document.visibilityState === "visible") checar();
  };
  document.addEventListener("visibilitychange", onVisivel);

  return () => {
    parado = true;
    window.clearTimeout(t0);
    window.clearInterval(intervalo);
    document.removeEventListener("visibilitychange", onVisivel);
  };
}
