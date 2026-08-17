import { getPool } from "../db.js";
import { agruparComprasPorCpfWrpdv } from "./wrpdvVendasService.js";
import {
  formatarDataBR,
  parseDataBR,
  validarPeriodoVendas,
} from "../utils/periodoVendas.js";
import { emailValido } from "../utils/validacaoCadastro.js";
import { mapaDataMinimaCadastro } from "../utils/vendasPlataforma.js";

/** Metadados dos segmentos (ordem de exibição no painel). */
export const SEGMENTOS_RFM = [
  {
    id: "champions",
    titulo: "Champions",
    descricao: "Compram recente, com frequência e alto valor.",
    acao: "Recompensar e pedir indicação.",
  },
  {
    id: "fieis",
    titulo: "Fiéis",
    descricao: "Frequentes e bons de gasto, com boa recência.",
    acao: "Nutrir com benefícios e upsells.",
  },
  {
    id: "nao_perder",
    titulo: "Não perder",
    descricao: "Eram excelentes (freq. + valor), mas sumiram.",
    acao: "Reativação urgente e personalizada.",
  },
  {
    id: "em_risco",
    titulo: "Em risco",
    descricao: "Já compravam bem e estão esfriando.",
    acao: "Campanha de retorno com oferta.",
  },
  {
    id: "atencao",
    titulo: "Atenção",
    descricao: "Médios em R/F/M — podem subir ou cair.",
    acao: "Engajar com conteúdo e ofertas leves.",
  },
  {
    id: "potenciais",
    titulo: "Potenciais fiéis",
    descricao: "Recentes, frequência média — caminho para fiéis.",
    acao: "Incentivar segunda/terceira compra.",
  },
  {
    id: "novos",
    titulo: "Novos / recentes",
    descricao: "Compra recente, ainda baixa frequência.",
    acao: "Onboarding e boas-vindas.",
  },
  {
    id: "promissores",
    titulo: "Promissores",
    descricao: "Recentes, ainda com pouco volume.",
    acao: "Ofertas de descoberta da loja.",
  },
  {
    id: "adormecendo",
    titulo: "Adormecendo",
    descricao: "Recência e frequência abaixo da média.",
    acao: "Lembrete suave antes de hibernar.",
  },
  {
    id: "hibernando",
    titulo: "Hibernando",
    descricao: "Baixa recência; já tiveram alguma atividade.",
    acao: "Win-back com motivo forte.",
  },
  {
    id: "perdidos",
    titulo: "Perdidos",
    descricao: "Baixos em recência, frequência e valor.",
    acao: "Última tentativa ou pausar investimento.",
  },
  {
    id: "outros",
    titulo: "Outros",
    descricao: "Perfis que não se encaixaram nos grupos principais.",
    acao: "Revisar caso a caso.",
  },
  {
    id: "sem_compra",
    titulo: "Sem compra no período",
    descricao: "Membros sem cupom com CPF no período analisado.",
    acao: "Primeira compra / ativação.",
  },
];

const META_POR_ID = Object.fromEntries(SEGMENTOS_RFM.map((s) => [s.id, s]));

