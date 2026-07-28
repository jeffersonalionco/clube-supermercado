import { useCallback, useEffect, useRef, useState } from "react";
import { apiUrl } from "../utils/api.js";
import { fetchAutenticado, loadSession } from "../utils/session.js";
import "../styles/radio-faixa.css";

function audioUrlComToken(audioUrl) {
  const session = loadSession();
  const token = session?.token;
  if (!token || !audioUrl) return null;
  const base = apiUrl(audioUrl);
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}token=${encodeURIComponent(token)}`;
}

async function esperarMeta(audio) {
  if (audio.readyState >= 1) return;
  await new Promise((resolve) => {
    const done = () => {
      audio.removeEventListener("loadedmetadata", done);
      resolve();
    };
    audio.addEventListener("loadedmetadata", done);
    setTimeout(resolve, 2000);
  });
}

/**
 * Faixa da Rádio Superama (stream ao vivo da loja).
 * Play manual; só escuta o estado da loja (não controla a rádio).
 */
export default function RadioSuperamaFaixa() {
  const audioRef = useRef(null);
  const listeningRef = useRef(false);
  const trackIdRef = useRef(null);
  const [estado, setEstado] = useState(null);
  const [ouvindo, setOuvindo] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  const sincronizarAudio = useCallback(async (dados, { forcarPlay = false } = {}) => {
    const audio = audioRef.current;
    if (!audio || !dados?.current?.audioUrl) return false;

    const src = audioUrlComToken(dados.current.audioUrl);
    if (!src) return false;

    const trackMudou = trackIdRef.current !== dados.current.id;
    if (trackMudou) {
      trackIdRef.current = dados.current.id;
      audio.src = src;
      audio.load();
      await esperarMeta(audio);
    } else if (!audio.getAttribute("src")) {
      trackIdRef.current = dados.current.id;
      audio.src = src;
      audio.load();
      await esperarMeta(audio);
    }

    const alvoSeg = Math.max(0, (Number(dados.positionMs) || 0) / 1000);
    try {
      const drift = Math.abs((audio.currentTime || 0) - alvoSeg);
      if (trackMudou || drift > 2.5) {
        audio.currentTime = alvoSeg;
      }
    } catch {
      /* ignore */
    }

    if (forcarPlay || listeningRef.current) {
      try {
        await audio.play();
        return true;
      } catch {
        return false;
      }
    }
    return true;
  }, []);

  const carregarEstado = useCallback(async () => {
    try {
      const data = await fetchAutenticado("/api/cliente/radio");
      setEstado(data);
      setErro("");
      if (listeningRef.current) {
        await sincronizarAudio(data);
      }
      return data;
    } catch (err) {
      setErro(err.message || "Rádio indisponível");
      return null;
    }
  }, [sincronizarAudio]);

  useEffect(() => {
    carregarEstado();
    const id = window.setInterval(() => {
      carregarEstado();
    }, 4000);
    return () => window.clearInterval(id);
  }, [carregarEstado]);

  useEffect(() => {
    return () => {
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.removeAttribute("src");
      }
    };
  }, []);

  async function handleToggle() {
    setErro("");
    if (ouvindo) {
      listeningRef.current = false;
      setOuvindo(false);
      audioRef.current?.pause();
      return;
    }

    setCarregando(true);
    try {
      const data = (await carregarEstado()) || estado;
      if (!data?.current?.audioUrl) {
        setErro("Nenhuma faixa no ar agora.");
        return;
      }
      listeningRef.current = true;
      const ok = await sincronizarAudio(data, { forcarPlay: true });
      if (!ok) {
        listeningRef.current = false;
        setErro("Toque de novo para liberar o áudio.");
        setOuvindo(false);
        return;
      }
      setOuvindo(true);
    } finally {
      setCarregando(false);
    }
  }

  const titulo = estado?.current?.title || "Aguardando programação…";
  const noAr = Boolean(estado?.playing || estado?.playerOnline);

  return (
    <section className="radio-faixa" aria-label="Rádio Superama">
      <audio ref={audioRef} preload="none" playsInline />

      <div className="radio-faixa__info">
        <p className="radio-faixa__eyebrow">
          <span className={`radio-faixa__dot${noAr ? " radio-faixa__dot--on" : ""}`} aria-hidden />
          {noAr ? "Ao vivo" : "Rádio"}
        </p>
        <h2 className="radio-faixa__station">{estado?.station || "Rádio Superama"}</h2>
        <p className="radio-faixa__track">{titulo}</p>
        {erro && <p className="radio-faixa__erro">{erro}</p>}
      </div>

      <button
        type="button"
        className={`radio-faixa__play${ouvindo ? " radio-faixa__play--on" : ""}`}
        onClick={handleToggle}
        disabled={carregando}
        aria-pressed={ouvindo}
        aria-label={ouvindo ? "Pausar rádio" : "Ouvir rádio ao vivo"}
      >
        {carregando ? "…" : ouvindo ? "❚❚" : "▶"}
        <span>{ouvindo ? "Pausar" : "Ouvir"}</span>
      </button>
    </section>
  );
}
