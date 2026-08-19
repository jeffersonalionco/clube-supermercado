import { useState } from "react";
import {
  LayoutDashboard,
  Users,
  Star,
  UserCircle,
  BarChart3,
  Mail,
  Gift,
  Tag,
  ShieldCheck,
  Settings,
  Play,
  PenLine,
  FileText,
  HelpCircle,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import Logo from "../Logo.jsx";
import MetajiCredit from "../MetajiCredit.jsx";
import { APP_VERSION } from "../../version.js";

const NAV_SECTIONS = [
  {
    label: "Principal",
    items: [
      { id: "dashboard", label: "Dashboard", desc: "Visão geral do programa", Icon: LayoutDashboard },
      { id: "clientes", label: "Clientes", desc: "Compras, segmentos e ficha 360°", Icon: Users },
      { id: "relatorio", label: "Relatórios", desc: "Painéis, insights e indicadores", Icon: BarChart3 },
    ],
  },
  {
    label: "Operação",
    items: [
      { id: "pontos", label: "Baixa de pontos", desc: "Resgate de prêmios", Icon: Star },
      { id: "brindes", label: "Brindes", desc: "Cadastro e estoque", Icon: Gift },
      { id: "clube-descontos", label: "Clube de descontos", desc: "Preços exclusivos ERP", Icon: Tag },
      { id: "usuarios", label: "Usuários", desc: "Cadastros e senhas", Icon: UserCircle },
    ],
  },
  {
    label: "Comunicação",
    items: [
      { id: "marketing", label: "Marketing", desc: "E-mails e campanhas", Icon: Mail },
      { id: "novidades", label: "Novidades", desc: "Avisos e dicas no app", Icon: PenLine },
      { id: "conteudo", label: "Conteúdo", desc: "Vídeo e destaques", Icon: Play },
    ],
  },
  {
    label: "Configuração",
    items: [
      { id: "programa", label: "Programa", desc: "Ativar/desativar pontos", Icon: Settings },
      { id: "admins", label: "Administradores", desc: "Perfis e permissões", Icon: ShieldCheck },
      { id: "legal", label: "Regulamento", desc: "Textos legais", Icon: FileText },
      { id: "manual", label: "Manual", desc: "Regras e operação", Icon: HelpCircle },
    ],
  },
];

const ALL_ITEMS = NAV_SECTIONS.flatMap((s) => s.items);

export default function AdminLayout({ tab, onTabChange, onLogout, admin, children }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pagina = ALL_ITEMS.find((item) => item.id === tab) || ALL_ITEMS[0];

  const handleNav = (id) => {
    onTabChange(id);
    setMobileOpen(false);
  };

  return (
    <div className="admin-app">
      <header className="admin-topbar">
        <div className="admin-topbar__brand">
          <button
            type="button"
            className="admin-topbar__hamburger"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Menu"
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
          <Logo variant="header" />
          <div className="admin-topbar__titles">
            <span className="admin-topbar__tag">Painel administrativo</span>
            <strong>Clube Superama</strong>
          </div>
        </div>
        <div className="admin-topbar__center">{pagina.label}</div>
        <div className="admin-topbar__actions">
          <span className="admin-topbar__user">{admin?.usuario}</span>
          <button type="button" className="admin-btn admin-btn--ghost admin-btn--sm" onClick={onLogout}>
            <LogOut size={15} style={{ marginRight: 4 }} />
            Sair
          </button>
        </div>
      </header>

      {mobileOpen && (
        <div className="admin-sidebar-overlay" onClick={() => setMobileOpen(false)} />
      )}

      <div className="admin-body">
        <aside className={`admin-sidebar ${mobileOpen ? "admin-sidebar--open" : ""}`} aria-label="Menu do painel">
          {NAV_SECTIONS.map((section) => (
            <div key={section.label} className="admin-sidebar__section">
              <p className="admin-sidebar__label">{section.label}</p>
              <nav className="admin-nav">
                {section.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`admin-nav__item ${tab === item.id ? "admin-nav__item--active" : ""}`}
                    onClick={() => handleNav(item.id)}
                    aria-current={tab === item.id ? "page" : undefined}
                  >
                    <span className="admin-nav__icon" aria-hidden="true">
                      <item.Icon size={18} />
                    </span>
                    <span className="admin-nav__text">
                      <strong>{item.label}</strong>
                      <small>{item.desc}</small>
                    </span>
                  </button>
                ))}
              </nav>
            </div>
          ))}
          <div className="admin-sidebar__footer">
            <span className="admin-sidebar__version">v{APP_VERSION}</span>
            <MetajiCredit className="metaji-credit--admin-panel" />
          </div>
        </aside>

        <div className="admin-content">
          {tab !== "dashboard" && (
            <header className="admin-page-head">
              <h1>{pagina.label}</h1>
              <p>{pagina.desc}</p>
            </header>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}
