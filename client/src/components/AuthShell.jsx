import Logo from "./Logo.jsx";
import MetajiCredit from "./MetajiCredit.jsx";
import { useProgramaPublico } from "../hooks/useProgramaPublico.js";

const PERKS_PONTOS = [
  "1 ponto a cada R$ 50 em compras",
  "Prêmios exclusivos na loja",
  "Ofertas para membros do clube",
];

const PERKS_DESCONTOS = [
  "Descontos em produtos selecionados",
  "Preços exclusivos no Clube Superama+",
  "Histórico de compras pelo seu CPF",
];

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
  const pontosAtivo = useProgramaPublico();
  const perks = pontosAtivo ? PERKS_PONTOS : PERKS_DESCONTOS;

  return (
    <div className={`auth-app auth-app--${variant}`}>
      <div className="auth-app__bg" aria-hidden="true" />

      <div className="auth-layout">
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
          <div className="auth-hero__glow" aria-hidden />
          <Logo variant="hero" className="auth-hero__logo" />
          <span className="auth-hero__badge">{badge}</span>
          <h1 className="auth-hero__title">{title}</h1>
          {description && <p className="auth-hero__desc">{description}</p>}
          <ul className="auth-hero__perks">
            {perks.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <main className="auth-sheet">
          <div className="auth-sheet__card">{children}</div>
        </main>

        {footer && <footer className="auth-footer">{footer}</footer>}
        <MetajiCredit className="metaji-credit--auth" />
      </div>
    </div>
  );
}
