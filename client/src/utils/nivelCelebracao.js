const STORAGE_KEY = "superama_nivel_visto";

export const ORDEM_NIVEIS = {
  bronze: 0,
  prata: 1,
  ouro: 2,
  diamante: 3,
};

export const META_NIVEIS = {
  bronze: { nome: "Bronze", descricao: "Cliente ocasional" },
  prata: { nome: "Prata", descricao: "Cliente frequente" },
  ouro: { nome: "Ouro", descricao: "Cliente fiel" },
  diamante: { nome: "Diamante", descricao: "Cliente VIP" },
};

function lerMapa() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw);
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

function gravarMapa(mapa) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(mapa));
  } catch {
    /* ignore quota */
  }
}

export function lerNivelVisto(cpf) {
  const key = String(cpf || "").replace(/\D/g, "");
  if (!key) return null;
  const item = lerMapa()[key];
  if (!item?.nivelId) return null;
  return {
    nivelId: item.nivelId,
    ano: item.ano ?? null,
  };
}

export function salvarNivelVisto(cpf, nivelId, ano) {
  const key = String(cpf || "").replace(/\D/g, "");
  if (!key || !nivelId) return;
  const mapa = lerMapa();
  mapa[key] = { nivelId, ano: ano ?? null, em: Date.now() };
  gravarMapa(mapa);
}

/**
 * Decide se deve celebrar subida de nível neste acesso ao painel.
 * Primeiro registro só grava a base (sem animação).
 */
export function avaliarCelebracaoNivel({ cpf, clube }) {
  const nivelId = clube?.nivelId;
  const ano = clube?.anoReferencia ?? null;
  if (!cpf || !nivelId) {
    return { celebrar: false };
  }

  const prev = lerNivelVisto(cpf);

  if (!prev) {
    salvarNivelVisto(cpf, nivelId, ano);
    return { celebrar: false };
  }

  if (prev.ano != null && ano != null && prev.ano !== ano) {
    salvarNivelVisto(cpf, nivelId, ano);
    return { celebrar: false };
  }

  const ordemAtual = ORDEM_NIVEIS[nivelId] ?? 0;
  const ordemAnterior = ORDEM_NIVEIS[prev.nivelId] ?? 0;

  if (ordemAtual > ordemAnterior) {
    return {
      celebrar: true,
      de: prev.nivelId,
      para: nivelId,
      clube,
    };
  }

  if (prev.nivelId !== nivelId || prev.ano !== ano) {
    salvarNivelVisto(cpf, nivelId, ano);
  }

  return { celebrar: false };
}