function isoParaBr(valor) {
  const s = String(valor || "").trim();
  const match = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function brParaIso(dataBr) {
  const d = parseDataBR(dataBr);
  if (!d) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function periodoUltimosDias(n) {
  const dias = Math.min(365, Math.max(1, Number(n) || 90));
  const fim = new Date();
  fim.setHours(12, 0, 0, 0);
  const inicio = new Date(fim);
  inicio.setDate(inicio.getDate() - (dias - 1));
  return {
    dataini: formatarDataBR(inicio),
    datafim: formatarDataBR(fim),
    dias,
  };
}

function resolverPeriodo({ dataInicio, dataFim, dias }) {
  if (dataInicio || dataFim) {
    const iniBr = isoParaBr(dataInicio) || String(dataInicio || "").trim();
    const fimBr = isoParaBr(dataFim) || String(dataFim || "").trim();
    const validado = validarPeriodoVendas(iniBr, fimBr);
    if (!validado.ok) {
      throw new Error(validado.error);
    }
    return {
      dataini: validado.dataini,
      datafim: validado.datafim,
      dias: validado.dias,
    };
  }
  return periodoUltimosDias(dias || 90);
}

function extrairEmailDadosApi(dadosApi) {
  const fontes = [
    dadosApi,
    dadosApi?.cliente,
    dadosApi?.response?.cliente,
    dadosApi?.dadosResidenciais,
    dadosApi?.dadosComerciais,
  ].filter(Boolean);
  for (const fonte of fontes) {
    if (typeof fonte !== "object") continue;
    const email = fonte.email ?? fonte.eMail ?? fonte.mail;
    if (email && String(email).includes("@")) {
      const e = String(email).trim().toLowerCase();
      if (emailValido(e)) return e;
    }
  }
  return null;
}

function diasDesde(ultimaCompra, agora = Date.now()) {
  if (!ultimaCompra) return null;
  return Math.max(
    0,
    Math.floor(
      (agora - new Date(ultimaCompra).getTime()) / (24 * 60 * 60 * 1000)
    )
  );
}

/**
 * Quintis 1–5. Para recência, valores menores (mais recente) = nota maior.
 */
function pontuarQuintil(valores, valor, { inverter = false } = {}) {
  if (!valores.length) return 1;
  const sorted = [...valores].sort((a, b) => a - b);
  const n = sorted.length;
  let rank = 0;
  for (let i = 0; i < n; i++) {
    if (sorted[i] <= valor) rank = i + 1;
  }
  const pct = rank / n;
  let score = 1;
  if (pct <= 0.2) score = 1;
  else if (pct <= 0.4) score = 2;
  else if (pct <= 0.6) score = 3;
  else if (pct <= 0.8) score = 4;
  else score = 5;
  return inverter ? 6 - score : score;
}

function classificarSegmento(r, f, m) {
  if (r >= 4 && f >= 4 && m >= 4) return "champions";
  if (r >= 3 && f >= 4 && m >= 3) return "fieis";
  if (r <= 2 && f >= 4 && m >= 4) return "nao_perder";
  if (r <= 2 && (f >= 3 || m >= 3) && f + m >= 5) return "em_risco";
  if (r >= 3 && f >= 3 && m >= 3) return "atencao";
  if (r >= 4 && f >= 2 && f <= 3) return "potenciais";
  if (r >= 4 && f === 1) return "novos";
  if (r >= 3 && f <= 2 && m <= 2) return "promissores";
  if (r === 2 && f <= 2) return "adormecendo";
  if (r === 1 && f >= 2) return "hibernando";
  if (r <= 2 && f <= 2 && m <= 2) return "perdidos";
  return "outros";
}

/**
 * Segmentação RFM dos membros do clube com base nas compras no PDV.
 */
export async function obterSegmentacaoRfm({
  dataInicio = "",
  dataFim = "",
  dias = 90,
} = {}) {
  const periodo = resolverPeriodo({ dataInicio, dataFim, dias });
  const agora = Date.now();

  const { rows: membros } = await getPool().query(
    `SELECT id, cpf, nome, dados_api, criado_em
     FROM usuario
     ORDER BY COALESCE(NULLIF(trim(nome), ''), cpf) ASC`
  );

  const comprasMap = await agruparComprasPorCpfWrpdv(
    periodo.dataini,
    periodo.datafim,
    { dataMinimaPorCpf: mapaDataMinimaCadastro(membros) }
  );

  const comCompra = [];
  for (const m of membros) {
    const v = comprasMap.get(m.cpf);
    if (!v?.quantidadeCupons) continue;
    const recenciaDias = diasDesde(v.ultimaCompra, agora);
    comCompra.push({
      membro: m,
      recenciaDias: recenciaDias ?? 9999,
      frequencia: Number(v.quantidadeCupons) || 0,
      monetario: Number(v.totalGasto) || 0,
      ultimaCompra: v.ultimaCompra ?? null,
    });
  }

  const valsR = comCompra.map((c) => c.recenciaDias);
  const valsF = comCompra.map((c) => c.frequencia);
  const valsM = comCompra.map((c) => c.monetario);

  const membrosRfm = [];
  for (const item of comCompra) {
    const r = pontuarQuintil(valsR, item.recenciaDias, { inverter: true });
    const f = pontuarQuintil(valsF, item.frequencia);
    const mScore = pontuarQuintil(valsM, item.monetario);
    const segmentoId = classificarSegmento(r, f, mScore);
    const email = extrairEmailDadosApi(item.membro.dados_api);
    membrosRfm.push({
      id: item.membro.id,
      cpf: item.membro.cpf,
      nome: item.membro.nome || "Sem nome",
      email,
      segmentoId,
      r,
      f,
      m: mScore,
      rfm: `${r}${f}${mScore}`,
      recenciaDias: item.recenciaDias,
      frequencia: item.frequencia,
      monetario: item.monetario,
      ultimaCompra: item.ultimaCompra,
      cadastradoEm: item.membro.criado_em,
    });
  }

  for (const m of membros) {
    if (comprasMap.get(m.cpf)?.quantidadeCupons) continue;
    membrosRfm.push({
      id: m.id,
      cpf: m.cpf,
      nome: m.nome || "Sem nome",
      email: extrairEmailDadosApi(m.dados_api),
      segmentoId: "sem_compra",
      r: null,
      f: null,
      m: null,
      rfm: null,
      recenciaDias: null,
      frequencia: 0,
      monetario: 0,
      ultimaCompra: null,
      cadastradoEm: m.criado_em,
    });
  }

  membrosRfm.sort((a, b) => {
    if (a.segmentoId !== b.segmentoId) {
      const ia = SEGMENTOS_RFM.findIndex((s) => s.id === a.segmentoId);
      const ib = SEGMENTOS_RFM.findIndex((s) => s.id === b.segmentoId);
      return ia - ib;
    }
    return (b.monetario || 0) - (a.monetario || 0);
  });

  const segmentos = SEGMENTOS_RFM.map((meta) => {
    const lista = membrosRfm.filter((x) => x.segmentoId === meta.id);
    const emails = [
      ...new Set(lista.map((x) => x.email).filter(Boolean)),
    ];
    const faturamento = Math.round(
      lista.reduce((acc, x) => acc + (Number(x.monetario) || 0), 0) * 100
    ) / 100;
    return {
      ...meta,
      quantidade: lista.length,
      percentualMembros:
        membros.length > 0
          ? Math.round((lista.length / membros.length) * 1000) / 10
          : 0,
      faturamento,
      emailsDisponiveis: emails.length,
      emails,
    };
  }).filter((s) => s.quantidade > 0 || s.id === "sem_compra");

  const comScore = membrosRfm.filter((x) => x.r != null);
  const media = (arr, key) =>
    arr.length
      ? Math.round(
          (arr.reduce((a, x) => a + (Number(x[key]) || 0), 0) / arr.length) * 10
        ) / 10
      : 0;

  return {
    nome: "Segmentação RFM",
    slug: "segmentacao-rfm",
    geradoEm: new Date().toISOString(),
    periodo: {
      dataInicio: brParaIso(periodo.dataini),
      dataFim: brParaIso(periodo.datafim),
      dataini: periodo.dataini,
      datafim: periodo.datafim,
      dias: periodo.dias,
    },
    kpis: {
      totalMembros: membros.length,
      membrosComCompra: comScore.length,
      membrosSemCompra: membros.length - comScore.length,
      faturamentoPeriodo:
        Math.round(
          comScore.reduce((a, x) => a + (Number(x.monetario) || 0), 0) * 100
        ) / 100,
      mediaR: media(comScore, "r"),
      mediaF: media(comScore, "f"),
      mediaM: media(comScore, "m"),
    },
    segmentos,
    membros: membrosRfm,
    catalogoSegmentos: SEGMENTOS_RFM.map((s) => ({
      id: s.id,
      titulo: s.titulo,
      descricao: s.descricao,
      acao: s.acao,
    })),
    notas: {
      metodo:
        "R, F e M em notas de 1 a 5 por quintis entre membros com compra no período (somente cupons a partir do cadastro na plataforma). Recência alta = comprou há menos dias.",
      uso: "Use cada segmento para campanhas de e-mail (Marketing) — copie os e-mails do grupo selecionado.",
    },
  };
}

export function metaSegmentoRfm(id) {
  return META_POR_ID[id] || null;
}
