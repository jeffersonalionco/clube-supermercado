export {
  formatCurrency,
  formatarPrecoPadaria,
  formatDate,
  formatDateTime,
  formatPhone,
  formatOrderCode,
  labelStatusPedido,
  STATUS_PEDIDO,
} from "./padariaFormat.js";

const STORAGE_KEY = "superama_padaria_session";

export function loadPadariaSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data?.token || !data?.usuario) return null;
    return data;
  } catch {
    return null;
  }
}

export function savePadariaSession(session) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearPadariaSession() {
  localStorage.removeItem(STORAGE_KEY);
}

export async function fetchPadaria(path, options = {}) {
  const session = loadPadariaSession();
  const isFormData = options.body instanceof FormData;
  const headers = {
    Accept: "application/json",
    ...(options.body && !isFormData ? { "Content-Type": "application/json" } : {}),
    ...(options.headers || {}),
  };
  if (session?.token) {
    headers.Authorization = `Bearer ${session.token}`;
  }

  const res = await fetch(`/api/padaria${path}`, {
    ...options,
    headers,
    body: isFormData
      ? options.body
      : options.body && typeof options.body !== "string"
        ? JSON.stringify(options.body)
        : options.body,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || "Erro na requisição");
    err.code = res.status === 401 ? "UNAUTHORIZED" : "ERROR";
    err.status = res.status;
    throw err;
  }
  return data;
}

/** Usa sessão admin do clube OU padaria gestor para rotas /admin. */
export async function fetchPadariaAdmin(path, options = {}) {
  let token = loadPadariaSession()?.token;
  if (!token) {
    try {
      const admin = JSON.parse(localStorage.getItem("superama_admin_session") || "null");
      token = admin?.token;
    } catch {
      token = null;
    }
  }

  const headers = {
    Accept: "application/json",
    ...(options.body && !(options.body instanceof FormData)
      ? { "Content-Type": "application/json" }
      : {}),
    ...(options.headers || {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`/api/padaria${path}`, {
    ...options,
    headers,
    body:
      options.body instanceof FormData
        ? options.body
        : options.body && typeof options.body !== "string"
          ? JSON.stringify(options.body)
          : options.body,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || "Erro na requisição");
    err.code = res.status === 401 ? "UNAUTHORIZED" : "ERROR";
    err.status = res.status;
    throw err;
  }
  return data;
}
