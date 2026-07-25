import { useId, useMemo } from "react";
import { formatarMoeda } from "../../utils/moeda.js";
import { montarEconomia } from "../../utils/vendasCharts.js";

const RAIO = 54;
const CX = 70;
const CY = 70;
const CIRC = 2 * Math.PI * RAIO;

export default function EconomiaRoscaChart({ porData, dias = 30 }) {
  const uid = useId().replace(/:/g, "");
  const dados = useMemo(() => montarEconomia(porData, dias), [porData, dias]);

  if (!dados.temDados) {
    return (
      <div className="cchart cchart--empty cchart--empty-compact">
        <p className="cchart__empty-title">Sem economia registrada</p>
        <p className="cchart__empty-text">Descontos do clube aparecem aqui.</p>
      </div>
    );
  }

  const fracPago = dados.pago / dados.total;
  const fracEco = dados.economia / dados.total;
  const lenPago = CIRC * fracPago;
  const lenEco = CIRC * fracEco;
  const temEconomia = dados.economia > 0;

  return (
    <div className="cchart cchart--rosca">
      <div className="cchart__head">
        <div>
          <h3 className="cchart__title">Sua economia</h3>
          <p className="cchart__sub">{dados.periodoLabel}</p>
        </div>
      </div>

      <div className="cchart__rosca-layout">
        <div className="cchart__donut-wrap cchart__donut-wrap--animate">
          <svg className="cchart__donut" viewBox="0 0 140 140" aria-hidden>
            <defs>
              <linearGradient id={`${uid}-pago`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#0d2b66" />
                <stop offset="100%" stopColor="#1b4fa0" />
              </linearGradient>
              <linearGradient id={`${uid}-eco`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#f0d060" />
                <stop offset="100%" stopColor="#e31c23" />
              </linearGradient>
            </defs>
            <circle
              cx={CX}
              cy={CY}
              r={RAIO}
              fill="none"
              stroke="rgba(27, 79, 160, 0.08)"
              strokeWidth="14"
            />
            <circle
              cx={CX}
              cy={CY}
              r={RAIO}
              fill="none"
              stroke={`url(#${uid}-pago)`}
              strokeWidth="14"
              strokeLinecap="round"
              strokeDasharray={`${lenPago} ${CIRC - lenPago}`}
              transform={`rotate(-90 ${CX} ${CY})`}
              className="cchart__donut-seg cchart__donut-seg--pago"
            />
            {temEconomia && (
              <circle
                cx={CX}
                cy={CY}
                r={RAIO}
                fill="none"
                stroke={`url(#${uid}-eco)`}
                strokeWidth="14"
                strokeLinecap="round"
                strokeDasharray={`${lenEco} ${CIRC - lenEco}`}
                strokeDashoffset={-lenPago}
                transform={`rotate(-90 ${CX} ${CY})`}
                className="cchart__donut-seg cchart__donut-seg--eco"
              />
            )}
          </svg>
          <div className="cchart__donut-center">
            {temEconomia ? (
              <>
                <span className="cchart__donut-pct">{dados.percentualEconomia}%</span>
                <span className="cchart__donut-lbl">economia</span>
              </>
            ) : (
              <>
                <span className="cchart__donut-pct cchart__donut-pct--sm">
                  {formatarMoeda(dados.pago)}
                </span>
                <span className="cchart__donut-lbl">gasto</span>
              </>
            )}
          </div>
        </div>

        <ul className="cchart__legenda">
          <li>
            <span className="cchart__legenda-cor cchart__legenda-cor--pago" />
            <span className="cchart__legenda-texto">
              <strong>Valor pago</strong>
              <small>{formatarMoeda(dados.pago)}</small>
            </span>
          </li>
          {temEconomia && (
            <li>
              <span className="cchart__legenda-cor cchart__legenda-cor--eco" />
              <span className="cchart__legenda-texto">
                <strong>Descontos do clube</strong>
                <small>{formatarMoeda(dados.economia)}</small>
              </span>
            </li>
          )}
          {temEconomia && (
            <li className="cchart__legenda-destaque">
              Você economizou{" "}
              <strong>{formatarMoeda(dados.economia)}</strong> no período
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
