import { mensagemParaUsuario } from "./mensagensUsuario.js";

const API_BASE = (import.meta.env.VITE_API_BASE || "").replace(/\/$/, "");

export function apiUrl(path) {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${p}`;
}

export async function parseApiResponse(response) {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    try {
      const data = await response.json();
      if (data?.error) {
        data.error = mensagemParaUsuario(data.error);
      }
      return { data, isJson: true };
    } catch {
      return {
        data: {
          error: mensagemParaUsuario(null),
        },
        isJson: false,
      };
    }
  }

  await response.text();

  return {
    data: {
      error: mensagemParaUsuario(null),
    },
    isJson: false,
  };
}
