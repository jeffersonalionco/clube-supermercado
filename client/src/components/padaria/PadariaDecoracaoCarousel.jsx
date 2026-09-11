import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Cake, ChevronLeft, ChevronRight, ImageOff, X, ZoomIn } from "lucide-react";
import { formatarPrecoPadaria } from "../../utils/padariaSession.js";
import { resolveImagemUrl } from "../../utils/adminSession.js";
import { lockBodyScroll } from "../../utils/bodyScrollLock.js";

function metaDecoracao(d) {
  if (!d) return "Só o bolo";
  if (d.controlaEstoque && d.disponivel === false) return "Esgotada";
  const partes = [];
  if (d.codigo) partes.push(d.codigo);
  if (Number(d.preco) > 0) partes.push(`+${formatarPrecoPadaria(d.preco)}`);
  else partes.push("Grátis");
  return partes.join(" · ");
}

function portalPadaria() {
  if (typeof document === "undefined") return null;
  return document.querySelector(".padaria-app") || document.body;
}

/**
 * Carrossel horizontal de decorações + lightbox (portal em .padaria-app).
 */
export default function PadariaDecoracaoCarousel({
  decoracoes = [],
  selecionada = null,
  onSelect,
  permitirSemDecoracao = true,
  modo = "catalogo",
}) {
  const trackRef = useRef(null);
  const [lightbox, setLightbox] = useState(null);
  const [podeEsquerda, setPodeEsquerda] = useState(false);
  const [podeDireita, setPodeDireita] = useState(false);
  const [portalEl, setPortalEl] = useState(null);

  const lista = (decoracoes || []).filter((d) => d.ativo !== false);

  useEffect(() => {
    setPortalEl(portalPadaria());
  }, []);

  function atualizarSetas() {
    const el = trackRef.current;
    if (!el) return;
    setPodeEsquerda(el.scrollLeft > 4);
    setPodeDireita(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }

  useEffect(() => {
    atualizarSetas();
    const el = trackRef.current;
    if (!el) return undefined;

    const onScroll = () => atualizarSetas();
    // Só desvia a roda quando o gesto já é horizontal (trackpad) ou Shift+roda.
    // Assim o scroll vertical do modal/página continua funcionando sobre o carrossel.
    const onWheel = (e) => {
      if (el.scrollWidth <= el.clientWidth + 2) return;
      const horizontal =
        Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey;
      if (!horizontal) return;
      const delta = e.shiftKey && Math.abs(e.deltaY) >= Math.abs(e.deltaX)
        ? e.deltaY
        : e.deltaX || e.deltaY;
      if (!delta) return;
      const atStart = el.scrollLeft <= 1;
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 2;
      if ((delta < 0 && atStart) || (delta > 0 && atEnd)) return;
      e.preventDefault();
      el.scrollLeft += delta;
      atualizarSetas();
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("resize", atualizarSetas);
    const t = window.setTimeout(atualizarSetas, 80);
    return () => {
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("wheel", onWheel);
      window.removeEventListener("resize", atualizarSetas);
      window.clearTimeout(t);
    };
  }, [lista.length]);

  useEffect(() => {
    if (!lightbox) return undefined;
    const unlock = lockBodyScroll();
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setLightbox(null);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      unlock();
      window.removeEventListener("keydown", onKey, true);
    };
  }, [lightbox]);

  function rolar(dir) {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({
      left: dir * Math.min(260, el.clientWidth * 0.8),
      behavior: "smooth",
    });
  }

  function abrirLightbox(deco, e) {
    e?.stopPropagation?.();
    e?.preventDefault?.();
    if (!deco) return;
    if (deco.controlaEstoque && deco.disponivel === false) return;
    setLightbox(deco);
  }

  function escolher(deco) {
    if (deco && deco.controlaEstoque && deco.disponivel === false) return;
    onSelect?.(deco);
    setLightbox(null);
  }

  if (!lista.length && !permitirSemDecoracao) return null;

  const lightboxNode =
    lightbox &&
    portalEl &&
    createPortal(
      <div
        className="padaria-deco-lightbox"
        role="dialog"
        aria-modal="true"
        aria-label={lightbox.nome}
        onClick={() => setLightbox(null)}
      >
        <div
          className="padaria-deco-lightbox__panel"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="padaria-deco-lightbox__close"
            onClick={() => setLightbox(null)}
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
          <div className="padaria-deco-lightbox__media">
            {resolveImagemUrl(lightbox.imagemUrl) ? (
              <img
                src={resolveImagemUrl(lightbox.imagemUrl)}
                alt={lightbox.nome}
              />
            ) : (
              <div className="padaria-deco-lightbox__ph">
                <Cake size={48} strokeWidth={1.25} />
                <span>Sem foto</span>
              </div>
            )}
          </div>
          <div className="padaria-deco-lightbox__body">
            <h3>{lightbox.nome}</h3>
            {lightbox.codigo && (
              <p className="padaria-deco-lightbox__cod">
                Código <strong>{lightbox.codigo}</strong>
              </p>
            )}
            <p className="padaria-deco-lightbox__preco">
              {Number(lightbox.preco) > 0
                ? `+ ${formatarPrecoPadaria(lightbox.preco)} · valor fixo`
                : "Grátis"}
            </p>
            {lightbox.descricao && <p>{lightbox.descricao}</p>}
            {modo === "catalogo" && (
              <p className="pk-field-hint" style={{ margin: 0 }}>
                Mostre o código ao atendente na hora do pedido.
              </p>
            )}
            {lightbox.produtoNome && (
              <p className="pk-field-hint" style={{ margin: 0 }}>
                {lightbox.global || lightbox.produtoNome === "Todos os bolos"
                  ? "Disponível em todos os bolos"
                  : `Para: ${lightbox.produtoNome}`}
              </p>
            )}
            <div className="padaria-deco-lightbox__acoes">
              <button
                type="button"
                className="padaria-btn padaria-btn--ghost"
                onClick={() => setLightbox(null)}
              >
                Fechar
              </button>
              <button
                type="button"
                className="padaria-btn padaria-btn--primary"
                onClick={() => escolher(lightbox)}
              >
                Escolher esta
              </button>
            </div>
          </div>
        </div>
      </div>,
      portalEl
    );

  return (
    <div className="padaria-deco-carrossel">
      <div className="padaria-deco-carrossel__head">
        <strong>Decoração (opcional)</strong>
        <p className="pk-field-hint">
          Padrão: sem decoração. Toque no card para escolher; no ícone para ampliar.
        </p>
      </div>

      <div className="padaria-deco-carrossel__wrap">
        <button
          type="button"
          className="padaria-deco-carrossel__nav padaria-deco-carrossel__nav--prev"
          onClick={() => rolar(-1)}
          disabled={!podeEsquerda}
          aria-label="Anterior"
        >
          <ChevronLeft size={20} />
        </button>

        <div className="padaria-deco-carrossel__track" ref={trackRef}>
          {permitirSemDecoracao && (
            <div
              role="button"
              tabIndex={0}
              className={`padaria-deco-card ${!selecionada ? "is-active" : ""}`}
              onClick={() => escolher(null)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  escolher(null);
                }
              }}
            >
              {!selecionada && (
                <span className="padaria-deco-card__badge">Atual</span>
              )}
              <span className="padaria-deco-card__media padaria-deco-card__media--empty">
                <Cake size={26} strokeWidth={1.4} />
              </span>
              <span className="padaria-deco-card__nome">Sem decoração</span>
              <span className="padaria-deco-card__meta">Só o bolo</span>
            </div>
          )}

          {lista.map((d) => {
            const img = resolveImagemUrl(d.imagemUrl);
            const ativa = selecionada?.id === d.id;
            const esgotada = d.controlaEstoque && d.disponivel === false;
            return (
              <div
                key={d.id}
                role="button"
                tabIndex={esgotada ? -1 : 0}
                aria-disabled={esgotada}
                className={`padaria-deco-card ${ativa ? "is-active" : ""} ${
                  esgotada ? "is-esgotada" : ""
                }`}
                onClick={() => !esgotada && escolher(d)}
                onKeyDown={(e) => {
                  if (esgotada) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    escolher(d);
                  }
                }}
              >
                {ativa && (
                  <span className="padaria-deco-card__badge">Atual</span>
                )}
                <span className="padaria-deco-card__media">
                  {img ? (
                    <img src={img} alt="" loading="lazy" />
                  ) : (
                    <span className="padaria-deco-card__media--empty">
                      <ImageOff size={20} />
                    </span>
                  )}
                  {img && !esgotada && (
                    <button
                      type="button"
                      className="padaria-deco-card__zoom"
                      aria-label={`Ampliar ${d.nome}`}
                      onClick={(e) => abrirLightbox(d, e)}
                    >
                      <ZoomIn size={14} />
                    </button>
                  )}
                </span>
                <span className="padaria-deco-card__nome">{d.nome}</span>
                <span className="padaria-deco-card__meta">{metaDecoracao(d)}</span>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          className="padaria-deco-carrossel__nav padaria-deco-carrossel__nav--next"
          onClick={() => rolar(1)}
          disabled={!podeDireita}
          aria-label="Próxima"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {lightboxNode}
    </div>
  );
}
