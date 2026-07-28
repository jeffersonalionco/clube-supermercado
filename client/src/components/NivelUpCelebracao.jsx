import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import NivelBadge from "./NivelBadge.jsx";
import { META_NIVEIS } from "../utils/nivelCelebracao.js";
import "../styles/nivel-celebracao.css";

function particulas(seed, qtd = 24) {
  const itens = [];
  for (let i = 0; i < qtd; i += 1) {
    const n = (seed * (i + 3) * 17) % 100;
    itens.push({
      id: i,
      left: `${(n * 9.7 + i * 3.1) % 100}%`,
      delay: `${(i % 12) * 0.12}s`,
      dur: `${2.2 + (i % 5) * 0.35}s`,
      size: `${6 + (i % 5) * 3}px`,
      tom: i % 4,
    });
  }
  return itens;
}

export default function NivelUpCelebracao({
  aberto,
  clube,
  nome,
  nivelAnteriorId,
  onFechar,
}) {
  const nivelId = clube?.nivelId || "prata";
  const meta = META_NIVEIS[nivelId] || META_NIVEIS.prata;
  const anterior = META_NIVEIS[nivelAnteriorId]?.nome;
  const primeiroNome =
    String(nome || "cliente")
      .trim()
      .split(/\s+/)[0] || "cliente";

  const confetes = useMemo(
    () => particulas((nivelId?.length || 1) * 13 + (primeiroNome.length || 1)),
    [nivelId, primeiroNome]
  );

  useEffect(() => {
    if (!aberto) return undefined;

    document.documentElement.classList.add("nivel-up-open");
    document.body.classList.add("nivel-up-open");

    function onKey(e) {
      if (e.key === "Escape") onFechar?.();
    }
    window.addEventListener("keydown", onKey);

    return () => {
      document.documentElement.classList.remove("nivel-up-open");
      document.body.classList.remove("nivel-up-open");
      window.removeEventListener("keydown", onKey);
    };
  }, [aberto, onFechar]);

  if (!aberto || typeof document === "undefined") return null;

  return createPortal(
    <div
      className={`nivel-up nivel-up--${nivelId}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="nivel-up-titulo"
      aria-describedby="nivel-up-desc"
    >
      <button
        type="button"
        className="nivel-up__backdrop"
        aria-label="Fechar"
        onClick={onFechar}
      />

      <div className="nivel-up__confetti" aria-hidden>
        {confetes.map((p) => (
          <span
            key={p.id}
            className={`nivel-up__dot nivel-up__dot--${p.tom}`}
            style={{
              left: p.left,
              width: p.size,
              height: p.size,
              animationDelay: p.delay,
              animationDuration: p.dur,
            }}
          />
        ))}
      </div>

      <div className="nivel-up__card">
        <p className="nivel-up__eyebrow">Novo nível desbloqueado</p>

        <div className="nivel-up__medal">
          <div className="nivel-up__ring" aria-hidden />
          <NivelBadge clube={clube} size="lg" className="nivel-up__badge" />
        </div>

        <h2 id="nivel-up-titulo" className="nivel-up__titulo">
          Parabéns, {primeiroNome}!
        </h2>

        <p id="nivel-up-desc" className="nivel-up__texto">
          {anterior ? (
            <>
              Você subiu de <strong>{anterior}</strong> para{" "}
              <strong>{meta.nome}</strong>
              {meta.descricao ? ` — ${meta.descricao.toLowerCase()}` : ""}.
            </>
          ) : (
            <>
              Você alcançou o nível <strong>{meta.nome}</strong>
              {meta.descricao ? ` — ${meta.descricao.toLowerCase()}` : ""}.
            </>
          )}
        </p>

        <p className="nivel-up__msg">
          O <strong>Superama</strong> está muito feliz com você. Continue comprando
          com o seu CPF e evolua ainda mais no Clube Superama+.
        </p>

        <button type="button" className="nivel-up__cta" onClick={onFechar}>
          Continuar no painel
        </button>
      </div>
    </div>,
    document.body
  );
}
