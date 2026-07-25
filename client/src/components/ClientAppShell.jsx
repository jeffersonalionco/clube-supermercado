import ClientBottomNav from "./ClientBottomNav.jsx";
import ClientDesktopNav from "./ClientDesktopNav.jsx";
import MetajiCredit from "./MetajiCredit.jsx";
import { TAB_VIEWS } from "../utils/navigation.js";

export default function ClientAppShell({
  view,
  onNavigate,
  usuario,
  onPerfil,
  onLogout,
  pontosAtivo = true,
  children,
}) {
  const showTabs = TAB_VIEWS.includes(view);

  return (
    <div
      className={[
        showTabs ? "client-shell client-shell--tabs" : "client-shell",
        showTabs && view !== "home" ? "client-shell--with-metaji" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {showTabs && (
        <ClientDesktopNav
          view={view}
          onNavigate={onNavigate}
          usuario={usuario}
          onPerfil={onPerfil}
          onLogout={onLogout}
          pontosAtivo={pontosAtivo}
        />
      )}
      <div className="client-desktop-body">
        {children}
        {showTabs && view !== "home" && (
          <MetajiCredit className="metaji-credit--client metaji-credit--shell" />
        )}
      </div>
      {showTabs && <ClientBottomNav view={view} onNavigate={onNavigate} pontosAtivo={pontosAtivo} />}
    </div>
  );
}
