import Logo from "./Logo.jsx";

export default function AuthShell({
  variant = "login",
  badge,
  title,
  description,
  onBack,
  backLabel = "Voltar",
  step,
  totalSteps = 2,
  children,
  footer,
}) {
  return (
    <div className={`auth-app auth-app--${variant}`}>
      <div className="auth-app__bg" aria-hidden="true" />

      <header className="auth-header">
        {onBack ? (
          <button
            type="button"
            className="auth-header__back"
            onClick={onBack}
            aria-label={backLabel}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M15 18l-6-6 6-6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>{backLabel}</span>
          </button>
        ) : (
          <div className="auth-header__spacer" />
        )}
        <p className="auth-header__brand">Clube Superama+</p>
        <div className="auth-header__spacer auth-header__spacer--end" />
      </header>

      {step != null && (
        <div className="auth-steps" aria-label={`Etapa ${step} de ${totalSteps}`}>
          {Array.from({ length: totalSteps }, (_, i) => (
            <span
              key={i}
              className={`auth-steps__dot ${i + 1 <= step ? "auth-steps__dot--active" : ""} ${i + 1 === step ? "auth-steps__dot--current" : ""}`}
            />
          ))}
        </div>
      )}

      <section className="auth-hero">
        <Logo variant="hero" className="auth-hero__logo" />
        <span className="auth-hero__badge">{badge}</span>
        <h1 className="auth-hero__title">{title}</h1>
        {description && <p className="auth-hero__desc">{description}</p>}
      </section>

      <main className="auth-sheet">
        <div className="auth-sheet__card">{children}</div>
      </main>

      {footer && <footer className="auth-footer">{footer}</footer>}
    </div>
  );
}
