import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  carregarYoutubeApi,
  formatarTempoVideo,
} from "../utils/youtube.js";

function IconPlay() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path fill="currentColor" d="M8 5v14l11-7z" />
    </svg>
  );
}

function IconPause() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path fill="currentColor" d="M6 5h4v14H6zm8 0h4v14h-4z" />
    </svg>
  );
}

function IconVolume({ muted }) {
  if (muted) {
    return (
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
        <path
          fill="currentColor"
          d="M16.5 12a4.5 4.5 0 0 0-2.47-4.03l1.06-1.77A6 6 0 0 1 18.5 12a6 6 0 0 1-3.41 5.8l-1.06-1.77A4.5 4.5 0 0 0 16.5 12zM5 9v6h4l5 5V4L9 9H5zm11.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05A4.5 4.5 0 0 0 16.5 12z"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <path
        fill="currentColor"
        d="M3 10v4h4l5 5V5L7 10H3zm13.5 2a4.5 4.5 0 0 0-2.47-4.03l1.06-1.77A6 6 0 0 1 18.5 12a6 6 0 0 1-3.41 5.8l-1.06-1.77A4.5 4.5 0 0 0 16.5 12z"
      />
    </svg>
  );
}

function IconFullscreen() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <path
        fill="currentColor"
        d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"
      />
    </svg>
  );
}

