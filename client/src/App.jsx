import { useCallback, useEffect, useState } from "react";
import LoginPage from "./pages/LoginPage.jsx";
import HomePage from "./pages/HomePage.jsx";
import EditarDadosPage from "./pages/EditarDadosPage.jsx";
import ComprasPage from "./pages/ComprasPage.jsx";
import PerfilPage from "./pages/PerfilPage.jsx";
import ContatoPage from "./pages/ContatoPage.jsx";
import { clearSession, loadSession } from "./utils/session.js";
import {
  APP_VIEWS,
  isAppHistoryState,
  pushView,
  replaceView,
  seedHistoryStack,
  viewFromLocation,
} from "./utils/navigation.js";

function resolveViewFromPopState(event) {
  if (isAppHistoryState(event.state) && APP_VIEWS.includes(event.state.view)) {
    return event.state.view;
  }
  return viewFromLocation();
}

export default function App() {
  const [session, setSession] = useState(() => loadSession());
  const [view, setView] = useState("home");

  const navegar = useCallback((novaView, { substituir = false } = {}) => {
    if (substituir) {
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
      setView("home");
      replaceView("home");
      return;
    }

    const destino = viewFromLocation();
    setView(destino);

    if (!isAppHistoryState(history.state)) {
      seedHistoryStack(destino);
    }
  }, [session?.token]);

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
    if (view === "editar") {
      return (
        <EditarDadosPage onVoltar={voltar} onSalvo={voltar} />
      );
    }
    if (view === "compras") {
      return <ComprasPage onVoltar={voltar} />;
    }
    if (view === "perfil") {
      return (
        <PerfilPage onVoltar={voltar} onEditar={() => navegar("editar")} />
      );
    }
    if (view === "contato") {
      return (
        <ContatoPage onVoltar={voltar} onEditar={() => navegar("editar")} />
      );
    }
    return (
      <HomePage
        onLogout={handleLogout}
        onCompras={() => navegar("compras")}
        onPerfil={() => navegar("perfil")}
        onContato={() => navegar("contato")}
      />
    );
  }

  return <LoginPage onLogin={handleLogin} />;
}
