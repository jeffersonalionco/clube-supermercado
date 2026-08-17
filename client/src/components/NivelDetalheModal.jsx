import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import NivelBadge, { NivelIcon } from "./NivelBadge.jsx";
import NivelShareSheet from "./NivelShareSheet.jsx";
import {
  formatarReaisNivel,
  montarProgressoEscada,
} from "../utils/nivelClube.js";
import "../styles/nivel-detalhe.css";

export default function NivelDetalheModal({ aberto, clube, nome, onFechar }) {
  const tituloId = useId();
  const [shareAberto, setShareAberto] = useState(false);
  const escada = montarProgressoEscada(clube);
  const atual = escada.find((n) => n.atual) || escada[0];
  const proximo = escada.find((n) => n.id === clube?.proximoNivel?.id);
  const primeiroNome =
    String(nome || "")
      .trim()
      .split(/\s+/)[0] || "Cliente";
  const ano = clube?.anoReferencia || new Date().getFullYear();
  const gastoDesde = clube?.gastoDesde || null;
  const gasto = formatarReaisNivel(clube?.gastoAno, { centavos: true });
  const labelPeriodo =
    gastoDesde && gastoDesde !== `01/01/${ano}`
      ? `desde ${gastoDesde}`
      : `em ${ano}`;

  useEffect(() => {
    if (!aberto) {
      setShareAberto(false);
      return undefined;
    }
    document.documentElement.classList.add("nivel-detalhe-open");
    document.body.classList.add("nivel-detalhe-open");

    function onKey(e) {
      if (e.key === "Escape" && !shareAberto) onFechar?.();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.documentElement.classList.remove("nivel-detalhe-open");
      document.body.classList.remove("nivel-detalhe-open");
      window.removeEventListener("keydown", onKey);
    };
  }, [aberto, onFechar, shareAberto]);

  if (!aberto || typeof document === "undefined") return null;

  return createPortal(
    <>
      <div
        className={`nivel-detalhe nivel-detalhe--${atual?.id || "bronze"}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        style={
          shareAberto
            ? { visibility: "hidden", pointerEvents: "none" }
            : undefined
        }
      >
        <button
          type="button"
          className="nivel-detalhe__backdrop"
          aria-label="Fechar"
          onClick={onFechar}
        />

        <div className="nivel-detalhe__sheet">
          <header className="nivel-detalhe__hero">
            <div className="nivel-detalhe__handle" aria-hidden />
            <div className="nivel-detalhe__hero-glow" aria-hidden />
            <p className="nivel-detalhe__eyebrow">Clube Superama+</p>
            <div className="nivel-detalhe__medal">
              <NivelBadge clube={clube} size="lg" clickable={false} />
            </div>
            <h2 id={tituloId} className="nivel-detalhe__titulo">
              Seu nível, {primeiroNome}
            </h2>
            <p className="nivel-detalhe__lead">
              Quanto mais você compra no Superama com seu CPF, mais o nível
              sobe. Continue comprando e acompanhe sua evolução no clube.
            </p>
          </header>

          <div className="nivel-detalhe__body">
            <section
              className="nivel-detalhe__resumo"
              aria-label="Resumo do gasto no clube"
            >
              <div className="nivel-detalhe__stat">
                <span className="nivel-detalhe__stat-lbl">
                  Gasto {labelPeriodo}
                </span>
                <strong className="nivel-detalhe__stat-val">{gasto}</strong>
              </div>
              <div className="nivel-detalhe__stat">
                <span className="nivel-detalhe__stat-lbl">Nível atual</span>
                <strong className="nivel-detalhe__stat-val">
                  {atual?.nome}
                </strong>
              </div>
            </section>

            {proximo && clube?.faltaParaProximo > 0 && (
              <section
                className="nivel-detalhe__next"
                aria-label="Próximo nível"
              >
                <div className="nivel-detalhe__next-top">
                  <span>Próximo: {proximo.nome}</span>
                  <span>{clube.progressoPct ?? 0}%</span>
                </div>
                <div
                  className="nivel-detalhe__bar"
                  role="progressbar"
                  aria-valuenow={clube.progressoPct ?? 0}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <span
                    className="nivel-detalhe__bar-fill"
                    style={{ width: `${clube.progressoPct ?? 0}%` }}
                  />
                </div>
                <p className="nivel-detalhe__next-msg">
                  Faltam{" "}
                  <strong>{formatarReaisNivel(clube.faltaParaProximo)}</strong>{" "}
                  em compras no clube para conquistar o {proximo.nome}.
                </p>
              </section>
            )}

            {atual?.id === "diamante" && (
              <p className="nivel-detalhe__topo">
                Você está no topo! Continue comprando e aproveitando o Clube
                Superama+.
              </p>
            )}

            <section
              className="nivel-detalhe__escada"
              aria-label="Escada de níveis"
            >
              <h3 className="nivel-detalhe__escada-titulo">Como evoluir</h3>
              <ol className="nivel-detalhe__lista">
                {escada.map((nivel) => (
                  <li
                    key={nivel.id}
                    className={[
                      "nivel-detalhe__item",
                      `nivel-detalhe__item--${nivel.id}`,
                      nivel.atual ? "nivel-detalhe__item--atual" : "",
                      nivel.alcançado && !nivel.atual
                        ? "nivel-detalhe__item--ok"
                        : "",
                      !nivel.alcançado ? "nivel-detalhe__item--lock" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <div className="nivel-detalhe__item-icon">
                      <NivelIcon nivelId={nivel.id} size={28} />
                    </div>
                    <div className="nivel-detalhe__item-body">
                      <div className="nivel-detalhe__item-head">
                        <strong>{nivel.nome}</strong>
                        <span className="nivel-detalhe__item-meta">
                          {nivel.minInclusive === 0
                            ? "Cadastro"
                            : `A partir de ${formatarReaisNivel(nivel.minInclusive)}`}
                        </span>
                      </div>
                      <p className="nivel-detalhe__item-desc">
                        {nivel.descricao}
                      </p>
                      <p className="nivel-detalhe__item-frase">{nivel.frase}</p>
                      {nivel.atual && nivel.limiarProximo != null && (
                        <div className="nivel-detalhe__mini-bar">
                          <span
                            style={{ width: `${nivel.progressoPct}%` }}
                            aria-hidden
                          />
                        </div>
                      )}
                      {!nivel.alcançado && nivel.falta > 0 && (
                        <p className="nivel-detalhe__item-falta">
                          Faltam {formatarReaisNivel(nivel.falta)} para
                          desbloquear
                        </p>
                      )}
                      {nivel.alcançado && !nivel.atual && (
                        <p className="nivel-detalhe__item-ok">Conquistado</p>
                      )}
                      {nivel.atual && (
                        <p className="nivel-detalhe__item-ok nivel-detalhe__item-ok--atual">
                          Você está aqui
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            <p className="nivel-detalhe__nota">
              Contam as compras de {ano} feitas com o seu CPF no caixa,{" "}
              <strong>somente depois de ativar o Clube Superama+</strong>
              {gastoDesde ? ` (a partir de ${gastoDesde})` : ""}. Compras
              anteriores à ativação não entram no nível.
            </p>
          </div>

          <footer className="nivel-detalhe__footer">
            <button
              type="button"
              className="nivel-detalhe__cta nivel-detalhe__cta--share"
              onClick={() => setShareAberto(true)}
            >
              <span className="nivel-detalhe__cta-share-label">
                Compartilhar meu nível
              </span>
              <span className="nivel-detalhe__cta-share-hint">
                Mostre nas redes e divulgue o clube
              </span>
            </button>
            <button
              type="button"
              className="nivel-detalhe__cta-sec"
              onClick={onFechar}
            >
              Continuar no clube
            </button>
          </footer>
        </div>
      </div>

      <NivelShareSheet
        aberto={shareAberto}
        clube={clube}
        nome={nome}
        onFechar={() => setShareAberto(false)}
      />
    </>,
    document.body
  );
}
