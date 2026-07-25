import { useId, useMemo, useState } from "react";
import { formatarMoeda } from "../../utils/moeda.js";
import { montarSerieGastoDiario } from "../../utils/vendasCharts.js";

const ALTURA = 112;
const PAD_X = 12;
const BAR_W = 9;
const BAR_GAP = 5;

export default function GastoBarrasChart({ porData, dias = 30, onVerDia }) {
  const uid = useId().replace(/:/g, "");
  const [ativo, setAtivo] = useState(null);
  const serie = useMemo(() => montarSerieGastoDiario(porData, dias), [porData, dias]);

  const ticks = useMemo(() => {
    const { pontos } = serie;
    if (pontos.length <= 7) return pontos.map((_, i) => i);
    const passo = Math.max(1, Math.floor(pontos.length / 5));
    const idx = [];
    for (let i = 0; i < pontos.length; i += passo) idx.push(i);
    if (idx[idx.length - 1] !== pontos.length - 1) idx.push(pontos.length - 1);
    return idx;
  }, [serie]);

  if (!serie.pontos.some((p) => p.valor > 0)) {
    return (
      <div className="cchart cchart--empty">
        <p className="cchart__empty-title">Sem compras neste período</p>
        <p className="cchart__empty-text">
          Suas compras com CPF aparecerão aqui em um gráfico.
        </p>
      </div>
    );
  }

  const n = serie.pontos.length;
  const largura = PAD_X * 2 + n * BAR_W + (n - 1) * BAR_GAP;

  function selecionar(p) {
    setAtivo((prev) => (prev?.data === p.data ? null : p));
  }

  function abrirDia(p) {
    if (p.valor <= 0 || !onVerDia) return;
    onVerDia(p.data);
  }

  return (
    <div className="cchart cchart--barras">
      <div className="cchart__head">
        <div>
          <h3 className="cchart__title">Gasto diário</h3>
          <p className="cchart__sub">
            Total {formatarMoeda(serie.total)} · últimos {dias} dias
          </p>
        </div>
      </div>

      <div className="cchart__plot-wrap cchart__plot-wrap--barras">
        <svg
          className="cchart__svg cchart__svg--barras"
          viewBox={`0 0 ${largura} ${ALTURA + 8}`}
          preserveAspectRatio="xMidYMax meet"
          aria-hidden
        >
          <defs>
            <linearGradient id={`${uid}-bar`} x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="#0d2b66" />
              <stop offset="55%" stopColor="#1b4fa0" />
              <stop offset="100%" stopColor="#3ecf9a" />
            </linearGradient>
            <linearGradient id={`${uid}-bar-hi`} x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="#1b4fa0" />
              <stop offset="100%" stopColor="#5eecc0" />
            </linearGradient>
            <linearGradient id={`${uid}-glow`} x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="rgba(62, 207, 154, 0)" />
              <stop offset="100%" stopColor="rgba(62, 207, 154, 0.4)" />
            </linearGradient>
          </defs>

          {serie.maxValor > 0 &&
            [0.25, 0.5, 0.75].map((f) => (
              <line
                key={f}
                x1={PAD_X}
                y1={ALTURA - ALTURA * f}
                x2={largura - PAD_X}
                y2={ALTURA - ALTURA * f}
                className="cchart__grid-line"
              />
            ))}

          {serie.pontos.map((p, i) => {
            const h = serie.maxValor > 0 ? (p.valor / serie.maxValor) * ALTURA : 0;
            const x = PAD_X + i * (BAR_W + BAR_GAP);
            const y = ALTURA - h;
            const selecionado = ativo?.data === p.data;
            const temValor = p.valor > 0;
            return (
              <g key={p.data} className="cchart__bar-group">
                <rect
                  x={x}
                  y={y}
                  width={BAR_W}
                  height={Math.max(h, temValor ? 4 : 0)}
                  rx={3}
                  fill={selecionado ? `url(#${uid}-bar-hi)` : `url(#${uid}-bar)`}
                  className={`cchart__bar${p.destaque ? " cchart__bar--hoje" : ""}${selecionado ? " cchart__bar--ativo" : ""}`}
                  style={{ animationDelay: `${i * 18}ms` }}
                  opacity={temValor ? 1 : 0.1}
                />
                {temValor && h > 10 && (
                  <rect
                    x={x}
                    y={y}
                    width={BAR_W}
                    height={h}
                    rx={3}
                    fill={`url(#${uid}-glow)`}
                    className="cchart__bar-glow"
                    pointerEvents="none"
                  />
                )}
              </g>
            );
          })}
        </svg>

        <div className="cchart__hit-area" aria-hidden>
          {serie.pontos.map((p) => (
            <button
              key={p.data}
              type="button"
              className={`cchart__hit${ativo?.data === p.data ? " cchart__hit--on" : ""}${p.valor > 0 ? " cchart__hit--compra" : ""}`}
              onMouseEnter={() => p.valor > 0 && setAtivo(p)}
              onFocus={() => p.valor > 0 && setAtivo(p)}
              onMouseLeave={() => setAtivo(null)}
              onBlur={() => setAtivo(null)}
              onClick={() => {
                if (p.valor > 0) selecionar(p);
              }}
              onDoubleClick={() => abrirDia(p)}
              aria-label={`${p.label}: ${formatarMoeda(p.valor)}`}
            />
          ))}
        </div>
      </div>

      <div className="cchart__axis">
        {ticks.map((i) => (
          <span key={serie.pontos[i].data}>{serie.pontos[i].label}</span>
        ))}
      </div>

      {ativo && ativo.valor > 0 && (
        <div className="cchart__detail">
          <div className="cchart__detail-corpo">
            <span className="cchart__detail-data">{ativo.label}</span>
            <strong className="cchart__detail-valor">{formatarMoeda(ativo.valor)}</strong>
          </div>
          {onVerDia && (
            <button
              type="button"
              className="cchart__detail-cta"
              onClick={() => onVerDia(ativo.data)}
            >
              Ver compras do dia
              <span aria-hidden>→</span>
            </button>
          )}
        </div>
      )}

      {!ativo && onVerDia && (
        <p className="cchart__hint">Toque em um dia com compra para ver detalhes</p>
      )}
    </div>
  );
}
