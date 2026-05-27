import Logo from "./Logo.jsx";
import "../styles/home.css";
import "../styles/subpage.css";

function IconBack() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M15 6l-6 6 6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function SubpageLayout({
  title,
  tag = "Clube Superama+",
  onVoltar,
  loading,
  error,
  onRetry,
  children,
}) {
  if (loading) {
    return (
      <div className="subpage-app">
        <div className="subpage-loading">
          <Logo variant="compact" />
          <span className="home-loading__spinner" />
          <p>Carregando…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="subpage-app">
        <div className="subpage-error">
          <Logo variant="compact" />
          <p>{error}</p>
          {onRetry && (
            <button
              type="button"
              className="home-btn home-btn--primary"
              onClick={onRetry}
            >
              Tentar novamente
            </button>
          )}
          <button
            type="button"
            className="home-btn home-btn--ghost"
            onClick={onVoltar}
          >
            Voltar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="subpage-app">
      <header className="subpage-header">
        <div className="subpage-header__inner">
          <button
            type="button"
            className="subpage-header__back"
            onClick={onVoltar}
            aria-label="Voltar para início"
          >
            <IconBack />
            <span>Voltar</span>
          </button>
          <div className="subpage-header__brand">
            <Logo variant="header" className="subpage-header__logo" />
            <div>
              <p className="subpage-header__tag">{tag}</p>
              <h1 className="subpage-header__title">{title}</h1>
            </div>
          </div>
        </div>
      </header>
      <main className="subpage-main">{children}</main>
    </div>
  );
}
