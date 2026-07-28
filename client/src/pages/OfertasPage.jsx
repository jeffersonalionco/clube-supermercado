import { useCallback, useEffect, useRef, useState } from "react";
import ClientTabHeader from "../components/ClientTabHeader.jsx";
import EmptyState from "../components/EmptyState.jsx";
import PullToRefresh from "../components/PullToRefresh.jsx";
import RadioSuperamaFaixa from "../components/RadioSuperamaFaixa.jsx";
import { apiUrl } from "../utils/api.js";
import { fetchAutenticado, loadSession } from "../utils/session.js";
import { mensagemParaUsuario } from "../utils/mensagensUsuario.js";
import "../styles/ofertas.css";

function mediaUrlComToken(mediaUrl) {
  const session = loadSession();
  const token = session?.token;
  if (!token || !mediaUrl) return mediaUrl;
  const base = apiUrl(mediaUrl);
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}token=${encodeURIComponent(token)}`;
}

function OfertasSessao({ itens, imageSeconds, startIndex = 0, onFechar }) {
  const [indice, setIndice] = useState(startIndex);
  const [progresso, setProgresso] = useState(0);
  const videoRef = useRef(null);
  const timerRef = useRef(null);
  const startRef = useRef(0);
  const item = itens[indice];

  const limparTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const irPara = useCallback(
    (proximo) => {
      limparTimer();
      setProgresso(0);
      if (proximo < 0) {
        onFechar?.();
        return;
      }
      if (proximo >= itens.length) {
        onFechar?.();
        return;
      }
      setIndice(proximo);
    },
    [itens.length, limparTimer, onFechar]
  );

  useEffect(() => {
    limparTimer();
    setProgresso(0);
    if (!item) return undefined;

    if (item.tipo === "video") {
      const video = videoRef.current;
      if (!video) return undefined;

      const onTime = () => {
        if (!video.duration || !Number.isFinite(video.duration)) return;
        setProgresso(Math.min(1, video.currentTime / video.duration));
      };
      const onEnded = () => irPara(indice + 1);

      video.addEventListener("timeupdate", onTime);
      video.addEventListener("ended", onEnded);
      video.muted = true;
      video.playsInline = true;
      video.play().catch(() => {});

      return () => {
        video.removeEventListener("timeupdate", onTime);
        video.removeEventListener("ended", onEnded);
        limparTimer();
      };
    }

    const duracaoMs = Math.max(2, Number(imageSeconds) || 8) * 1000;
    startRef.current = Date.now();
    timerRef.current = setInterval(() => {
      const p = (Date.now() - startRef.current) / duracaoMs;
      if (p >= 1) {
        setProgresso(1);
        irPara(indice + 1);
        return;
      }
      setProgresso(p);
    }, 50);

    return () => limparTimer();
  }, [item, imageSeconds, indice, irPara, limparTimer]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  if (!item) return null;

  const src = mediaUrlComToken(item.mediaUrl);

  return (
    <div className="ofertas-sessao" role="dialog" aria-modal="true" aria-label="Sessão de ofertas">
      <div className="ofertas-sessao__barras" aria-hidden>
        {itens.map((it, i) => (
          <span key={it.id} className="ofertas-sessao__barra">
            <span
              className="ofertas-sessao__barra-fill"
              style={{
                width:
                  i < indice ? "100%" : i === indice ? `${Math.round(progresso * 100)}%` : "0%",
              }}
            />
          </span>
        ))}
      </div>

      <header className="ofertas-sessao__top">
        <p className="ofertas-sessao__meta">
          Ofertas · {indice + 1}/{itens.length}
        </p>
        <button type="button" className="ofertas-sessao__fechar" onClick={onFechar} aria-label="Fechar">
          ✕
        </button>
      </header>

      <div className="ofertas-sessao__stage">
        {item.tipo === "video" ? (
          <video
            key={item.id}
            ref={videoRef}
            className="ofertas-sessao__media"
            src={src}
            playsInline
            muted
            autoPlay
            controls={false}
          />
        ) : (
          <img key={item.id} className="ofertas-sessao__media" src={src} alt={item.nome || "Oferta"} />
        )}
      </div>

      <button
        type="button"
        className="ofertas-sessao__zona ofertas-sessao__zona--prev"
        aria-label="Anterior"
        onClick={() => irPara(indice - 1)}
      />
      <button
        type="button"
        className="ofertas-sessao__zona ofertas-sessao__zona--next"
        aria-label="Próxima"
        onClick={() => irPara(indice + 1)}
      />
    </div>
  );
}

export default function OfertasPage({ tabMode = false, onInicio }) {
  const [itens, setItens] = useState([]);
  const [imageSeconds, setImageSeconds] = useState(8);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sessaoAberta, setSessaoAberta] = useState(false);
  const [startIndex, setStartIndex] = useState(0);

  const carregar = useCallback(async () => {
    setError("");
    try {
      const data = await fetchAutenticado("/api/cliente/ofertas");
      setItens(data.itens || []);
      setImageSeconds(data.imageSeconds || 8);
    } catch (err) {
      setError(mensagemParaUsuario(err.message));
      setItens([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function onRefresh() {
    await carregar();
  }

  function abrirSessao(index = 0) {
    setStartIndex(index);
    setSessaoAberta(true);
  }

  return (
    <div className={`ofertas-page${tabMode ? " ofertas-page--tab" : ""}`}>
      {tabMode && (
        <ClientTabHeader title="Ofertas" onInicio={onInicio} />
      )}

      <PullToRefresh onRefresh={onRefresh}>
        <main className="ofertas-page__main">
          <RadioSuperamaFaixa />

          {loading ? (
            <p className="ofertas-page__status">Carregando ofertas…</p>
          ) : error ? (
            <EmptyState
              title="Não foi possível carregar"
              description={error}
              actionLabel="Tentar de novo"
              onAction={carregar}
            />
          ) : itens.length === 0 ? (
            <EmptyState
              title="Sem ofertas no momento"
              description="Quando a loja publicar promoções nas TVs, elas aparecem aqui."
            />
          ) : (
            <>
              <section className="ofertas-capa">
                <div className="ofertas-capa__preview">
                  <img
                    src={mediaUrlComToken(itens[0].mediaUrl)}
                    alt=""
                    className="ofertas-capa__img"
                  />
                  <div className="ofertas-capa__overlay">
                    <p className="ofertas-capa__qtd">
                      {itens.length} oferta{itens.length === 1 ? "" : "s"}
                    </p>
                    <button
                      type="button"
                      className="ofertas-capa__cta"
                      onClick={() => abrirSessao(0)}
                    >
                      Iniciar sessão
                    </button>
                  </div>
                </div>
                <p className="ofertas-capa__hint">
                  Toque para ver as promoções em tela cheia, no mesmo ritmo das TVs da loja.
                </p>
              </section>

              <ul className="ofertas-thumbs" aria-label="Prévia das ofertas">
                {itens.map((item, index) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className="ofertas-thumb"
                      onClick={() => abrirSessao(index)}
                    >
                      {item.tipo === "video" ? (
                        <video
                          className="ofertas-thumb__media"
                          src={mediaUrlComToken(item.mediaUrl)}
                          muted
                          playsInline
                          preload="metadata"
                        />
                      ) : (
                        <img
                          className="ofertas-thumb__media"
                          src={mediaUrlComToken(item.mediaUrl)}
                          alt={item.nome || `Oferta ${index + 1}`}
                          loading="lazy"
                        />
                      )}
                      {item.tipo === "video" && (
                        <span className="ofertas-thumb__badge">Vídeo</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </main>
      </PullToRefresh>

      {sessaoAberta && itens.length > 0 && (
        <OfertasSessao
          itens={itens}
          imageSeconds={imageSeconds}
          startIndex={startIndex}
          onFechar={() => setSessaoAberta(false)}
        />
      )}
    </div>
  );
}
