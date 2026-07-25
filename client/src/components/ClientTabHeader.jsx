import Logo from "./Logo.jsx";
import { IconBack } from "./icons/ClientIcons.jsx";

export default function ClientTabHeader({
  title,
  tag = "Clube Superama+",
  onInicio,
  showInicioLink = true,
}) {
  return (
    <header className="client-tab-header">
      <div className="client-tab-header__inner">
        {showInicioLink && onInicio && (
          <button
            type="button"
            className="client-tab-header__inicio"
            onClick={onInicio}
          >
            <IconBack />
            <span>Início</span>
          </button>
        )}
        <Logo variant="header" className="client-tab-header__logo" />
        <div className="client-tab-header__text">
          <p className="client-tab-header__tag">{tag}</p>
          <h1 className="client-tab-header__title">{title}</h1>
        </div>
      </div>
    </header>
  );
}
