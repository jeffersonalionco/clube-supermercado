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
import AdminRelatoriosHubPage from "../pages/admin/AdminRelatoriosHubPage.jsx";
import AdminRadarComprasPage from "../pages/admin/AdminRadarComprasPage.jsx";
import AdminSegmentacaoRfmPage from "../pages/admin/AdminSegmentacaoRfmPage.jsx";
import AdminNiveisFidelidadePage from "../pages/admin/AdminNiveisFidelidadePage.jsx";
import AdminFunilNovosMembrosPage from "../pages/admin/AdminFunilNovosMembrosPage.jsx";
import AdminRelatorioClubePage from "../pages/admin/AdminRelatorioClubePage.jsx";
import AdminMarketingHubPage from "../pages/admin/AdminMarketingHubPage.jsx";
import AdminMarketingEmailPage from "../pages/admin/AdminMarketingEmailPage.jsx";
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
  if (path === "admin/relatorio" || path.startsWith("admin/relatorio/")) {
    return "relatorio";
  }
  if (path === "admin/marketing" || path.startsWith("admin/marketing/")) {
    return "marketing";
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

function marketingSubFromHash() {
  const path = adminPathFromHash();
  if (path.startsWith("admin/marketing/email")) return "email";
  return "hub";
}

function relatorioSubFromHash() {
  const path = adminPathFromHash();
  if (path.startsWith("admin/relatorio/radar-compras")) return "radar-compras";
  if (path.startsWith("admin/relatorio/segmentacao-rfm")) {
    return "segmentacao-rfm";
  }
  if (path.startsWith("admin/relatorio/niveis-fidelidade")) {
    return "niveis-fidelidade";
  }
  if (path.startsWith("admin/relatorio/funil-novos-membros")) {
    return "funil-novos-membros";
  }
  if (
    path.startsWith("admin/relatorio/clube") ||
    path === "admin/relatorio/completo"
  ) {
    return "clube";
  }
  return "hub";
}

function hashForAdminTab(tab, sub) {
  if (tab === "clientes") return "#/admin/clientes";
  if (tab === "brindes") return "#/admin/brindes";
  if (tab === "usuarios") return "#/admin/usuarios";
  if (tab === "relatorio") {
    if (sub === "radar-compras") return "#/admin/relatorio/radar-compras";
    if (sub === "segmentacao-rfm") return "#/admin/relatorio/segmentacao-rfm";
    if (sub === "niveis-fidelidade") {
      return "#/admin/relatorio/niveis-fidelidade";
    }
    if (sub === "funil-novos-membros") {
      return "#/admin/relatorio/funil-novos-membros";
    }
    if (sub === "clube") return "#/admin/relatorio/clube";
    return "#/admin/relatorio";
  }
  if (tab === "marketing") {
    return sub === "email" ? "#/admin/marketing/email" : "#/admin/marketing";
  }
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
  const [marketingSub, setMarketingSub] = useState(() => marketingSubFromHash());
  const [relatorioSub, setRelatorioSub] = useState(() => relatorioSubFromHash());

  useEffect(() => {
    function onHashChange() {
      setTab(adminTabFromHash());
      setMarketingSub(marketingSubFromHash());
      setRelatorioSub(relatorioSubFromHash());
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
    if (novaTab === "marketing") setMarketingSub("hub");
    if (novaTab === "relatorio") setRelatorioSub("hub");
  }, []);

  const abrirMarketingEmail = useCallback(() => {
    window.location.hash = hashForAdminTab("marketing", "email").slice(1);
    setTab("marketing");
    setMarketingSub("email");
  }, []);

  const voltarMarketingHub = useCallback(() => {
    window.location.hash = hashForAdminTab("marketing").slice(1);
    setTab("marketing");
    setMarketingSub("hub");
  }, []);

  const abrirRelatorioPainel = useCallback((painelId) => {
    window.location.hash = hashForAdminTab("relatorio", painelId).slice(1);
    setTab("relatorio");
    setRelatorioSub(painelId);
  }, []);

  const voltarRelatoriosHub = useCallback(() => {
    window.location.hash = hashForAdminTab("relatorio").slice(1);
    setTab("relatorio");
    setRelatorioSub("hub");
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

  if (tab === "relatorio") {
    if (relatorioSub === "radar-compras") {
      return (
        <AdminRadarComprasPage
          {...layoutProps}
          onVoltarHub={voltarRelatoriosHub}
        />
      );
    }
    if (relatorioSub === "segmentacao-rfm") {
      return (
        <AdminSegmentacaoRfmPage
          {...layoutProps}
          onVoltarHub={voltarRelatoriosHub}
        />
      );
    }
    if (relatorioSub === "niveis-fidelidade") {
      return (
        <AdminNiveisFidelidadePage
          {...layoutProps}
          onVoltarHub={voltarRelatoriosHub}
        />
      );
    }
    if (relatorioSub === "funil-novos-membros") {
      return (
        <AdminFunilNovosMembrosPage
          {...layoutProps}
          onVoltarHub={voltarRelatoriosHub}
        />
      );
    }
    if (relatorioSub === "clube") {
      return (
        <AdminRelatorioClubePage
          {...layoutProps}
          onVoltarHub={voltarRelatoriosHub}
        />
      );
    }
    return (
      <AdminRelatoriosHubPage
        {...layoutProps}
        onAbrirPainel={abrirRelatorioPainel}
      />
    );
  }

  if (tab === "marketing") {
    if (marketingSub === "email") {
      return (
        <AdminMarketingEmailPage
          {...layoutProps}
          onVoltarHub={voltarMarketingHub}
        />
      );
    }
    return (
      <AdminMarketingHubPage
        {...layoutProps}
        onAbrirEmail={abrirMarketingEmail}
      />
    );
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
