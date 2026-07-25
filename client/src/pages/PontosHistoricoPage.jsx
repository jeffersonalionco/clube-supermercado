import { useCallback, useEffect, useMemo, useState } from "react";
import AnimatedNumber from "../components/AnimatedNumber.jsx";
import ClientTabHeader from "../components/ClientTabHeader.jsx";
import EmptyState from "../components/EmptyState.jsx";
import ProgressBar from "../components/ProgressBar.jsx";
import PullToRefresh from "../components/PullToRefresh.jsx";
import RegrasPontos from "../components/RegrasPontos.jsx";
import {
  IconBack,
  IconConvenio,
  IconEstorno,
  IconGift,
  IconPoints,
  IconReceipt,
  IconShopping,
  IconStar,
} from "../components/icons/ClientIcons.jsx";
import { fetchAutenticado } from "../utils/session.js";
import { resolveImagemUrl } from "../utils/imagem.js";
import { formatarMoeda } from "../utils/moeda.js";
import { mensagemParaUsuario } from "../utils/mensagensUsuario.js";
import "../styles/home.css";
import "../styles/pontos-historico.css";

const REAIS_POR_PONTO = 50;

const FILTROS = [
  { id: "todos", label: "Tudo" },
  { id: "compra", label: "Compras" },
  { id: "estorno", label: "Cancelamentos" },
  { id: "resgate", label: "Resgates" },
  { id: "expiracao", label: "Expirações" },
];

function formatarDataItem(item) {
  if (item.tipo === "resgate" || item.tipo === "estorno" || item.tipo === "expiracao") {
    try {
      return new Date(item.data).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "—";
    }
  }
  return item.data || "—";
}

function TimelineItem({ item }) {
  if (item.tipo === "convenio") {
    return (
      <article className="ph-item ph-item--convenio">
        <div className="ph-item__icon ph-item__icon--convenio" aria-hidden>
          <IconConvenio />
        </div>
        <div className="ph-item__corpo">
          <div className="ph-item__top">
            <span className="ph-item__badge ph-item__badge--convenio">Convênio</span>
            <time className="ph-item__data">{formatarDataItem(item)}</time>
          </div>
          <h3 className="ph-item__titulo">Cupom {item.cupomLabel || item.cupom}</h3>
          <p className="ph-item__valor ph-item__valor--sem-pontos">
            {formatarMoeda(item.valorCompra)}
          </p>
          <p className="ph-item__meta">
            Compra em convênio — visível no histórico, mas não gera pontos
          </p>
        </div>
      </article>
    );
  }

  if (item.tipo === "estorno") {
    return (
      <article className="ph-item ph-item--estorno">
        <div className="ph-item__icon ph-item__icon--estorno" aria-hidden>
          <IconEstorno />
        </div>
        <div className="ph-item__corpo">
          <div className="ph-item__top">
            <span className="ph-item__badge ph-item__badge--estorno">Cupom cancelado</span>
            <time className="ph-item__data">{formatarDataItem(item)}</time>
          </div>
          <h3 className="ph-item__titulo">Cupom {item.cupomLabel || item.cupom}</h3>
          {item.pontos > 0 ? (
            <p className="ph-item__pontos ph-item__pontos--negativo">-{item.pontos} pontos</p>
          ) : (
            <p className="ph-item__pontos ph-item__pontos--negativo">Ajuste no acúmulo</p>
          )}
          <p className="ph-item__meta">
            Estorno devido ao cancelamento do cupom na loja
            {item.valorCompra > 0 && <> · {formatarMoeda(item.valorCompra)}</>}
          </p>
        </div>
      </article>
    );
  }

  if (item.tipo === "expiracao") {
    return (
      <article className="ph-item ph-item--expiracao">
        <div className="ph-item__icon ph-item__icon--expiracao" aria-hidden>
          <IconPoints size={18} />
        </div>
        <div className="ph-item__corpo">
          <div className="ph-item__top">
            <span className="ph-item__badge ph-item__badge--expiracao">Expiração</span>
            <time className="ph-item__data">{formatarDataItem(item)}</time>
          </div>
          <h3 className="ph-item__titulo">Pontos não utilizados</h3>
          <p className="ph-item__pontos ph-item__pontos--negativo">-{item.pontos} pontos</p>
          <p className="ph-item__meta">
            Saldo: {item.saldoAntes} → {item.saldoDepois} pts
          </p>
          {item.observacao && <p className="ph-item__obs">{item.observacao}</p>}
        </div>
      </article>
    );
  }

  if (item.tipo === "resgate") {
    const img = resolveImagemUrl(item.brindeImagemUrl);
    return (
      <article className="ph-item ph-item--resgate">
        <div className="ph-item__icon ph-item__icon--resgate" aria-hidden>
          {img ? <img src={img} alt="" /> : <IconGift size={18} />}
        </div>
        <div className="ph-item__corpo">
          <div className="ph-item__top">
            <span className="ph-item__badge ph-item__badge--resgate">Resgate</span>
            <time className="ph-item__data">{formatarDataItem(item)}</time>
          </div>
          <h3 className="ph-item__titulo">{item.brindeNome || "Brinde"}</h3>
          <p className="ph-item__pontos">-{item.pontos} pontos</p>
          {item.codigoResgate && (
            <p className="ph-item__codigo-resgate">
              Código: <strong>{item.codigoResgate}</strong>
              {item.assinaturaConfirmadaEm && (
                <span className="ph-item__assinado"> · Comprovante assinado</span>
              )}
            </p>
          )}
          <p className="ph-item__meta">
            Saldo: {item.saldoAntes} → {item.saldoDepois} pts
          </p>
          {item.observacao && <p className="ph-item__obs">{item.observacao}</p>}
        </div>
      </article>
    );
  }

  return (
    <article className={`ph-item ph-item--compra${item.cancelada ? " ph-item--compra-cancelada" : ""}`}>
      <div className="ph-item__icon ph-item__icon--compra" aria-hidden>
        <IconShopping />
      </div>
      <div className="ph-item__corpo">
        <div className="ph-item__top">
          <span className={`ph-item__badge ${item.cancelada ? "ph-item__badge--cancelada" : "ph-item__badge--compra"}`}>
            {item.cancelada ? "Compra cancelada" : "Compra"}
          </span>
          <time className="ph-item__data">{formatarDataItem(item)}</time>
        </div>
        <h3 className="ph-item__titulo">Cupom {item.cupomLabel || item.cupom}</h3>
        <p className={`ph-item__valor${item.cancelada ? " ph-item__valor--cancelada" : ""}`}>
          {formatarMoeda(item.valorCompra)}
        </p>
        <p className="ph-item__meta">
          {item.cancelada
            ? "Cupom processado e depois cancelado na loja"
            : "Valor contabilizado para seus pontos"}
        </p>
      </div>
    </article>
  );
}

