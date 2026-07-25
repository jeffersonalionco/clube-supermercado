import { filtrarTabItems } from "./clientTabNavItems.js";
import "../styles/bottom-nav.css";

export default function ClientBottomNav({ view, onNavigate, pontosAtivo = true }) {
  const items = filtrarTabItems(pontosAtivo);

  return (
    <nav className="client-bottom-nav" aria-label="Navegação principal">
      <div className="client-bottom-nav__inner">
        {items.map(({ id, label, Icon }) => {
          const ativo = view === id;
          return (
            <button
              key={id}
              type="button"
              className={`client-bottom-nav__item${ativo ? " client-bottom-nav__item--active" : ""}`}
              onClick={() => onNavigate(id)}
              aria-current={ativo ? "page" : undefined}
            >
              <span className="client-bottom-nav__icon">
                <Icon size={22} filled={ativo && id === "pontos"} />
              </span>
              <span className="client-bottom-nav__label">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
