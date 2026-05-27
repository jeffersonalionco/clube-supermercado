import { useCallback, useEffect, useState } from "react";
import Logo from "../components/Logo.jsx";
import { clearSession, fetchAutenticado } from "../utils/session.js";
import { mensagemParaUsuario } from "../utils/mensagensUsuario.js";
import "../styles/home.css";

function IconUser() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M5 20c0-3.3 3.1-6 7-6s7 2.7 7 6"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconCart() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 6h15l-1.5 9H8L6 6zM9 20a1 1 0 100-2 1 1 0 000 2zm8 0a1 1 0 100-2 1 1 0 000 2z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M6 6L5 3H2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconContact() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 6h16v12H4V6z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M4 7l8 6 8-6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MenuCta({ icon, title, subtitle, onClick, variant = "default" }) {
  return (
    <button
      type="button"
      className={`home-menu-cta home-menu-cta--${variant}`}
      onClick={onClick}
    >
      <span className="home-menu-cta__icon" aria-hidden>
        {icon}
      </span>
      <span className="home-menu-cta__text">
        <strong>{title}</strong>
        <small>{subtitle}</small>
      </span>
      <span className="home-menu-cta__arrow" aria-hidden>
        →
      </span>
    </button>
  );
}

export default function HomePage({ onLogout, onCompras, onPerfil, onContato }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dados, setDados] = useState(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAutenticado("/api/cliente/me");
      setDados(data);
    } catch (err) {
      if (err.code === "UNAUTHORIZED") {
        onLogout();
        return;
      }
      setError(mensagemParaUsuario(err.message));
    } finally {
      setLoading(false);
    }
  }, [onLogout]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  function handleSair() {
    clearSession();
    onLogout();
  }

  if (loading) {
    return (
      <div className="home-app">
        <div className="home-loading">
          <Logo variant="compact" className="home-loading__logo" />
          <span className="home-loading__spinner" />
          <p>Carregando sua conta…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="home-app">
        <div className="home-error">
          <Logo variant="compact" className="home-error__logo" />
          <p>{error}</p>
          <button type="button" className="home-btn home-btn--primary" onClick={carregar}>
            Tentar novamente
          </button>
          <button type="button" className="home-btn home-btn--ghost" onClick={handleSair}>
            Sair
          </button>
        </div>
      </div>
    );
  }

  const { perfil, clube } = dados;
  const primeiroNome = perfil.nome?.split(" ")[0] || "Cliente";

  return (
    <div className="home-app">
      <header className="home-header">
        <div className="home-header__brand">
          <Logo variant="header" />
          <span className="home-header__tag">Área do cliente</span>
        </div>
        <button type="button" className="home-header__sair" onClick={handleSair}>
          Sair
        </button>
      </header>

      <section className="home-hero">
        <div className="home-hero__avatar" aria-hidden>
          <IconUser />
        </div>
        <div className="home-hero__text">
          <p className="home-hero__ola">Olá,</p>
          <h1 className="home-hero__nome">{primeiroNome}</h1>
          <p className="home-hero__sub">Membro do Clube Superama</p>
        </div>
        <div className="home-hero__badge home-hero__badge--ativo">Ativo</div>
      </section>

      <div className="home-stats">
        <div className="home-stat home-stat--soon" aria-label="Programa de pontos em breve">
          <span className="home-stat__soon-icon" aria-hidden>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 2l2.2 6.8H21l-5.5 4 2.1 6.8L12 15.6 6.4 19.6l2.1-6.8L3 8.8h6.8L12 2z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="home-stat__soon-text">Em breve</span>
          <span className="home-stat__label">Pontos</span>
          <span className="home-stat__soon-hint">Novidade chegando</span>
        </div>
        <div className="home-stat">
          <span className="home-stat__value">{clube.nivel}</span>
          <span className="home-stat__label">Seu clube</span>
        </div>
        {perfil.codigoCliente && (
          <div className="home-stat">
            <span className="home-stat__value">{perfil.codigoCliente}</span>
            <span className="home-stat__label">Seu número</span>
          </div>
        )}
      </div>

      <main className="home-main">
        <div className="home-grid">
          <nav className="home-menu" aria-label="Área do cliente">
            <h2 className="home-menu__titulo">Acesso rápido</h2>
            {onCompras && (
              <MenuCta
                variant="primary"
                icon={<IconCart />}
                title="Minhas compras"
                subtitle="Cupons e itens por período"
                onClick={onCompras}
              />
            )}
            {onPerfil && (
              <MenuCta
                icon={<IconUser />}
                title="Meu perfil"
                subtitle="Nome, CPF e dados pessoais"
                onClick={onPerfil}
              />
            )}
            {onContato && (
              <MenuCta
                icon={<IconContact />}
                title="Meu contato"
                subtitle="E-mail, telefone e endereço"
                onClick={onContato}
              />
            )}
          </nav>

          <section className="home-benefits">
            <h3 className="home-benefits__title">Benefícios do clube</h3>
            <div className="home-benefits__grid">
              <article className="home-benefit">
                <span className="home-benefit__icon" aria-hidden>★</span>
                <h4>Ofertas exclusivas</h4>
                <p>Promoções especiais para membros.</p>
              </article>
              <article className="home-benefit home-benefit--soon">
                <span className="home-benefit__badge">Em breve</span>
                <span className="home-benefit__icon" aria-hidden>♦</span>
                <h4>Programa de pontos</h4>
                <p>Em breve você poderá acumular vantagens nas compras.</p>
              </article>
              <article className="home-benefit">
                <span className="home-benefit__icon" aria-hidden>✦</span>
                <h4>Atendimento preferencial</h4>
                <p>Prioridade no suporte ao cliente.</p>
              </article>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
