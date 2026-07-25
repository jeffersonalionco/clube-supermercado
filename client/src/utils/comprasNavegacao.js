const STORAGE_KEY = "superama_compras_intent";

export function definirIntentCompras(intent) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(intent));
  } catch {
    /* storage indisponível */
  }
}

export function consumirIntentCompras() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(STORAGE_KEY);
    return JSON.parse(raw);
  } catch {
    sessionStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function intentComprasDia(data) {
  return {
    filtro: "custom",
    dataini: data,
    datafim: data,
    destacarDia: data,
  };
}

export function intentComprasFiltro(filtro) {
  return { filtro: String(filtro) };
}