export default function HomeVideoCard({ video }) {
  const playerHostId = useId().replace(/:/g, "");
  const shellRef = useRef(null);
  const playerRef = useRef(null);
  const tickRef = useRef(null);

  const [iniciado, setIniciado] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [tocando, setTocando] = useState(false);
  const [mutado, setMutado] = useState(false);
  const [tempoAtual, setTempoAtual] = useState(0);
  const [duracao, setDuracao] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);

  const pararTick = useCallback(() => {
    if (tickRef.current) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  const iniciarTick = useCallback(() => {
    pararTick();
    tickRef.current = window.setInterval(() => {
      const player = playerRef.current;
      if (!player?.getCurrentTime) return;
      setTempoAtual(player.getCurrentTime() || 0);
      const d = player.getDuration?.();
      if (d && Number.isFinite(d)) setDuracao(d);
      setTocando(player.getPlayerState?.() === window.YT?.PlayerState?.PLAYING);
    }, 250);
  }, [pararTick]);

  const destruirPlayer = useCallback(() => {
    pararTick();
    try {
      playerRef.current?.destroy?.();
    } catch {
      // ignore
    }
    playerRef.current = null;
  }, [pararTick]);

  useEffect(() => {
    return () => {
      destruirPlayer();
    };
  }, [destruirPlayer]);

  useEffect(() => {
    function onFullscreenChange() {
      setFullscreen(Boolean(document.fullscreenElement));
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const alternarPlay = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    const state = player.getPlayerState?.();
    if (state === window.YT.PlayerState.PLAYING) {
      player.pauseVideo();
      setTocando(false);
    } else {
      player.playVideo();
      setTocando(true);
    }
  }, []);

  const alternarMute = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    if (player.isMuted?.()) {
      player.unMute();
      setMutado(false);
    } else {
      player.mute();
      setMutado(true);
    }
  }, []);

  const buscarTempo = useCallback((valor) => {
    const player = playerRef.current;
    if (!player || !duracao) return;
    const pct = Math.min(100, Math.max(0, Number(valor)));
    player.seekTo((pct / 100) * duracao, true);
    setTempoAtual((pct / 100) * duracao);
  }, [duracao]);

  const alternarFullscreen = useCallback(async () => {
    const el = shellRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await el.requestFullscreen?.();
    }
  }, []);

  const iniciarReproducao = useCallback(async () => {
    if (!video?.videoId || carregando || iniciado) return;

    setCarregando(true);
    setErro("");

    try {
      const YT = await carregarYoutubeApi();
      setIniciado(true);

      await new Promise((resolve) => {
        window.requestAnimationFrame(resolve);
      });

      playerRef.current = new YT.Player(playerHostId, {
        videoId: video.videoId,
        playerVars: {
          autoplay: 1,
          controls: 0,
          disablekb: 1,
          fs: 0,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
          iv_load_policy: 3,
          origin: window.location.origin,
        },
        events: {
          onReady: (event) => {
            const d = event.target.getDuration?.();
            if (d && Number.isFinite(d)) setDuracao(d);
            event.target.playVideo();
            setTocando(true);
            iniciarTick();
            setCarregando(false);
          },
          onStateChange: (event) => {
            if (event.data === YT.PlayerState.PLAYING) {
              setTocando(true);
              const d = event.target.getDuration?.();
              if (d && Number.isFinite(d)) setDuracao(d);
            }
            if (event.data === YT.PlayerState.PAUSED) {
              setTocando(false);
            }
            if (event.data === YT.PlayerState.ENDED) {
              setTocando(false);
              setTempoAtual(duracao);
            }
          },
          onError: () => {
            setErro("Não foi possível reproduzir este vídeo.");
            setCarregando(false);
          },
        },
      });
    } catch {
      setErro("Não foi possível carregar o player de vídeo.");
      setCarregando(false);
      setIniciado(false);
    }
  }, [video?.videoId, carregando, iniciado, iniciarTick, duracao]);

  if (!video?.videoId) return null;

  const progresso = duracao > 0 ? (tempoAtual / duracao) * 100 : 0;
  const titulo = video.titulo || "Vídeo do clube";

  return (
    <section className="home-dash-card home-dash-card--video home-video-card">
      <div className="home-dash-card__head">
        <h3 className="home-dash-card__titulo">{titulo}</h3>
        <span className="home-video-card__badge">Clube Superama+</span>
      </div>

      <div
        ref={shellRef}
        className={`home-video-card__shell${fullscreen ? " home-video-card__shell--fs" : ""}${iniciado ? " home-video-card__shell--ativo" : ""}`}
      >
        <div className="home-video-card__media">
          {!iniciado && (
            <button
              type="button"
              className="home-video-card__poster"
              onClick={iniciarReproducao}
              disabled={carregando}
              aria-label={`Assistir ${titulo}`}
            >
              <img
                src={video.thumbnailUrl}
                alt=""
                className="home-video-card__thumb"
                loading="lazy"
              />
              <span className="home-video-card__play" aria-hidden>
                {carregando ? (
                  <span className="home-video-card__spinner" />
                ) : (
                  <IconPlay />
                )}
              </span>
              <span className="home-video-card__poster-shade" aria-hidden />
            </button>
          )}

          <div
            id={playerHostId}
            className="home-video-card__player"
            title={titulo}
          />

          {iniciado && (
            <div className="home-video-card__overlay">
              <button
                type="button"
                className="home-video-card__tap"
                onClick={alternarPlay}
                aria-label={tocando ? "Pausar vídeo" : "Reproduzir vídeo"}
              />
              <div className="home-video-card__bar">
                <input
                  type="range"
                  className="home-video-card__progress"
                  min="0"
                  max="100"
                  step="0.1"
                  value={progresso}
                  onChange={(e) => buscarTempo(e.target.value)}
                  aria-label="Progresso do vídeo"
                  style={{ "--hv-progress": `${progresso}%` }}
                />
                <div className="home-video-card__controls">
                  <button
                    type="button"
                    className="home-video-card__btn"
                    onClick={alternarPlay}
                    aria-label={tocando ? "Pausar" : "Reproduzir"}
                  >
                    {tocando ? <IconPause /> : <IconPlay />}
                  </button>
                  <span className="home-video-card__time">
                    {formatarTempoVideo(tempoAtual)}
                    <span aria-hidden> / </span>
                    {formatarTempoVideo(duracao)}
                  </span>
                  <div className="home-video-card__spacer" />
                  <button
                    type="button"
                    className="home-video-card__btn"
                    onClick={alternarMute}
                    aria-label={mutado ? "Ativar som" : "Silenciar"}
                  >
                    <IconVolume muted={mutado} />
                  </button>
                  <button
                    type="button"
                    className="home-video-card__btn"
                    onClick={alternarFullscreen}
                    aria-label={fullscreen ? "Sair da tela cheia" : "Tela cheia"}
                  >
                    <IconFullscreen />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {erro && (
        <p className="home-video-card__erro" role="alert">
          {erro}
        </p>
      )}
    </section>
  );
}
