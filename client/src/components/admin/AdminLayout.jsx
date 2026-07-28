import Logo from "../Logo.jsx";
import MetajiCredit from "../MetajiCredit.jsx";
import { APP_VERSION } from "../../version.js";

const NAV = [
  {
    id: "clientes",
    label: "Clientes",
    desc: "Compras reais, segmentos e ficha 360°",
    icon: "◉",
  },
  {
    id: "pontos",
    label: "Baixa de pontos",
    desc: "Atendimento e resgate de prêmios",
    icon: "★",
  },
  {
    id: "usuarios",
    label: "Usuários",
    desc: "Cadastros no clube e senhas de acesso",
    icon: "◎",
  },
  {
    id: "brindes",
    label: "Brindes",
    desc: "Cadastro, estoque e pontuação",
    icon: "▣",
  },
  {
    id: "clube-descontos",
    label: "Clube de descontos",
    desc: "Produtos com preço 2 no ERP",
    icon: "◇",
  },
  {
    id: "admins",
    label: "Administradores",
    desc: "Acessos ao painel administrativo",
    icon: "◆",
  },
  {
    id: "programa",
    label: "Programa",
    desc: "Ativar ou desativar pontos para clientes",
    icon: "⚙",
  },
  {
    id: "conteudo",
    label: "Conteúdo",
    desc: "Vídeo e destaques na home do cliente",
    icon: "▶",
  },
  {
    id: "novidades",
    label: "Novidades",
    desc: "Avisos e dicas publicados no app",
    icon: "✎",
  },
  {
    id: "manual",
    label: "Manual do programa",
    desc: "Regras de pontos, resgates e operação",
    icon: "?",
  },
  {
    id: "legal",
    label: "Regulamento",
    desc: "Textos legais da plataforma",
    icon: "§",
  },
];

export default function AdminLayout({ tab, onTabChange, onLogout, admin, children }) {
  const pagina = NAV.find((item) => item.id === tab) || NAV[0];

  return (
    <div className="admin-app">
      <header className="admin-topbar">
        <div className="admin-topbar__brand">
          <Logo variant="header" />
          <div className="admin-topbar__titles">
            <span className="admin-topbar__tag">Painel administrativo</span>
            <strong>Clube Superama</strong>
          </div>
        </div>
        <div className="admin-topbar__actions">
          <span className="admin-topbar__user">{admin?.usuario}</span>
          <button type="button" className="admin-btn admin-btn--ghost admin-btn--sm" onClick={onLogout}>
            Sair
          </button>
        </div>
      </header>

      <div className="admin-body">
        <aside className="admin-sidebar" aria-label="Menu do painel">
          <p className="admin-sidebar__label">Áreas</p>
          <nav className="admin-nav">
            {NAV.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`admin-nav__item ${tab === item.id ? "admin-nav__item--active" : ""}`}
                onClick={() => onTabChange(item.id)}
                aria-current={tab === item.id ? "page" : undefined}
              >
                <span className="admin-nav__icon" aria-hidden="true">
                  {item.icon}
                </span>
                <span className="admin-nav__text">
                  <strong>{item.label}</strong>
                  <small>{item.desc}</small>
                </span>
              </button>
            ))}
          </nav>
        </aside>

        <div className="admin-content">
          <header className="admin-page-head">
            <h1>{pagina.label}</h1>
            <p>{pagina.desc}</p>
          </header>
          {children}
        </div>
      </div>
      <div className="admin-footer-bar">
        <span className="admin-footer-bar__version" title="Versão congelada do código">
          v{APP_VERSION}
        </span>
        <MetajiCredit className="metaji-credit--admin-panel" />
      </div>
    </div>
  );
}
