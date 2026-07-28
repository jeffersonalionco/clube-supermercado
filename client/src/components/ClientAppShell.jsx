import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ClientBottomNav from "./ClientBottomNav.jsx";
import ClientDesktopNav from "./ClientDesktopNav.jsx";
import MetajiCredit from "./MetajiCredit.jsx";
import MenuCoachMark from "./MenuCoachMark.jsx";
import NivelUpCelebracao from "./NivelUpCelebracao.jsx";
import NivelDetalheModal from "./NivelDetalheModal.jsx";
import { TAB_VIEWS } from "../utils/navigation.js";
import { NivelClubeContext } from "../utils/nivelClube.js";
import {
  avaliarCelebracaoNivel,
  salvarNivelVisto,
} from "../utils/nivelCelebracao.js";
import {
  isMobileClientNav,
  marcarMenuCoachVisto,
  menuCoachJaVisto,
} from "../utils/menuCoach.js";

export default function ClientAppShell({
  view,
  onNavigate,
  usuario,
  clube,
  onPerfil,
  onLogout,
  pontosAtivo = true,
  children,
}) {
  const showTabs = TAB_VIEWS.includes(view);
  const [celebracao, setCelebracao] = useState(null);
  const [detalheAberto, setDetalheAberto] = useState(false);
  const [menuCoachAberto, setMenuCoachAberto] = useState(false);
  const celebracaoExibidaRef = useRef(null);

  useEffect(() => {
    document.documentElement.classList.remove("nivel-up-open");
    document.body.classList.remove("nivel-up-open");
    document.documentElement.classList.remove("nivel-detalhe-open");
    document.body.classList.remove("nivel-detalhe-open");
  }, []);

  useEffect(() => {
    if (!clube?.nivelId || !usuario?.cpf) return;

    const chave = `${usuario.cpf}:${clube.nivelId}:${clube.anoReferencia || ""}`;
    if (celebracaoExibidaRef.current === chave) return;

    const resultado = avaliarCelebracaoNivel({
      cpf: usuario.cpf,
      clube,
    });

    if (resultado.celebrar) {
      celebracaoExibidaRef.current = chave;
      setCelebracao({
        clube,
        de: resultado.de,
        para: resultado.para,
      });
    }
  }, [clube, usuario?.cpf]);

  useEffect(() => {
    if (!showTabs || !usuario?.cpf) return;
    if (!isMobileClientNav()) return;
    if (menuCoachJaVisto(usuario.cpf)) return;
    if (celebracao) return;

    const timer = window.setTimeout(() => {
      if (!isMobileClientNav()) return;
      if (menuCoachJaVisto(usuario.cpf)) return;
      setMenuCoachAberto(true);
    }, 700);

    return () => window.clearTimeout(timer);
  }, [showTabs, usuario?.cpf, celebracao]);

  const fecharCelebracao = useCallback(() => {
    if (usuario?.cpf && clube?.nivelId) {
      salvarNivelVisto(usuario.cpf, clube.nivelId, clube.anoReferencia);
    }
    setCelebracao(null);
  }, [usuario?.cpf, clube]);

  const fecharMenuCoach = useCallback(() => {
    marcarMenuCoachVisto(usuario?.cpf);
    setMenuCoachAberto(false);
  }, [usuario?.cpf]);

  const abrirDetalhe = useCallback(() => {
    if (!clube) return;
    setDetalheAberto(true);
  }, [clube]);

  const fecharDetalhe = useCallback(() => {
    setDetalheAberto(false);
  }, []);

  const nivelCtx = useMemo(
    () => ({
      clube,
      abrirDetalhe,
    }),
    [clube, abrirDetalhe]
  );

  return (
    <NivelClubeContext.Provider value={nivelCtx}>
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
            clube={clube}
            onPerfil={onPerfil}
            onLogout={onLogout}
            onAbrirNivel={abrirDetalhe}
            pontosAtivo={pontosAtivo}
          />
        )}
        <div className="client-desktop-body">
          {children}
          {showTabs && view !== "home" && (
            <MetajiCredit className="metaji-credit--client metaji-credit--shell" />
          )}
        </div>
        {showTabs && (
          <ClientBottomNav
            view={view}
            onNavigate={onNavigate}
            pontosAtivo={pontosAtivo}
            coachAtivo={menuCoachAberto}
          />
        )}

        <MenuCoachMark aberto={menuCoachAberto} onFechar={fecharMenuCoach} />

        <NivelUpCelebracao
          aberto={Boolean(celebracao)}
          clube={celebracao?.clube || clube}
          nome={usuario?.nome}
          nivelAnteriorId={celebracao?.de}
          onFechar={fecharCelebracao}
        />

        <NivelDetalheModal
          aberto={detalheAberto && Boolean(clube)}
          clube={clube}
          nome={usuario?.nome}
          onFechar={fecharDetalhe}
        />
      </div>
    </NivelClubeContext.Provider>
  );
}
