import { resolveImagemUrl } from "../utils/imagem.js";
import "../styles/marketing-video.css";

function srcDaUrl() {
  const hash = window.location.hash.slice(1);
  const q = hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : "";
  const src = new URLSearchParams(q).get("src") || "";
  if (!src) return null;
  // só permite uploads locais do marketing (segurança básica)
  if (!src.startsWith("/uploads/marketing/")) return null;
  if (src.includes("..")) return null;
  return src;
}

export default function AssistirVideoPage({ onVoltar }) {
  const srcRel = srcDaUrl();
  const src = srcRel ? resolveImagemUrl(srcRel) : null;

  return (
    <div className="mkt-video-page">
      <header className="mkt-video-page__head">
        <div>
          <p className="mkt-video-page__brand">Clube Superama+</p>
          <h1>Assistir vídeo</h1>
        </div>
        <button type="button" className="mkt-video-page__fechar" onClick={onVoltar}>
          Fechar
        </button>
      </header>

      {!src ? (
        <p className="mkt-video-page__erro" role="alert">
          Link de vídeo inválido.
        </p>
      ) : (
        <div className="mkt-video-page__player">
          <video controls playsInline preload="metadata" src={src}>
            Seu navegador não reproduz este vídeo.
          </video>
          <p className="mkt-video-page__nota">
            Se o vídeo não iniciar,{" "}
            <a href={src} target="_blank" rel="noopener noreferrer">
              abra o arquivo diretamente
            </a>
            .
          </p>
        </div>
      )}
    </div>
  );
}
