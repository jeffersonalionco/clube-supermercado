import { useCallback, useEffect, useMemo, useState } from "react";
import AnimatedNumber from "../components/AnimatedNumber.jsx";
import ClientTabHeader from "../components/ClientTabHeader.jsx";
import EmptyState from "../components/EmptyState.jsx";
import ProgressBar from "../components/ProgressBar.jsx";
import PullToRefresh from "../components/PullToRefresh.jsx";
import Logo from "../components/Logo.jsx";
import { IconBack, IconGift, IconStar } from "../components/icons/ClientIcons.jsx";
import { fetchAutenticado } from "../utils/session.js";
import { resolveImagemUrl } from "../utils/imagem.js";
import { formatarMoeda } from "../utils/moeda.js";
import { mensagemParaUsuario } from "../utils/mensagensUsuario.js";
import "../styles/home.css";
import "../styles/premios.css";
import { useRefetchOnVisible } from "../hooks/useRefetchOnVisible.js";

function PremioCard({ premio, saldoPontos }) {
  const img = resolveImagemUrl(premio.imagemUrl);
  const podeResgatar = saldoPontos >= premio.pontos;
  const faltam = Math.max(0, premio.pontos - saldoPontos);

  return (
    <article className={`premio-card ${podeResgatar ? "premio-card--disponivel" : ""}`}>
      <div className="premio-card__media">
        {img ? (
          <img src={img} alt={premio.nome} loading="lazy" />
        ) : (
          <div className="premio-card__placeholder" aria-hidden>
            <IconStar filled />
          </div>
        )}
        {premio.categoria && (
          <span className="premio-card__categoria">{premio.categoria}</span>
        )}
        {premio.limitado && (
          <span className="premio-card__limitado">Últimas unidades</span>
        )}
      </div>

      <div className="premio-card__body">
        <h3 className="premio-card__nome">{premio.nome}</h3>
        {premio.descricao && (
          <p className="premio-card__desc">{premio.descricao}</p>
        )}

        <div className="premio-card__footer">
          <div className="premio-card__pontos">
            <span className="premio-card__pontos-valor">{premio.pontos}</span>
            <span className="premio-card__pontos-label">pontos</span>
          </div>
          {premio.valor != null && (
            <span className="premio-card__ref">Ref. {formatarMoeda(premio.valor)}</span>
          )}
        </div>

        {!podeResgatar && (
          <div className="premio-card__progress">
            <ProgressBar
              variant="premio"
              value={saldoPontos}
              max={premio.pontos}
              label={`${saldoPontos} de ${premio.pontos} pts`}
              hint={`Faltam ${faltam}`}
            />
          </div>
        )}

        <p className={`premio-card__status ${podeResgatar ? "premio-card__status--ok" : ""}`}>
          {podeResgatar
            ? "Você pode resgatar na loja"
            : `Faltam ${faltam} ponto${faltam === 1 ? "" : "s"} para resgatar`}
        </p>
      </div>
    </article>
  );
}

