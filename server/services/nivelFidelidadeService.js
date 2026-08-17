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

function chaveCache(cpf, ano, dataini) {
  return `${cpf}:${ano}:${dataini || ""}`;
}

/**
 * Início do benefício do clube na plataforma = data de cadastro da conta.
 * O aceite do regulamento fica registrado para compliance, mas quem cria o
 * acesso já entra no programa a partir de criado_em.
 */
export function resolverDataAtivacaoClube(usuario) {
  if (!usuario || typeof usuario !== "object") return null;
  const raw =
    usuario.criado_em ||
    usuario.criadoEm ||
    usuario.aceite_regulamento_em ||
    usuario.aceiteRegulamentoEm ||
    null;
  if (!raw) return null;
  const d = raw instanceof Date ? raw : new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Ano corrente, mas o início não pode ser anterior à ativação do clube.
 * Assim compras antigas (só CPF no caixa, sem clube) não entram no nível.
 */
export function periodoGastoNivel(ativadoEm, agora = new Date()) {
  const ano = agora.getFullYear();
  const inicioAno = new Date(ano, 0, 1);
  const fim = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());

  let inicio = inicioAno;
  if (ativadoEm instanceof Date && !Number.isNaN(ativadoEm.getTime())) {
    const ativacaoDia = new Date(
      ativadoEm.getFullYear(),
      ativadoEm.getMonth(),
      ativadoEm.getDate()
    );
    if (ativacaoDia > inicio) {
      inicio = ativacaoDia;
    }
  }

  if (inicio > fim) {
    return {
      ano,
      dataini: formatarDataBR(fim),
      datafim: formatarDataBR(fim),
      periodoVazio: true,
      ativadoEm: ativadoEm instanceof Date ? formatarDataBR(ativadoEm) : null,
    };
  }

  return {
    ano,
    dataini: formatarDataBR(inicio),
    datafim: formatarDataBR(fim),
    periodoVazio: false,
    ativadoEm: ativadoEm instanceof Date ? formatarDataBR(ativadoEm) : null,
  };
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

/**
 * Gasto no ano corrente (somente após ativação do clube) + nível de fidelidade.
 * Cache curto por CPF para não sobrecarregar o PDV em cada /me.
 *
 * @param {string} cpf
 * @param {{ forcar?: boolean, ativadoEm?: Date|string|null, usuario?: object }} [opts]
 */
export async function obterNivelFidelidadeCliente(
  cpf,
  { forcar = false, ativadoEm = null, usuario = null } = {}
) {
  const ativacao =
    ativadoEm instanceof Date
      ? ativadoEm
      : ativadoEm
        ? new Date(ativadoEm)
        : resolverDataAtivacaoClube(usuario);

  const { ano, dataini, datafim, periodoVazio, ativadoEm: ativadoEmBr } =
    periodoGastoNivel(
      ativacao && !Number.isNaN(ativacao.getTime()) ? ativacao : null
    );

  const cpfNorm = String(cpf || "").replace(/\D/g, "");
  const key = chaveCache(cpfNorm, ano, dataini);

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
      gastoDesde: dataini,
      ativadoEm: ativadoEmBr,
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
  if (!periodoVazio) {
    try {
      const soma = await somarGastoClienteWrpdv(cpfNorm, dataini, datafim);
      if (soma.ok) {
        gastoAno = soma.totalGasto;
      }
    } catch (error) {
      console.error("[nivel-fidelidade]", error.message);
    }
  }

  const nivel = resolverNivelPorGasto(gastoAno);
  const payload = {
    nivel: nivel.nome,
    nivelId: nivel.id,
    nivelDescricao: nivel.descricao,
    statusClube: "ativo",
    gastoAno: nivel.gastoAno,
    anoReferencia: ano,
    gastoDesde: dataini,
    ativadoEm: ativadoEmBr,
    proximoNivel: nivel.proximoNivel,
    faltaParaProximo: nivel.faltaParaProximo,
    progressoPct: nivel.progressoPct,
  };

  cacheGasto.set(key, { at: Date.now(), payload });
  return payload;
}

export function nivelFidelidadeFallback(usuario = null) {
  const ativacao = resolverDataAtivacaoClube(usuario);
  const { ano, dataini, ativadoEm: ativadoEmBr } = periodoGastoNivel(ativacao);
  const nivel = resolverNivelPorGasto(0);
  return {
    nivel: nivel.nome,
    nivelId: nivel.id,
    nivelDescricao: nivel.descricao,
    statusClube: "ativo",
    gastoAno: 0,
    anoReferencia: ano,
    gastoDesde: dataini,
    ativadoEm: ativadoEmBr,
    proximoNivel: nivel.proximoNivel,
    faltaParaProximo: nivel.faltaParaProximo,
    progressoPct: nivel.progressoPct,
  };
}
