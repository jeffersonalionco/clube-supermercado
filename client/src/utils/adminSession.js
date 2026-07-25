import { apiUrl, parseApiResponse } from "./api.js";
import { mensagemParaUsuario } from "./mensagensUsuario.js";

const STORAGE_KEY = "superama_admin_session";

export function saveAdminSession({ token, admin }) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ token, admin, savedAt: Date.now() })
  );
}

export function loadAdminSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data?.token) return null;
    return data;
  } catch {
    return null;
  }
}

export function clearAdminSession() {
  localStorage.removeItem(STORAGE_KEY);
}

export async function fetchAdmin(path, options = {}) {
  const session = loadAdminSession();
  if (!session?.token) {
    throw new Error("Sessão de administrador não encontrada");
  }

  const response = await fetch(apiUrl(path), {
    ...options,
    cache: options.cache ?? "no-store",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.token}`,
      ...options.headers,
    },
  });

  const { data } = await parseApiResponse(response);

  if (response.status === 401) {
    clearAdminSession();
    const err = new Error(
      mensagemParaUsuario(data.error || "Sessão expirada. Faça login novamente.")
    );
    err.code = "UNAUTHORIZED";
    throw err;
  }

  if (!response.ok) {
    throw new Error(mensagemParaUsuario(data.error));
  }

  return data;
}

export async function loginAdmin(usuario, senha) {
  const response = await fetch(apiUrl("/api/admin/auth/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usuario, senha }),
  });

  const { data } = await parseApiResponse(response);

  if (!response.ok) {
    throw new Error(mensagemParaUsuario(data.error));
  }

  saveAdminSession({ token: data.token, admin: data.admin });
  return data;
}

export function resolveImagemUrl(url) {
  if (!url) return null;
  if (/^(https?:|data:)/.test(url)) return url;
  const base = (import.meta.env.VITE_API_BASE || "").replace(/\/$/, "");
  const caminho = url.startsWith("/") ? url : `/${url}`;
  return `${base}${caminho}`;
}

export async function uploadAdminImagem(file) {
  const session = loadAdminSession();
  if (!session?.token) {
    throw new Error("Sessão de administrador não encontrada");
  }

  const formData = new FormData();
  formData.append("imagem", file);

  const response = await fetch(apiUrl("/api/admin/brindes/upload"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.token}`,
    },
    body: formData,
  });

  const { data } = await parseApiResponse(response);

  if (response.status === 401) {
    clearAdminSession();
    const err = new Error(
      mensagemParaUsuario(data.error || "Sessão expirada. Faça login novamente.")
    );
    err.code = "UNAUTHORIZED";
    throw err;
  }

  if (!response.ok) {
    throw new Error(mensagemParaUsuario(data.error));
  }

  return data;
}
