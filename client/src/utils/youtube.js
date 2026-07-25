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

    if (
      host === "youtube.com" ||
      host === "m.youtube.com" ||
      host === "music.youtube.com"
    ) {
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
    // segue para regex
  }

  const loose = raw.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:[^&]*&)*v=|embed\/|shorts\/|live\/))([\w-]{11})/
  );
  return loose?.[1] ?? null;
}

let ytApiPromise = null;

export function carregarYoutubeApi() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("YouTube API indisponível"));
  }
  if (window.YT?.Player) {
    return Promise.resolve(window.YT);
  }
  if (!ytApiPromise) {
    ytApiPromise = new Promise((resolve, reject) => {
      const anterior = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        anterior?.();
        if (window.YT?.Player) resolve(window.YT);
        else reject(new Error("YouTube API não carregou"));
      };

      const existente = document.querySelector('script[src*="youtube.com/iframe_api"]');
      if (!existente) {
        const script = document.createElement("script");
        script.src = "https://www.youtube.com/iframe_api";
        script.async = true;
        script.onerror = () => reject(new Error("Falha ao carregar YouTube"));
        document.head.appendChild(script);
      }
    });
  }
  return ytApiPromise;
}

export function formatarTempoVideo(segundos) {
  const total = Math.max(0, Math.floor(Number(segundos) || 0));
  const min = Math.floor(total / 60);
  const sec = total % 60;
  return `${min}:${String(sec).padStart(2, "0")}`;
}