export default function PremiosPage({ tabMode = false, onVoltar, onInicio, onHistorico }) {
  const [categoria, setCategoria] = useState("");
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const carregar = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams();
      if (categoria) params.set("categoria", categoria);
      const qs = params.toString();
      const data = await fetchAutenticado(
        `/api/cliente/brindes${qs ? `?${qs}` : ""}`
      );
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
  }, [categoria, onVoltar]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const recarregarSilencioso = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (categoria) params.set("categoria", categoria);
      const qs = params.toString();
      const data = await fetchAutenticado(
        `/api/cliente/brindes${qs ? `?${qs}` : ""}`
      );
      setDados(data);
    } catch {
      // mantém catálogo atual
    }
  }, [categoria]);

  useRefetchOnVisible(recarregarSilencioso, Boolean(dados));

  const saldo = dados?.pontos?.saldo ?? 0;
  const categorias = dados?.categorias ?? [];
  const brindes = dados?.brindes ?? [];

  const destaques = useMemo(
    () => brindes.filter((b) => saldo >= b.pontos).length,
    [brindes, saldo]
  );

  const header = tabMode ? (
    <ClientTabHeader title="Prêmios" onInicio={onInicio} />
  ) : (
    <header className="premios-header">
      <div className="premios-header__inner">
        <button
          type="button"
          className="premios-header__back"
          onClick={onVoltar}
          aria-label="Voltar para início"
        >
          <IconBack />
          <span>Voltar</span>
        </button>
        <div className="premios-header__brand">
          <Logo variant="header" className="premios-header__logo" />
          <div>
            <p className="premios-header__tag">Clube Superama+</p>
            <h1 className="premios-header__title">Prêmios</h1>
          </div>
        </div>
      </div>
    </header>
  );

  return (
    <div className="premios-app">
      {header}

      <PullToRefresh onRefresh={carregar} disabled={loading}>
        <section className="premios-hero">
          <div className="premios-hero__glow" aria-hidden />
          <div className="premios-hero__content">
            <p className="premios-hero__eyebrow">Seu saldo de pontos</p>
            <p className="premios-hero__saldo">
              <span className="premios-hero__saldo-num">
                {loading ? "—" : <AnimatedNumber value={saldo} />}
              </span>
              <span className="premios-hero__saldo-pts">pts</span>
            </p>
            <p className="premios-hero__sub">
              {loading
                ? "Carregando catálogo…"
                : destaques > 0
                  ? `${destaques} prêmio${destaques === 1 ? "" : "s"} já disponível${destaques === 1 ? "" : "is"} para você`
                  : "Continue comprando e troque seus pontos por prêmios incríveis"}
            </p>
            {onHistorico && !loading && (
              <button type="button" className="premios-hero__link" onClick={onHistorico}>
                Ver histórico de pontos →
              </button>
            )}
          </div>
        </section>

        <div className="premios-shell">
          <nav className="premios-filtros" aria-label="Categorias de prêmios">
            <button
              type="button"
              className={`premios-chip ${!categoria ? "premios-chip--active" : ""}`}
              onClick={() => setCategoria("")}
            >
              Todos
            </button>
            {categorias.map((cat) => (
              <button
                key={cat}
                type="button"
                className={`premios-chip ${categoria === cat ? "premios-chip--active" : ""}`}
                onClick={() => setCategoria(cat)}
              >
                {cat}
              </button>
            ))}
          </nav>

          {error && (
            <div className="premios-alert" role="alert">
              <p>{error}</p>
              <button type="button" className="home-btn home-btn--primary" onClick={carregar}>
                Tentar novamente
              </button>
            </div>
          )}

          {loading && (
            <div className="premios-loading" aria-busy="true">
              <span className="home-loading__spinner" />
              <p>Preparando os prêmios…</p>
              <div className="premios-skeleton-grid" aria-hidden>
                <div className="premios-skeleton" />
                <div className="premios-skeleton" />
                <div className="premios-skeleton" />
              </div>
            </div>
          )}

          {!loading && !error && brindes.length === 0 && (
            <EmptyState
              icon={<IconGift size={28} />}
              title="Nenhum prêmio nesta categoria"
              description={
                categoria
                  ? "Tente outra categoria ou volte em breve — novidades chegam o tempo todo."
                  : "Em breve teremos prêmios especiais para você resgatar com seus pontos."
              }
              actionLabel={categoria ? "Ver todos os prêmios" : undefined}
              onAction={categoria ? () => setCategoria("") : undefined}
            />
          )}

          {!loading && !error && brindes.length > 0 && (
            <section className="premios-grid" aria-label="Galeria de prêmios">
              {brindes.map((premio) => (
                <PremioCard key={premio.id} premio={premio} saldoPontos={saldo} />
              ))}
            </section>
          )}

          <p className="premios-nota">
            Resgate seus prêmios diretamente na loja, apresentando seu CPF no clube.
          </p>
        </div>
      </PullToRefresh>
    </div>
  );
}
