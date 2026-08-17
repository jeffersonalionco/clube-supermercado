import { getPool } from "../db.js";
import {
  agruparComprasPorCpfWrpdv,
  topProdutosPorCpfsWrpdv,
} from "./wrpdvVendasService.js";
import {
  formatarDataBR,
  parseDataBR,
  validarPeriodoVendas,
} from "../utils/periodoVendas.js";
import { emailValido } from "../utils/validacaoCadastro.js";
import { mapaDataMinimaCadastro } from "../utils/vendasPlataforma.js";

const DIAS_ATIVO = 30;
const DIAS_INATIVO = 60;
const DIAS_LOOKBACK_INATIVO = 180;
const TOP_PRODUTOS = 10;

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
  const dias = Math.min(365, Math.max(1, Number(n) || 30));
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
  return periodoUltimosDias(dias || 30);
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

function diasSemCompra(ultimaCompra, agora = Date.now()) {
  if (!ultimaCompra) return null;
  return Math.floor(
    (agora - new Date(ultimaCompra).getTime()) / (24 * 60 * 60 * 1000)
  );
}

/**
 * Painel "Radar de Compras" — métricas enxutas de relacionamento via compras.
 */
export async function obterRadarCompras({
  dataInicio = "",
  dataFim = "",
  dias = 30,
} = {}) {
  const periodo = resolverPeriodo({ dataInicio, dataFim, dias });
  const periodoAtivos = periodoUltimosDias(DIAS_ATIVO);
  const periodoInativos = periodoUltimosDias(DIAS_LOOKBACK_INATIVO);
  const agora = Date.now();

  const { rows: membros } = await getPool().query(
    `SELECT id, cpf, nome, dados_api, criado_em
     FROM usuario
     ORDER BY COALESCE(NULLIF(trim(nome), ''), cpf) ASC`
  );

  const cpfs = membros.map((m) => m.cpf);
  const setMembros = new Set(cpfs);
  const dataMinimaPorCpf = mapaDataMinimaCadastro(membros);
  const optsClube = { dataMinimaPorCpf };

  const [comprasPeriodo, comprasAtivos, comprasLookback] = await Promise.all([
    agruparComprasPorCpfWrpdv(periodo.dataini, periodo.datafim, optsClube),
    agruparComprasPorCpfWrpdv(
      periodoAtivos.dataini,
      periodoAtivos.datafim,
      optsClube
    ),
    agruparComprasPorCpfWrpdv(
      periodoInativos.dataini,
      periodoInativos.datafim,
      optsClube
    ),
  ]);

  let faturamento = 0;
  let quantidadeCupons = 0;
  let membrosComCompraPeriodo = 0;

  for (const cpf of setMembros) {
    const v = comprasPeriodo.get(cpf);
    if (!v?.quantidadeCupons) continue;
    membrosComCompraPeriodo += 1;
    faturamento += Number(v.totalGasto) || 0;
    quantidadeCupons += Number(v.quantidadeCupons) || 0;
  }

  faturamento = Math.round(faturamento * 100) / 100;
  const ticketMedio =
    quantidadeCupons > 0
      ? Math.round((faturamento / quantidadeCupons) * 100) / 100
      : 0;

  let membrosAtivos30d = 0;
  for (const cpf of setMembros) {
    const v = comprasAtivos.get(cpf);
    if (v?.quantidadeCupons) membrosAtivos30d += 1;
  }

  const topProdutos = await topProdutosPorCpfsWrpdv(
    cpfs,
    periodo.dataini,
    periodo.datafim,
    { limite: TOP_PRODUTOS, dataMinimaPorCpf }
  );

  const inativos = [];
  for (const m of membros) {
    const v = comprasLookback.get(m.cpf);
    const ultima = v?.ultimaCompra ?? null;
    const dias = diasSemCompra(ultima, agora);
    const semCompraRecente =
      !ultima || (dias != null && dias >= DIAS_INATIVO);
    if (!semCompraRecente) continue;

    inativos.push({
      id: m.id,
      cpf: m.cpf,
      nome: m.nome || "Sem nome",
      email: extrairEmailDadosApi(m.dados_api),
      ultimaCompra: ultima,
      diasSemCompra: dias,
      cadastradoEm: m.criado_em,
    });
  }

  inativos.sort((a, b) => {
    const da = a.diasSemCompra == null ? 99999 : a.diasSemCompra;
    const db = b.diasSemCompra == null ? 99999 : b.diasSemCompra;
    return db - da;
  });

  const emailsInativos = [
    ...new Set(inativos.map((i) => i.email).filter(Boolean)),
  ];

  return {
    nome: "Radar de Compras",
    slug: "radar-compras",
    geradoEm: new Date().toISOString(),
    periodo: {
      dataInicio: brParaIso(periodo.dataini),
      dataFim: brParaIso(periodo.datafim),
      dataini: periodo.dataini,
      datafim: periodo.datafim,
      dias: periodo.dias,
    },
    kpis: {
      faturamentoMembros: faturamento,
      ticketMedio,
      quantidadeCupons,
      membrosComCompraPeriodo,
      membrosAtivos30d,
      membrosAtivosJanelaDias: DIAS_ATIVO,
      inativos60d: inativos.length,
      inativosJanelaDias: DIAS_INATIVO,
      totalMembros: membros.length,
    },
    topProdutos,
    inativos,
    emailsInativos,
    notas: {
      faturamento:
        "Soma das compras no caixa com CPF de membros, somente a partir da data de cadastro na plataforma.",
      ativos: `Membros com pelo menos 1 compra (após o cadastro) nos últimos ${DIAS_ATIVO} dias (janela fixa).`,
      inativos: `Membros sem compra há ${DIAS_INATIVO}+ dias após o cadastro (ou sem compra no clube). Lista útil para campanha de e-mail.`,
    },
  };
}
