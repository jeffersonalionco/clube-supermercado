import {
  formatarDataBR,
  parseDataBR,
  MAX_DIAS_PERIODO,
} from "./periodoVendas.js";

/** Início do dia em que o cliente se cadastrou na plataforma. */
export function inicioDiaCadastro(criadoEm) {
  const d = new Date(criadoEm);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Map<cpf, Date> com o início do dia de cadastro na plataforma.
 * Usado nos relatórios para ignorar cupons anteriores ao clube.
 */
export function mapaDataMinimaCadastro(membros) {
  const map = new Map();
  for (const m of membros || []) {
    const cpf = String(m?.cpf ?? "").trim();
    const raw = m?.criado_em ?? m?.criadoEm ?? null;
    if (!cpf || !raw) continue;
    const inicio = inicioDiaCadastro(raw);
    if (Number.isNaN(inicio.getTime())) continue;
    map.set(cpf, inicio);
  }
  return map;
}

/** True se a data/hora do cupom é no dia do cadastro ou depois. */
export function cupomNoOuAposCadastro(dataHora, criadoEmOuInicioDia) {
  if (!dataHora || !criadoEmOuInicioDia) return false;
  const venda = new Date(dataHora);
  if (Number.isNaN(venda.getTime())) return false;
  const inicio =
    criadoEmOuInicioDia instanceof Date &&
    criadoEmOuInicioDia.getHours?.() === 0 &&
    criadoEmOuInicioDia.getMinutes?.() === 0
      ? criadoEmOuInicioDia
      : inicioDiaCadastro(criadoEmOuInicioDia);
  return venda >= inicio;
}

export function dataInicioPlataformaBR(criadoEm) {
  return formatarDataBR(inicioDiaCadastro(criadoEm));
}

export function dataItemParaDate(item) {
  return parseDataBR(item?.data);
}

/** Início do dia em que o programa de pontos foi habilitado. */
export function inicioDiaHabilitacao(habilitadoEm) {
  if (!habilitadoEm) return null;
  const d = new Date(habilitadoEm);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Data efetiva para contagem de pontos: cadastro no clube e habilitação do programa. */
export function dataInicioPontos(criadoEm, habilitadoEm) {
  const inicioCadastro = inicioDiaCadastro(criadoEm);
  const inicioHabilitacao = inicioDiaHabilitacao(habilitadoEm);
  if (!inicioHabilitacao) return inicioCadastro;
  return inicioCadastro > inicioHabilitacao ? inicioCadastro : inicioHabilitacao;
}

export function dataInicioPontosBR(criadoEm, habilitadoEm) {
  return formatarDataBR(dataInicioPontos(criadoEm, habilitadoEm));
}

export function cupomElegivelPontos(item, criadoEm, habilitadoEm) {
  const dataVenda = dataItemParaDate(item);
  if (!dataVenda) return false;
  const inicio = dataInicioPontos(criadoEm, habilitadoEm);
  return dataVenda >= inicio;
}

export function cupomAposCadastro(item, criadoEm) {
  const dataVenda = dataItemParaDate(item);
  if (!dataVenda) return false;
  return dataVenda >= inicioDiaCadastro(criadoEm);
}

export function filtrarItensAposCadastro(itens, criadoEm) {
  const lista = Array.isArray(itens) ? itens : [];
  return lista.filter((item) => cupomAposCadastro(item, criadoEm));
}

export function ordenarItensPorDataAsc(itens) {
  return [...(Array.isArray(itens) ? itens : [])].sort((a, b) => {
    const da = dataItemParaDate(a);
    const db = dataItemParaDate(b);
    const ta = da ? da.getTime() : 0;
    const tb = db ? db.getTime() : 0;
    if (ta !== tb) return ta - tb;
    return String(a.numeroDcto ?? "").localeCompare(String(b.numeroDcto ?? ""));
  });
}

export function ajustarPeriodoAoCadastro(dataini, datafim, criadoEm) {
  const inicioCadastro = inicioDiaCadastro(criadoEm);
  const inicio = parseDataBR(dataini);
  const fim = parseDataBR(datafim);
  if (!inicio || !fim) {
    return { dataini, datafim };
  }

  const iniEfetivo = inicio < inicioCadastro ? inicioCadastro : inicio;
  const fimEfetivo = fim < iniEfetivo ? iniEfetivo : fim;

  return {
    dataini: formatarDataBR(iniEfetivo),
    datafim: formatarDataBR(fimEfetivo),
  };
}

/** Divide um intervalo em janelas de até maxDias (limite da API de vendas). */
export function gerarJanelasVendas(inicioDate, fimDate, maxDias = MAX_DIAS_PERIODO) {
  const janelas = [];
  let cursor = new Date(inicioDate);
  const fim = new Date(fimDate);

  while (cursor <= fim) {
    const janelaFim = new Date(cursor);
    janelaFim.setDate(janelaFim.getDate() + maxDias - 1);
    if (janelaFim > fim) {
      janelaFim.setTime(fim.getTime());
    }

    janelas.push({
      dataini: formatarDataBR(cursor),
      datafim: formatarDataBR(janelaFim),
    });

    cursor = new Date(janelaFim);
    cursor.setDate(cursor.getDate() + 1);
  }

  return janelas;
}
