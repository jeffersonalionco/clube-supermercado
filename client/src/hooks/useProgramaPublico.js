import { useEffect, useState } from "react";
import { apiUrl, parseApiResponse } from "../utils/api.js";

let cache = null;
let promise = null;

async function buscarProgramaPublico() {
  if (cache) return cache;
  if (!promise) {
    promise = fetch(apiUrl("/api/auth/programa"))
      .then(async (response) => {
        const { data } = await parseApiResponse(response);
        if (!response.ok) {
          throw new Error(data.error || "Não foi possível carregar o programa");
        }
        cache = data;
        return data;
      })
      .catch(() => {
        cache = { pontosAtivo: false };
        return cache;
      });
  }
  return promise;
}

export function useProgramaPublico() {
  const [pontosAtivo, setPontosAtivo] = useState(() => Boolean(cache?.pontosAtivo));

  useEffect(() => {
    let ativo = true;
    buscarProgramaPublico().then((data) => {
      if (ativo) setPontosAtivo(Boolean(data?.pontosAtivo));
    });
    return () => {
      ativo = false;
    };
  }, []);

  return pontosAtivo;
}
