import { useEffect } from "react";
import "../styles/menu-coach.css";

export default function MenuCoachMark({ aberto, onFechar }) {
  useEffect(() => {
    if (!aberto) return undefined;
    const prev = document.body.style.overflow;
    document.body.classList.add("menu-coach-open");
    document.body.style.overflow = "hidden";
    return () => {
      document.body.classList.remove("menu-coach-open");
      document.body.style.overflow = prev;
    };
  }, [aberto]);

  if (!aberto) return null;

  return (
    <div className="menu-coach" role="dialog" aria-modal="true" aria-labelledby="menu-coach-title">
      <button
        type="button"
        className="menu-coach__backdrop"
        aria-label="Fechar dica"
        onClick={onFechar}
      />

      <div className="menu-coach__card">
        <span className="menu-coach__seta" aria-hidden />
        <p id="menu-coach-title" className="menu-coach__titulo">
          Menu aqui embaixo
        </p>
        <p className="menu-coach__texto">
          Toque nas abas para abrir Ofertas, Compras, Novidades e mais.
        </p>
        <button type="button" className="menu-coach__btn" onClick={onFechar}>
          Entendi
        </button>
      </div>

      <div className="menu-coach__spotlight" aria-hidden />
    </div>
  );
}
