import { apiUrl, parseApiResponse } from "./api.js";
import { mensagemParaUsuario } from "./mensagensUsuario.js";

const STORAGE_KEY = "superama_session";

export function saveSession({ token, usuario }) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ token, usuario, savedAt: Date.now() })
  );
}

export function loadSession() {
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

export function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
}

export async function fetchAutenticado(path, options = {}) {
  const session = loadSession();
  if (!session?.token) {
    throw new Error("Sessão não encontrada");
  }

  const response = await fetch(apiUrl(path), {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.token}`,
      ...options.headers,
    },
  });

  const { data } = await parseApiResponse(response);

  if (response.status === 401) {
    clearSession();
    const err = new Error(
      mensagemParaUsuario(data.error || "Sua sessão expirou. Faça login novamente.")
    );
    err.code = "UNAUTHORIZED";
    throw err;
  }

  if (!response.ok) {
    throw new Error(mensagemParaUsuario(data.error));
  }

  return data;
}
