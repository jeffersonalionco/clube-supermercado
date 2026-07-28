import { useCallback, useEffect, useState } from "react";
import AdminLoginPage from "../pages/admin/AdminLoginPage.jsx";
import AdminClientesPage from "../pages/admin/AdminClientesPage.jsx";
import AdminPontosPage from "../pages/admin/AdminPontosPage.jsx";
import AdminBrindesPage from "../pages/admin/AdminBrindesPage.jsx";
import AdminUsuariosPage from "../pages/admin/AdminUsuariosPage.jsx";
import AdminAdministradoresPage from "../pages/admin/AdminAdministradoresPage.jsx";
import AdminLegalPage from "../pages/admin/AdminLegalPage.jsx";
import AdminManualPage from "../pages/admin/AdminManualPage.jsx";
import AdminProgramaPage from "../pages/admin/AdminProgramaPage.jsx";
import AdminConteudoPage from "../pages/admin/AdminConteudoPage.jsx";
import AdminNovidadesPage from "../pages/admin/AdminNovidadesPage.jsx";
import AdminClubeDescontosPage from "../pages/admin/AdminClubeDescontosPage.jsx";
import { clearAdminSession, loadAdminSession } from "../utils/adminSession.js";
import "../styles/admin.css";

import { adminPathFromHash } from "../utils/adminHash.js";

function adminTabFromHash() {
  const path = adminPathFromHash();
  if (path === "admin/admins" || path.startsWith("admin/admins/")) {
    return "admins";
  }
  if (path === "admin/legal" || path.startsWith("admin/legal/")) {
    return "legal";
  }
  if (path === "admin/manual" || path.startsWith("admin/manual/")) {
    return "manual";
  }
  if (path === "admin/programa" || path.startsWith("admin/programa/")) {
    return "programa";
  }
  if (path === "admin/conteudo" || path.startsWith("admin/conteudo/")) {
    return "conteudo";
  }
  if (path === "admin/novidades" || path.startsWith("admin/novidades/")) {
    return "novidades";
  }
  if (
    path === "admin/clube-descontos" ||
    path.startsWith("admin/clube-descontos/")
  ) {
    return "clube-descontos";
  }
  if (path === "admin/clientes" || path.startsWith("admin/clientes/")) {
    return "clientes";
  }
  if (path === "admin/brindes" || path.startsWith("admin/brindes/")) {
    return "brindes";
  }
  if (path === "admin/usuarios" || path.startsWith("admin/usuarios/")) {
    return "usuarios";
  }
  return "pontos";
}

function hashForAdminTab(tab) {
  if (tab === "clientes") return "#/admin/clientes";
  if (tab === "brindes") return "#/admin/brindes";
  if (tab === "usuarios") return "#/admin/usuarios";
  if (tab === "admins") return "#/admin/admins";
  if (tab === "legal") return "#/admin/legal";
  if (tab === "manual") return "#/admin/manual";
  if (tab === "programa") return "#/admin/programa";
  if (tab === "conteudo") return "#/admin/conteudo";
  if (tab === "novidades") return "#/admin/novidades";
  if (tab === "clube-descontos") return "#/admin/clube-descontos";
  return "#/admin/pontos";
}

export default function AdminApp() {
  const [session, setSession] = useState(() => loadAdminSession());
  const [tab, setTab] = useState(() => adminTabFromHash());

  useEffect(() => {
    function onHashChange() {
      setTab(adminTabFromHash());
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const handleLogin = useCallback((novaSessao) => {
    setSession(novaSessao);
  }, []);

  const handleLogout = useCallback(() => {
    clearAdminSession();
    setSession(null);
  }, []);

  const handleTabChange = useCallback((novaTab) => {
    window.location.hash = hashForAdminTab(novaTab).slice(1);
    setTab(novaTab);
  }, []);

  if (!session?.token) {
    return <AdminLoginPage onLogin={handleLogin} />;
  }

  const layoutProps = {
    tab,
    onTabChange: handleTabChange,
    onLogout: handleLogout,
    admin: session.admin,
  };

  if (tab === "brindes") {
    return <AdminBrindesPage {...layoutProps} />;
  }

  if (tab === "clientes") {
    return <AdminClientesPage {...layoutProps} />;
  }

  if (tab === "usuarios") {
    return <AdminUsuariosPage {...layoutProps} />;
  }

  if (tab === "legal") {
    return <AdminLegalPage {...layoutProps} />;
  }

  if (tab === "manual") {
    return <AdminManualPage {...layoutProps} />;
  }

  if (tab === "programa") {
    return <AdminProgramaPage {...layoutProps} />;
  }

  if (tab === "conteudo") {
    return <AdminConteudoPage {...layoutProps} />;
  }

  if (tab === "novidades") {
    return <AdminNovidadesPage {...layoutProps} />;
  }

  if (tab === "clube-descontos") {
    return <AdminClubeDescontosPage {...layoutProps} />;
  }

  if (tab === "admins") {
    return <AdminAdministradoresPage {...layoutProps} />;
  }

  return <AdminPontosPage {...layoutProps} />;
}
