import { somarGastoClienteWrpdv } from "./wrpdvVendasService.js";
import { formatarDataBR } from "../utils/periodoVendas.js";

/**
 * TEMP — simulação de nível para teste de UI.
 * Deixe `{}` em produção. Ex.: { "12764500955": 16000 }
 */
const SIMULAR_GASTO_ANO_POR_CPF = {};

/** Limiares anuais (ano corrente). Cada nível começa neste valor (inclusive). */
export const NIVEIS_FIDELIDADE = [
  {
    id: "bronze",
    nome: "Bronze",
    descricao: "Cliente ocasional",
    minInclusive: 0,
    proximoId: "prata",
    limiarProximo: 3000,
  },
  {
    id: "prata",
    nome: "Prata",
    descricao: "Cliente frequente",
    minInclusive: 3000,
    proximoId: "ouro",
    limiarProximo: 8000,
  },
  {
    id: "ouro",
    nome: "Ouro",
    descricao: "Cliente fiel",
    minInclusive: 8000,
    proximoId: "diamante",
    limiarProximo: 15000,
  },
  {
    id: "diamante",
    nome: "Diamante",
    descricao: "Cliente VIP",
    minInclusive: 15000,
    proximoId: null,
    limiarProximo: null,
  },
];

const cacheGasto = new Map();
const CACHE_TTL_MS = 15 * 60 * 1000;

function chaveCache(cpf, ano) {
  return `${cpf}:${ano}`;
}

export function resolverNivelPorGasto(gastoAno) {
  const gasto = Math.max(0, Number(gastoAno) || 0);

  let nivel = NIVEIS_FIDELIDADE[0];
  for (const item of NIVEIS_FIDELIDADE) {
    if (gasto >= item.minInclusive) {
      nivel = item;
    }
  }

  const proximo = NIVEIS_FIDELIDADE.find((n) => n.id === nivel.proximoId) || null;
  const limiar = nivel.limiarProximo;
  const faltaParaProximo =
    limiar == null ? 0 : Math.max(0, Math.round((limiar - gasto) * 100) / 100);
  const base = nivel.minInclusive;
  const faixa = limiar == null ? 1 : Math.max(limiar - base, 1);
  const progressoPct =
    limiar == null
      ? 100
      : Math.min(100, Math.max(0, Math.round(((gasto - base) / faixa) * 100)));

  return {
    id: nivel.id,
    nome: nivel.nome,
    descricao: nivel.descricao,
    gastoAno: Math.round(gasto * 100) / 100,
    proximoNivel: proximo
      ? { id: proximo.id, nome: proximo.nome, limiar: limiar }
      : null,
    faltaParaProximo,
    progressoPct,
  };
}

function periodoAnoCorrente(agora = new Date()) {
  const ano = agora.getFullYear();
  const inicio = new Date(ano, 0, 1);
  const fim = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  return {
    ano,
    dataini: formatarDataBR(inicio),
    datafim: formatarDataBR(fim),
  };
}

/**
 * Gasto no ano corrente + nível de fidelidade.
 * Cache curto por CPF para não sobrecarregar o PDV em cada /me.
 */
export async function obterNivelFidelidadeCliente(cpf, { forcar = false } = {}) {
  const { ano, dataini, datafim } = periodoAnoCorrente();
  const cpfNorm = String(cpf || "").replace(/\D/g, "");
  const key = chaveCache(cpfNorm, ano);

  const gastoSimulado = SIMULAR_GASTO_ANO_POR_CPF[cpfNorm];
  if (gastoSimulado != null) {
    const nivel = resolverNivelPorGasto(gastoSimulado);
    const payload = {
      nivel: nivel.nome,
      nivelId: nivel.id,
      nivelDescricao: nivel.descricao,
      statusClube: "ativo",
      gastoAno: nivel.gastoAno,
      anoReferencia: ano,
      proximoNivel: nivel.proximoNivel,
      faltaParaProximo: nivel.faltaParaProximo,
      progressoPct: nivel.progressoPct,
      _simulado: true,
    };
    cacheGasto.set(key, { at: Date.now(), payload });
    console.warn(
      `[nivel-fidelidade] SIMULAÇÃO ativa CPF ${cpfNorm} → ${nivel.nome} (R$ ${gastoSimulado})`
    );
    return payload;
  }

  if (!forcar) {
    const hit = cacheGasto.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      return hit.payload;
    }
  }

  let gastoAno = 0;
  try {
    const soma = await somarGastoClienteWrpdv(cpfNorm, dataini, datafim);
    if (soma.ok) {
      gastoAno = soma.totalGasto;
    }
  } catch (error) {
    console.error("[nivel-fidelidade]", error.message);
  }

  const nivel = resolverNivelPorGasto(gastoAno);
  const payload = {
    nivel: nivel.nome,
    nivelId: nivel.id,
    nivelDescricao: nivel.descricao,
    statusClube: "ativo",
    gastoAno: nivel.gastoAno,
    anoReferencia: ano,
    proximoNivel: nivel.proximoNivel,
    faltaParaProximo: nivel.faltaParaProximo,
    progressoPct: nivel.progressoPct,
  };

  cacheGasto.set(key, { at: Date.now(), payload });
  return payload;
}

export function nivelFidelidadeFallback() {
  const { ano } = periodoAnoCorrente();
  const nivel = resolverNivelPorGasto(0);
  return {
    nivel: nivel.nome,
    nivelId: nivel.id,
    nivelDescricao: nivel.descricao,
    statusClube: "ativo",
    gastoAno: 0,
    anoReferencia: ano,
    proximoNivel: nivel.proximoNivel,
    faltaParaProximo: nivel.faltaParaProximo,
    progressoPct: nivel.progressoPct,
  };
}
