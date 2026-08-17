import { useCallback, useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import {
  baixarCardNivel,
  compartilharNivelNativo,
  gerarCardNivelShare,
  montarTextoShareNivel,
} from "../utils/nivelShare.js";
import "../styles/nivel-share.css";

export default function NivelShareSheet({
  aberto,
  clube,
  nome,
  onFechar,
}) {
  const tituloId = useId();
  const nivelId = clube?.nivelId || "bronze";
  const [formato, setFormato] = useState("stories");
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [erro, setErro] = useState("");

  const texto = montarTextoShareNivel({ nivelId, nome });

  const gerar = useCallback(async () => {
    setLoading(true);
    setErro("");
    try {
      const card = await gerarCardNivelShare({
        nivelId,
        nome,
        formato,
      });
      setPreview(card);
    } catch (err) {
      setErro(err.message || "Não foi possível gerar a arte.");
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }, [nivelId, nome, formato]);

  useEffect(() => {
    if (!aberto) return undefined;
    document.documentElement.classList.add("nivel-share-open");
    document.body.classList.add("nivel-share-open");
    gerar();

    function onKey(e) {
      if (e.key === "Escape") onFechar?.();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.documentElement.classList.remove("nivel-share-open");
      document.body.classList.remove("nivel-share-open");
      window.removeEventListener("keydown", onKey);
    };
  }, [aberto, gerar, onFechar]);

  async function handleCompartilhar() {
    if (!preview?.blob) return;
    setStatus("");
    try {
      const res = await compartilharNivelNativo({
        blob: preview.blob,
        fileName: preview.fileName,
        texto,
      });
      if (res.ok) {
        setStatus(
          res.modo === "share-files"
            ? "Pronto — escolha o app e publique!"
            : "Texto aberto no compartilhamento. Baixe a arte se quiser anexar a imagem."
        );
      } else {
        await baixarCardNivel(preview.blob, preview.fileName);
        setStatus("Imagem baixada. Publique no Stories/Feed e cole o texto.");
      }
    } catch (err) {
      if (err?.name === "AbortError") return;
      try {
        await baixarCardNivel(preview.blob, preview.fileName);
        setStatus("Imagem baixada. Publique e cole o texto sugerido.");
      } catch {
        setErro("Não foi possível compartilhar neste aparelho.");
      }
    }
  }

  async function handleBaixar() {
    if (!preview?.blob) return;
    await baixarCardNivel(preview.blob, preview.fileName);
    setStatus("Arte salva no aparelho.");
  }

  async function handleCopiarTexto() {
    try {
      await navigator.clipboard.writeText(texto);
      setStatus("Texto copiado — cole na legenda do post.");
    } catch {
      setErro("Não foi possível copiar. Selecione o texto manualmente.");
    }
  }

  if (!aberto || typeof document === "undefined") return null;

  return createPortal(
    <div
      className={`nivel-share nivel-share--${nivelId}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={tituloId}
    >
      <button
        type="button"
        className="nivel-share__backdrop"
        aria-label="Fechar"
        onClick={onFechar}
      />

      <div className="nivel-share__sheet">
        <header className="nivel-share__head">
          <div className="nivel-share__handle" aria-hidden />
          <p className="nivel-share__eyebrow">Divulgue o clube</p>
          <h2 id={tituloId}>Compartilhar meu nível</h2>
          <p className="nivel-share__lead">
            Gere uma arte pronta para Stories ou Feed. Você ganha visibilidade —
            e o Clube Superama+ chega a mais gente.
          </p>
        </header>

        <div className="nivel-share__body">
          <div className="nivel-share__formatos" role="tablist" aria-label="Formato">
            <button
              type="button"
              className={`nivel-share__chip${formato === "stories" ? " is-ativo" : ""}`}
              onClick={() => setFormato("stories")}
            >
              Stories
            </button>
            <button
              type="button"
              className={`nivel-share__chip${formato === "feed" ? " is-ativo" : ""}`}
              onClick={() => setFormato("feed")}
            >
              Feed
            </button>
          </div>

          <div
            className={`nivel-share__preview nivel-share__preview--${formato}`}
            aria-live="polite"
          >
            {loading && !preview ? (
              <p className="nivel-share__loading">Gerando arte…</p>
            ) : preview?.dataUrl ? (
              <img
                src={preview.dataUrl}
                alt={`Arte de compartilhamento nível ${preview.tema?.nome || ""}`}
                className="nivel-share__img"
              />
            ) : (
              <p className="nivel-share__loading">Sem prévia.</p>
            )}
            {loading && preview ? (
              <span className="nivel-share__busy">Atualizando…</span>
            ) : null}
          </div>

          <label className="nivel-share__texto-label">
            Texto sugerido para a legenda
            <textarea
              className="nivel-share__texto"
              readOnly
              rows={6}
              value={texto}
            />
          </label>

          {status ? (
            <p className="nivel-share__status" role="status">
              {status}
            </p>
          ) : null}
          {erro ? (
            <p className="nivel-share__erro" role="alert">
              {erro}
            </p>
          ) : null}
        </div>

        <footer className="nivel-share__footer">
          <button
            type="button"
            className="nivel-share__btn nivel-share__btn--primary"
            onClick={handleCompartilhar}
            disabled={!preview?.blob || loading}
          >
            Compartilhar agora
          </button>
          <div className="nivel-share__acoes">
            <button
              type="button"
              className="nivel-share__btn nivel-share__btn--ghost"
              onClick={handleBaixar}
              disabled={!preview?.blob || loading}
            >
              Baixar imagem
            </button>
            <button
              type="button"
              className="nivel-share__btn nivel-share__btn--ghost"
              onClick={handleCopiarTexto}
            >
              Copiar texto
            </button>
          </div>
          <button
            type="button"
            className="nivel-share__fechar"
            onClick={onFechar}
          >
            Fechar
          </button>
        </footer>
      </div>
    </div>,
    document.body
  );
}
