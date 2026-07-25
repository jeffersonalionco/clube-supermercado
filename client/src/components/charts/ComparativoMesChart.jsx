import { useId, useMemo } from "react";
import { formatarMoeda } from "../../utils/moeda.js";
import { montarComparativoMeses } from "../../utils/vendasCharts.js";

export default function ComparativoMesChart({ porData, onVerMes }) {
  const uid = useId().replace(/:/g, "");
  const dados = useMemo(() => montarComparativoMeses(porData), [porData]);

  if (!dados.temDados) {
    return (
      <div className="cchart cchart--empty cchart--empty-compact">
        <p className="cchart__empty-title">Comparativo em breve</p>
        <p className="cchart__empty-text">
          Com mais de um mês de compras, você verá a comparação aqui.
        </p>
      </div>
    );
  }

  const altura = 120;
  const barW = 56;
  const gap = 48;
  const baseY = altura;
  const hAtual = (dados.atual.gasto / dados.maxGasto) * (altura - 16);
  const hAnterior = (dados.anterior.gasto / dados.maxGasto) * (altura - 16);
  const xAnterior = 40;
  const xAtual = xAnterior + barW + gap;

  const agora = new Date();
  const mesAtualIdx = agora.getMonth();
  const anoAtual = agora.getFullYear();
  const mesAnteriorIdx = mesAtualIdx === 0 ? 11 : mesAtualIdx - 1;
  const anoAnterior = mesAtualIdx === 0 ? anoAtual - 1 : anoAtual;

  let variacaoLabel = null;
  if (dados.variacao != null) {
    const subiu = dados.variacao > 0;
    const igual = dados.variacao === 0;
    variacaoLabel = (
      <span
        className={`cchart__variacao${
          igual ? " cchart__variacao--neutro" : subiu ? " cchart__variacao--up" : " cchart__variacao--down"
        }`}
      >
        {igual ? "Igual ao mês anterior" : `${subiu ? "+" : ""}${dados.variacao}% vs mês anterior`}
      </span>
    );
  }

  return (
    <div className="cchart cchart--comparativo">
      <div className="cchart__head">
        <div>
          <h3 className="cchart__title">Mês a mês</h3>
          <p className="cchart__sub">Gasto total por período</p>
        </div>
        {variacaoLabel}
      </div>

      <div className="cchart__comp-layout">
        <svg
          className="cchart__comp-svg"
          viewBox={`0 0 200 ${altura + 36}`}
          preserveAspectRatio="xMidYMax meet"
          aria-hidden
        >
          <defs>
            <linearGradient id={`${uid}-atual`} x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="#1b4fa0" />
              <stop offset="100%" stopColor="#3ecf9a" />
            </linearGradient>
            <linearGradient id={`${uid}-ant`} x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="#94a89f" />
              <stop offset="100%" stopColor="#c5d4cc" />
            </linearGradient>
          </defs>

          <line x1="16" y1={baseY} x2="184" y2={baseY} className="cchart__grid-line cchart__grid-line--base" />

          <g
            className={`cchart__comp-bar-group${onVerMes ? " cchart__comp-bar-group--click" : ""}`}
            role={onVerMes ? "button" : undefined}
            tabIndex={onVerMes && dados.anterior.cupons > 0 ? 0 : undefined}
            onClick={() =>
              dados.anterior.cupons > 0 && onVerMes?.(mesAnteriorIdx, anoAnterior)
            }
            onKeyDown={(e) => {
              if (e.key === "Enter" && dados.anterior.cupons > 0) {
                onVerMes?.(mesAnteriorIdx, anoAnterior);
              }
            }}
          >
            <rect
              x={xAnterior}
              y={baseY - Math.max(hAnterior, dados.anterior.gasto > 0 ? 6 : 0)}
              width={barW}
              height={Math.max(hAnterior, dados.anterior.gasto > 0 ? 6 : 0)}
              rx={8}
              fill={`url(#${uid}-ant)`}
              className="cchart__comp-rect"
            />
            <text x={xAnterior + barW / 2} y={baseY + 14} className="cchart__comp-label">
              {dados.anterior.label}
            </text>
          </g>

          <g
            className={`cchart__comp-bar-group cchart__comp-bar-group--atual${onVerMes ? " cchart__comp-bar-group--click" : ""}`}
            role={onVerMes ? "button" : undefined}
            tabIndex={onVerMes && dados.atual.cupons > 0 ? 0 : undefined}
            onClick={() =>
              dados.atual.cupons > 0 && onVerMes?.(mesAtualIdx, anoAtual)
            }
            onKeyDown={(e) => {
              if (e.key === "Enter" && dados.atual.cupons > 0) {
                onVerMes?.(mesAtualIdx, anoAtual);
              }
            }}
          >
            <rect
              x={xAtual}
              y={baseY - Math.max(hAtual, dados.atual.gasto > 0 ? 6 : 0)}
              width={barW}
              height={Math.max(hAtual, dados.atual.gasto > 0 ? 6 : 0)}
              rx={8}
              fill={`url(#${uid}-atual)`}
              className="cchart__comp-rect cchart__comp-rect--atual"
            />
            <text x={xAtual + barW / 2} y={baseY + 14} className="cchart__comp-label">
              {dados.atual.label}
            </text>
          </g>
        </svg>

        {onVerMes && (
          <p className="cchart__hint cchart__hint--center">Clique em um mês para ver as compras</p>
        )}

        <div className="cchart__comp-stats">
          <button
            type="button"
            className="cchart__comp-stat cchart__comp-stat--btn"
            disabled={!onVerMes || dados.atual.cupons === 0}
            onClick={() => onVerMes?.(mesAtualIdx, anoAtual)}
          >
            <span className="cchart__comp-stat-lbl">{dados.atual.label} (atual)</span>
            <strong>{formatarMoeda(dados.atual.gasto)}</strong>
            <small>
              {dados.atual.cupons} {dados.atual.cupons === 1 ? "cupom" : "cupons"}
            </small>
          </button>
          <button
            type="button"
            className="cchart__comp-stat cchart__comp-stat--btn cchart__comp-stat--muted"
            disabled={!onVerMes || dados.anterior.cupons === 0}
            onClick={() => onVerMes?.(mesAnteriorIdx, anoAnterior)}
          >
            <span className="cchart__comp-stat-lbl">{dados.anterior.label}</span>
            <strong>{formatarMoeda(dados.anterior.gasto)}</strong>
            <small>
              {dados.anterior.cupons} {dados.anterior.cupons === 1 ? "cupom" : "cupons"}
            </small>
          </button>
        </div>
      </div>
    </div>
  );
}
