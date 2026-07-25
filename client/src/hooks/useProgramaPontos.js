import { useCallback, useEffect, useState } from "react";
import { fetchAutenticado, loadSession, saveSession } from "../utils/session.js";

export function useProgramaPontos(session) {
  const [pontosAtivo, setPontosAtivo] = useState(() =>
    Boolean(session?.programa?.pontosAtivo)
  );

  const carregar = useCallback(async () => {
    if (!session?.token) return;

    try {
      const data = await fetchAutenticado("/api/cliente/programa");
      const ativo = Boolean(data.pontosAtivo);
      setPontosAtivo(ativo);

      const atual = loadSession();
      if (atual?.token) {
        saveSession({
          token: atual.token,
          usuario: atual.usuario,
          programa: data,
        });
      }
    } catch {
      /* mantém estado atual */
    }
  }, [session?.token]);

  useEffect(() => {
    setPontosAtivo(Boolean(session?.programa?.pontosAtivo));
  }, [session?.programa?.pontosAtivo]);

  useEffect(() => {
    if (!session?.token) return undefined;

    carregar();

    function onVisibility() {
      if (document.visibilityState === "visible") {
        carregar();
      }
    }

    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [session?.token, carregar]);

  return { pontosAtivo, recarregarPrograma: carregar };
}
