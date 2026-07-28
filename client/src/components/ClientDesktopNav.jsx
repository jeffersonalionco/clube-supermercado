import Logo from "./Logo.jsx";
import NivelBadge from "./NivelBadge.jsx";
import { filtrarTabItems } from "./clientTabNavItems.js";
import "../styles/bottom-nav.css";

function iniciaisDoNome(nome) {
  const partes = String(nome || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!partes.length) return "C";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return `${partes[0][0]}${partes[partes.length - 1][0]}`.toUpperCase();
}

export default function ClientDesktopNav({
  view,
  onNavigate,
  usuario,
  clube,
  onPerfil,
  onLogout,
  onAbrirNivel,
  pontosAtivo = true,
}) {
  const nome = usuario?.nome || "Cliente";
  const primeiroNome = String(nome).trim().split(/\s+/)[0] || "Cliente";
  const items = filtrarTabItems(pontosAtivo);

  return (
    <header className="client-desktop-nav" aria-label="Navegação principal">
      <div className="client-desktop-nav__inner">
        <div className="client-desktop-nav__brand">
          <Logo variant="header" className="client-desktop-nav__logo" />
          <div className="client-desktop-nav__brand-text">
            <span className="client-desktop-nav__brand-title">Clube Superama+</span>
            <span className="client-desktop-nav__brand-sub">Área do cliente</span>
          </div>
        </div>

        <nav className="client-desktop-nav__tabs" aria-label="Seções">
          {items.map(({ id, label, Icon }) => {
            const ativo = view === id;
            return (
              <button
                key={id}
                type="button"
                className={`client-desktop-nav__item${ativo ? " client-desktop-nav__item--active" : ""}`}
                onClick={() => onNavigate(id)}
                aria-current={ativo ? "page" : undefined}
              >
                <span className="client-desktop-nav__icon" aria-hidden>
                  <Icon size={18} filled={ativo && id === "pontos"} />
                </span>
                <span>{label}</span>
              </button>
            );
          })}
        </nav>

        <div className="client-desktop-nav__account">
          <div className="client-desktop-nav__user-cluster">
            {onPerfil && (
              <button
                type="button"
                className="client-desktop-nav__user"
                onClick={onPerfil}
                aria-label={`Meu perfil — ${nome}`}
                title={nome}
              >
                <span className="nivel-avatar-wrap">
                  <span className="client-desktop-nav__avatar" aria-hidden>
                    {iniciaisDoNome(nome)}
                  </span>
                </span>
                <span className="client-desktop-nav__user-name">{primeiroNome}</span>
              </button>
            )}
            {clube && (
              <NivelBadge
                clube={clube}
                size="sm"
                className="client-desktop-nav__nivel"
                onClick={onAbrirNivel}
              />
            )}
          </div>
          {onLogout && (
            <button
              type="button"
              className="client-desktop-nav__logout"
              onClick={onLogout}
            >
              Sair
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
