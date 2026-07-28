const STORAGE_KEY = "superama_menu_coach_visto";

function lerMapa() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw);
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

export function menuCoachJaVisto(cpf) {
  const mapa = lerMapa();
  const chave = String(cpf || "").replace(/\D/g, "") || "_";
  return Boolean(mapa[chave]);
}

export function marcarMenuCoachVisto(cpf) {
  const mapa = lerMapa();
  const chave = String(cpf || "").replace(/\D/g, "") || "_";
  mapa[chave] = Date.now();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(mapa));
}

export function isMobileClientNav() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(max-width: 1023px)").matches;
}
