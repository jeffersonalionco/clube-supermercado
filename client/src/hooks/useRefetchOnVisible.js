import { useEffect } from "react";

/** Recarrega dados quando o usuário volta à aba ou à janela do app. */
export function useRefetchOnVisible(callback, enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;

    function onVisible() {
      if (document.visibilityState === "visible") {
        callback();
      }
    }

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [callback, enabled]);
}