export default function PontosHistoricoPage({
  tabMode = false,
  onVoltar,
  onInicio,
  onPremios,
  onCompras,
}) {
  const [filtro, setFiltro] = useState("todos");
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const carregar = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const data = await fetchAutenticado("/api/cliente/pontos/historico");
      setDados(data);
    } catch (err) {
      if (err.code === "UNAUTHORIZED") {
        onVoltar?.();
        return;
      }
      setError(mensagemParaUsuario(err.message));
      setDados(null);
    } finally {
      setLoading(false);
    }
  }, [onVoltar]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const itensFiltrados = useMemo(() => {
    const lista = dados?.timeline ?? [];
    if (filtro === "todos") return lista;
    if (filtro === "compra") {
      return lista.filter(
        (item) =>
          item.tipo === "compra" ||
          item.tipo === "estorno" ||
          item.tipo === "convenio"
      );
    }
    return lista.filter((item) => item.tipo === filtro);
  }, [dados, filtro]);

  const progressoPontos = useMemo(() => {
    const valorPendente = Number(dados?.valorPendente) || 0;
    const falta = Number(dados?.faltaParaProximoPonto);
    const faltaCalc =
      falta > 0 ? falta : Math.max(0, REAIS_POR_PONTO - valorPendente);
    return {
      valorPendente,
      falta: faltaCalc,
    };
  }, [dados]);

  const header = tabMode ? (
    <ClientTabHeader title="Meus pontos" onInicio={onInicio} />
  ) : (
    <header className="ph-header">
      <div className="ph-header__inner">
        <button type="button" className="ph-header__back" onClick={onVoltar}>
          <IconBack />
          <span>Voltar</span>
        </button>
        <div className="ph-header__brand">
          <p className="ph-header__tag">Clube Superama+</p>
          <h1 className="ph-header__title">Meus pontos</h1>
        </div>
      </div>
    </header>
  );

  return (
    <div className="ph-app">
      {header}

      <PullToRefresh onRefresh={carregar} disabled={loading}>
        <section className="ph-hero">
          <div className="ph-hero__card">
            <p className="ph-hero__label">Saldo disponível</p>
            <p className="ph-hero__saldo">
              <span>
                {loading ? "—" : <AnimatedNumber value={dados?.saldo ?? 0} />}
              </span>
              <small>pts</small>
            </p>

            {!loading && dados && (
              <div className="ph-hero__progress">
                <ProgressBar
                  variant="gold"
                  value={REAIS_POR_PONTO - progressoPontos.falta}
                  max={REAIS_POR_PONTO}
                  label={`${formatarMoeda(progressoPontos.valorPendente)} acumulados`}
                  hint={
                    progressoPontos.falta > 0
                      ? `Faltam ${formatarMoeda(progressoPontos.falta)} para +1 pt`
                      : "Quase lá!"
                  }
                />
              </div>
            )}

            {!loading && dados?.proximaExpiracao && dados.pontosProximaExpiracao > 0 && (
              <p className="ph-hero__validade">
                {dados.pontosProximaExpiracao} pt
                {dados.pontosProximaExpiracao === 1 ? "" : "s"} expira
                {dados.pontosProximaExpiracao === 1 ? "" : "m"} em{" "}
                {new Date(dados.proximaExpiracao).toLocaleDateString("pt-BR")}
              </p>
            )}

            <div className="home-pontos-card__actions" style={{ marginTop: "0.85rem" }}>
              {onPremios && (
                <button type="button" className="home-pontos-card__cta home-pontos-card__cta--primary" onClick={onPremios}>
                  Ver prêmios
                </button>
              )}
              {onCompras && (
                <button type="button" className="home-pontos-card__cta home-pontos-card__cta--ghost" onClick={onCompras}>
                  Minhas compras
                </button>
              )}
            </div>
          </div>

          {!loading && dados?.resumo && (
            <div className="ph-stats">
              <div className="ph-stat">
                <span className="ph-stat__val">{dados.resumo.totalCompras}</span>
                <span className="ph-stat__lbl">Compras</span>
              </div>
              <div className="ph-stat">
                <span className="ph-stat__val">{dados.resumo.totalCancelamentos ?? 0}</span>
                <span className="ph-stat__lbl">Cancelamentos</span>
              </div>
              <div className="ph-stat ph-convenio-stat">
                <span className="ph-stat__val">{dados.resumo.totalConvenio ?? 0}</span>
                <span className="ph-stat__lbl">Convênio</span>
              </div>
              <div className="ph-stat">
                <span className="ph-stat__val">{dados.resumo.totalResgates}</span>
                <span className="ph-stat__lbl">Resgates</span>
              </div>
              {(dados.resumo.totalExpiracoes ?? 0) > 0 && (
                <div className="ph-stat ph-stat--expiracao">
                  <span className="ph-stat__val">{dados.resumo.totalExpiracoes}</span>
                  <span className="ph-stat__lbl">Expirações</span>
                </div>
              )}
            </div>
          )}
        </section>

        <main className="ph-main">
          <RegrasPontos compact />

          <nav className="ph-filtros" aria-label="Filtrar histórico">
            {FILTROS.map((f) => (
              <button
                key={f.id}
                type="button"
                className={`ph-chip ${filtro === f.id ? "ph-chip--active" : ""}`}
                onClick={() => setFiltro(f.id)}
              >
                {f.label}
              </button>
            ))}
          </nav>

          {dados?.dataInicioPlataforma && (
            <p className="ph-nota">
              Histórico desde seu cadastro no clube ({dados.dataInicioPlataforma}).
            </p>
          )}

          {error && (
            <div className="ph-alert" role="alert">
              <p>{error}</p>
              <button type="button" className="home-btn home-btn--primary" onClick={carregar}>
                Tentar novamente
              </button>
            </div>
          )}

          {loading && (
            <div className="ph-loading" aria-busy="true">
              <span className="home-loading__spinner" />
              <p>Carregando seu histórico…</p>
            </div>
          )}

          {!loading && !error && itensFiltrados.length === 0 && (
            <EmptyState
              icon={<IconStar size={28} filled />}
              title={
                filtro === "resgate"
                  ? "Nenhum resgate ainda"
                  : filtro === "estorno"
                    ? "Nenhum cancelamento"
                    : "Seu histórico começa aqui"
              }
              description={
                filtro === "resgate"
                  ? "Quando você resgatar um prêmio na loja, ele aparecerá nesta lista."
                  : filtro === "estorno"
                    ? "Ótimo! Nenhum cupom cancelado foi registrado no seu cadastro."
                    : "Compre na loja com seu CPF no clube e acompanhe aqui compras, convênios e resgates."
              }
              actionLabel={filtro === "todos" && onCompras ? "Ver minhas compras" : undefined}
              onAction={onCompras}
            />
          )}

          {!loading && !error && itensFiltrados.length > 0 && (
            <div className="ph-timeline">
              {itensFiltrados.map((item) => (
                <TimelineItem key={item.id} item={item} />
              ))}
            </div>
          )}
        </main>
      </PullToRefresh>
    </div>
  );
}
