import { useMemo, useState } from "react";
import GastoBarrasChart from "./GastoBarrasChart.jsx";
import EconomiaRoscaChart from "./EconomiaRoscaChart.jsx";
import ComparativoMesChart from "./ComparativoMesChart.jsx";
import ChartPeriodPills from "./ChartPeriodPills.jsx";
import {
  filtrarPorDias,
  montarMensagemContextual,
} from "../../utils/vendasCharts.js";
import "../../styles/cliente-charts.css";

const ICONES = {
  economia: "✦",
  cart: "◎",
  hoje: "●",
  recente: "◆",
  resumo: "▣",
};

export default function ClienteInsightsPanel({
  porData,
  className = "",
  onVerComprasDia,
  onVerComprasPeriodo,
  onVerComprasMes,
  onVerCompras,
}) {
  const [periodoDias, setPeriodoDias] = useState(30);
  const [animKey, setAnimKey] = useState(0);

  const porDataPeriodo = useMemo(
    () => filtrarPorDias(porData, periodoDias),
    [porData, periodoDias]
  );

  const mensagem = useMemo(
    () => montarMensagemContextual(porData, periodoDias),
    [porData, periodoDias]
  );

  function handlePeriodo(dias) {
    setPeriodoDias(dias);
    setAnimKey((k) => k + 1);
  }

  return (
    <section
      className={`cinsights${className ? ` ${className}` : ""}`}
      aria-label="Visão das suas compras"
    >
      <header className="cinsights__hero">
        <div className="cinsights__hero-glow" aria-hidden />
        <div className="cinsights__hero-top">
          <div>
            <p className="cinsights__eyebrow">Seus números</p>
            <h2 className="cinsights__title">Visão das suas compras</h2>
          </div>
          <ChartPeriodPills valor={periodoDias} onChange={handlePeriodo} />
        </div>

        <div className={`cinsights__contexto cinsights__contexto--${mensagem.tom}`}>
          <span className="cinsights__contexto-icone" aria-hidden>
            {ICONES[mensagem.icone] || "◆"}
          </span>
          <p className="cinsights__lead">{mensagem.texto}</p>
        </div>

        {onVerCompras && (
          <button type="button" className="cinsights__cta-hero" onClick={onVerCompras}>
            Ver minhas compras
            <span aria-hidden>→</span>
          </button>
        )}
      </header>

      <div className="cinsights__grid" key={animKey}>
        <article className="cinsights__card cinsights__card--barras cinsights__card--animate">
          <GastoBarrasChart
            porData={porDataPeriodo}
            dias={periodoDias}
            onVerDia={onVerComprasDia}
          />
        </article>
        <article className="cinsights__card cinsights__card--rosca cinsights__card--animate cinsights__card--delay-1">
          <EconomiaRoscaChart porData={porDataPeriodo} dias={periodoDias} />
        </article>
        <article className="cinsights__card cinsights__card--comparativo cinsights__card--animate cinsights__card--delay-2">
          <ComparativoMesChart
            porData={porData}
            onVerMes={onVerComprasMes}
          />
        </article>
      </div>
    </section>
  );
}
