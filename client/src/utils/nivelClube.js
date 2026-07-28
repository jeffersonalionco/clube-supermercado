import { createContext, useContext } from "react";

export const NivelClubeContext = createContext(null);

export function useNivelClube() {
  return useContext(NivelClubeContext);
}

/** Escada de níveis (espelha o backend). */
export const ESCADA_NIVEIS = [
  {
    id: "bronze",
    nome: "Bronze",
    descricao: "Cliente ocasional",
    minInclusive: 0,
    frase: "Todo membro começa aqui. Cada compra conta!",
  },
  {
    id: "prata",
    nome: "Prata",
    descricao: "Cliente frequente",
    minInclusive: 3000,
    frase: "Você já é presença certa no Superama.",
  },
  {
    id: "ouro",
    nome: "Ouro",
    descricao: "Cliente fiel",
    minInclusive: 8000,
    frase: "Fidelidade em alta — o clube reconhece.",
  },
  {
    id: "diamante",
    nome: "Diamante",
    descricao: "Cliente VIP",
    minInclusive: 15000,
    frase: "O topo do Clube Superama+. Status máximo!",
  },
];

export function formatarReaisNivel(valor, { centavos = false } = {}) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: centavos ? 2 : 0,
    minimumFractionDigits: centavos ? 2 : 0,
  });
}

export function montarProgressoEscada(clube) {
  const gasto = Math.max(0, Number(clube?.gastoAno) || 0);
  const atualId = clube?.nivelId || "bronze";
  const ordemAtual = ESCADA_NIVEIS.findIndex((n) => n.id === atualId);

  return ESCADA_NIVEIS.map((nivel, index) => {
    const proximo = ESCADA_NIVEIS[index + 1] || null;
    const alcançado = gasto >= nivel.minInclusive;
    const atual = nivel.id === atualId;
    const falta =
      gasto >= nivel.minInclusive
        ? 0
        : Math.max(0, Math.round((nivel.minInclusive - gasto) * 100) / 100);

    let progressoPct = 0;
    if (atual && proximo) {
      const base = nivel.minInclusive;
      const teto = proximo.minInclusive;
      progressoPct = Math.min(
        100,
        Math.max(0, Math.round(((gasto - base) / Math.max(teto - base, 1)) * 100))
      );
    } else if (atual && !proximo) {
      progressoPct = 100;
    } else if (alcançado) {
      progressoPct = 100;
    } else if (index === ordemAtual + 1 && clube?.progressoPct != null) {
      progressoPct = clube.progressoPct;
    }

    return {
      ...nivel,
      alcançado,
      atual,
      bloqueado: !alcançado && !atual,
      falta,
      progressoPct,
      proximoNome: proximo?.nome || null,
      limiarProximo: proximo?.minInclusive ?? null,
    };
  });
}
