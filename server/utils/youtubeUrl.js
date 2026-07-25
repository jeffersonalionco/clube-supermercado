/**
 * Extrai o ID de um vídeo a partir de URLs comuns do YouTube.
 * Retorna null se não reconhecer.
 */
export function extrairYoutubeVideoId(url) {
  const raw = String(url || "").trim();
  if (!raw) return null;

  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();

    if (host === "youtu.be") {
      const id = parsed.pathname.split("/").filter(Boolean)[0];
      return id && /^[\w-]{11}$/.test(id) ? id : null;
    }

    if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
      if (parsed.pathname === "/watch") {
        const id = parsed.searchParams.get("v");
        return id && /^[\w-]{11}$/.test(id) ? id : null;
      }
      const embedMatch = parsed.pathname.match(
        /^\/(?:embed|shorts|live|v)\/([\w-]{11})/
      );
      if (embedMatch) return embedMatch[1];
    }
  } catch {
    // URL inválida — tenta regex abaixo
  }

  const loose = raw.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:[^&]*&)*v=|embed\/|shorts\/|live\/))([\w-]{11})/
  );
  return loose?.[1] ?? null;
}

export function normalizarYoutubeUrl(url) {
  const id = extrairYoutubeVideoId(url);
  return id ? `https://www.youtube.com/watch?v=${id}` : "";
}
