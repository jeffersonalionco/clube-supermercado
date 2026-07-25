import { useCallback, useEffect, useState } from "react";
import AdminApp from "./admin/AdminApp.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import HomePage from "./pages/HomePage.jsx";
import EditarDadosPage from "./pages/EditarDadosPage.jsx";
import ComprasPage from "./pages/ComprasPage.jsx";
import PremiosPage from "./pages/PremiosPage.jsx";
import PontosHistoricoPage from "./pages/PontosHistoricoPage.jsx";
import PerfilPage from "./pages/PerfilPage.jsx";
import ContatoPage from "./pages/ContatoPage.jsx";
import LegalPage from "./pages/LegalPage.jsx";
import { clearSession, loadSession } from "./utils/session.js";
import {
  ALL_VIEWS,
  PUBLIC_VIEWS,
  TAB_VIEWS,
  isAppHistoryState,
  pushView,
  replaceView,
  seedHistoryStack,
  viewFromLocation,
} from "./utils/navigation.js";
import ClientAppShell from "./components/ClientAppShell.jsx";
import { useProgramaPontos } from "./hooks/useProgramaPontos.js";

const VIEWS_PONTOS = new Set(["pontos", "premios"]);

function resolveViewFromPopState(event) {
  if (isAppHistoryState(event.state) && ALL_VIEWS.includes(event.state.view)) {
    return event.state.view;
  }
  return viewFromLocation();
}

function isAdminRoute() {
  const hash = window.location.hash.slice(1).replace(/^\//, "").trim();
  return hash === "admin" || hash.startsWith("admin/");
}

function ClientApp() {
  const [session, setSession] = useState(() => loadSession());
  const [view, setView] = useState("home");
  const { pontosAtivo } = useProgramaPontos(session);

  const navegar = useCallback((novaView, { substituir = false } = {}) => {
    const usarReplace = substituir || TAB_VIEWS.includes(novaView);
    if (usarReplace) {
      replaceView(novaView);
    } else {
      pushView(novaView);
    }
    setView(novaView);
  }, []);

  const voltar = useCallback(() => {
    history.back();
  }, []);

  useEffect(() => {
    function onPopState(event) {
      setView(resolveViewFromPopState(event));
    }

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (!session?.token) {
      const destino = viewFromLocation();
      if (PUBLIC_VIEWS.includes(destino)) {
        setView(destino);
        if (!isAppHistoryState(history.state)) {
          replaceView(destino);
        }
      } else {
        setView("home");
        replaceView("home");
      }
      return;
    }

    const destino = viewFromLocation();
    setView(destino);

    if (!isAppHistoryState(history.state)) {
      seedHistoryStack(destino);
    }
  }, [session?.token]);

  useEffect(() => {
    if (!session?.token || pontosAtivo) return;
    if (VIEWS_PONTOS.has(view)) {
      replaceView("compras");
      setView("compras");
    }
  }, [session?.token, pontosAtivo, view]);

  const handleLogin = useCallback((novaSessao) => {
    setSession(novaSessao);
    setView("home");
    replaceView("home");
  }, []);

  const handleLogout = useCallback(() => {
    clearSession();
    setSession(null);
    setView("home");
    replaceView("home");
  }, []);

  if (session?.token) {
    let page = null;

    if (view === "regulamento" || view === "privacidade") {
      page = <LegalPage slug={view} onVoltar={voltar} />;
    } else if (view === "editar") {
      page = <EditarDadosPage onVoltar={voltar} onSalvo={voltar} />;
    } else if (view === "compras") {
      page = (
        <ComprasPage
          tabMode
          pontosAtivo={pontosAtivo}
          onVoltar={voltar}
          onInicio={() => navegar("home")}
        />
      );
    } else if (view === "premios" && pontosAtivo) {
      page = (
        <PremiosPage
          tabMode
          onVoltar={voltar}
          onInicio={() => navegar("home")}
          onHistorico={() => navegar("pontos")}
        />
      );
    } else if (view === "pontos" && pontosAtivo) {
      page = (
        <PontosHistoricoPage
          tabMode
          onVoltar={voltar}
          onInicio={() => navegar("home")}
          onPremios={() => navegar("premios")}
          onCompras={() => navegar("compras")}
        />
      );
    } else if (view === "perfil") {
      page = (
        <PerfilPage onVoltar={voltar} onEditar={() => navegar("editar")} />
      );
    } else if (view === "contato") {
      page = (
        <ContatoPage onVoltar={voltar} onEditar={() => navegar("editar")} />
      );
    } else if ((view === "premios" || view === "pontos") && !pontosAtivo) {
      page = (
        <ComprasPage
          tabMode
          pontosAtivo={pontosAtivo}
          onVoltar={voltar}
          onInicio={() => navegar("home")}
        />
      );
    } else {
      page = (
        <HomePage
          pontosAtivo={pontosAtivo}
          onLogout={handleLogout}
          onCompras={() => navegar("compras")}
          onPremios={pontosAtivo ? () => navegar("premios") : undefined}
          onPontos={pontosAtivo ? () => navegar("pontos") : undefined}
          onPerfil={() => navegar("perfil")}
          onContato={() => navegar("contato")}
          onRegulamento={() => navegar("regulamento")}
          onPrivacidade={() => navegar("privacidade")}
        />
      );
    }

    return (
      <ClientAppShell
        view={view}
        onNavigate={navegar}
        usuario={session?.usuario}
        onPerfil={() => navegar("perfil")}
        onLogout={handleLogout}
        pontosAtivo={pontosAtivo}
      >
        {page}
      </ClientAppShell>
    );
  }

  if (PUBLIC_VIEWS.includes(view)) {
    return (
      <LegalPage
        slug={view}
        onVoltar={() => {
          history.back();
        }}
      />
    );
  }

  return <LoginPage onLogin={handleLogin} />;
}

export default function App() {
  const [adminRoute] = useState(() => isAdminRoute());

  if (adminRoute) {
    return <AdminApp />;
  }

  return <ClientApp />;
}
