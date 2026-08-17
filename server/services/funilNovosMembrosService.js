import { getPool } from "../db.js";
import { agruparComprasPorCpfWrpdv } from "./wrpdvVendasService.js";
import {
  formatarDataBR,
  parseDataBR,
  validarPeriodoVendas,
} from "../utils/periodoVendas.js";
import { emailValido } from "../utils/validacaoCadastro.js";
import { mapaDataMinimaCadastro } from "../utils/vendasPlataforma.js";

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
    if (!validado.ok) throw new Error(validado.error);
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

function diasEntre(a, b) {
  if (!a || !b) return null;
  const da = new Date(a);
  const db = new Date(b);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return null;
  return Math.max(
    0,
    Math.floor((db.getTime() - da.getTime()) / (24 * 60 * 60 * 1000))
  );
}

function faixaAteCompra(dias) {
  if (dias == null) return "sem_compra";
  if (dias <= 7) return "0-7d";
  if (dias <= 30) return "8-30d";
  if (dias <= 90) return "31-90d";
  return "90d+";
}

function montarInsights(funil) {
  const tips = [];
  if (funil.cadastrados === 0) {
    tips.push({
      tipo: "editorial",
      texto: "Nenhum cadastro no período — revisar CTA de cadastro na loja e nos canais digitais.",
    });
    return tips;
  }

  tips.push({
    tipo: "marketing",
    texto: `Conversão cadastro→1ª compra: ${funil.conversao1aPct}%. ${
      funil.conversao1aPct < 40
        ? "Baixa — vale e-mail de boas-vindas + oferta de 1ª visita em até 7 dias."
        : funil.conversao1aPct < 70
          ? "Moderada — reforçar onboarding e lembrete no dia 3–7."
          : "Boa — foque em 2ª compra e conteúdo de hábito."
    }`,
  });

  if (funil.semCompra > 0) {
    tips.push({
      tipo: "marketing",
      texto: `${funil.semCompra} cadastrado(s) sem compra — lista pronta para campanha de ativação.`,
    });
  }

  if (funil.apenasUmaCompra > 0) {
    tips.push({
      tipo: "editorial",
      texto: `${funil.apenasUmaCompra} fez só 1 compra — pauta de “volte esta semana” / receitas / combo da casa para gerar 2ª visita.`,
    });
  }

  if (funil.comSegundaCompra > 0) {
    tips.push({
      tipo: "editorial",
      texto: `${funil.comSegundaCompra} já repetiu compra (${funil.conversao2aPct}% dos que compraram) — bons leads para conteúdo de fidelidade e níveis.`,
    });
  }

  if (funil.tempoMedioAte1aCompraDias != null) {
    tips.push({
      tipo: "marketing",
      texto: `Tempo médio até a 1ª compra: ${funil.tempoMedioAte1aCompraDias} dia(s) — alinhe sequência de e-mails a essa janela.`,
    });
  }

  return tips;
}

async function comprasAposCadastro(cpf, agg) {
  const v = agg?.get(cpf);
  if (!v?.quantidadeCupons) {
    return { primeira: null, cupons: 0, gasto: 0 };
  }
  return {
    primeira: v.primeiraCompra,
    cupons: Number(v.quantidadeCupons) || 0,
    gasto: Number(v.totalGasto) || 0,
  };
}

/**
 * Funil cadastro → 1ª compra → 2ª compra — útil para marketing e editorial.
 */
export async function obterFunilNovosMembros({
  dataInicio = "",
  dataFim = "",
  dias = 30,
} = {}) {
  const periodo = resolverPeriodo({ dataInicio, dataFim, dias });
  const inicioIso = brParaIso(periodo.dataini);
  const fimIso = brParaIso(periodo.datafim);

  const params = [];
  const condicoes = [];
  if (inicioIso) {
    params.push(inicioIso);
    condicoes.push(
      `criado_em >= ($${params.length}::date AT TIME ZONE 'America/Sao_Paulo')`
    );
  }
  if (fimIso) {
    params.push(fimIso);
    condicoes.push(
      `criado_em < (($${params.length}::date + INTERVAL '1 day') AT TIME ZONE 'America/Sao_Paulo')`
    );
  }
  const where = condicoes.length ? `WHERE ${condicoes.join(" AND ")}` : "";

  const { rows: novos } = await getPool().query(
    `SELECT id, cpf, nome, dados_api, criado_em
     FROM usuario
     ${where}
     ORDER BY criado_em ASC, nome ASC`,
    params
  );

  const hoje = new Date();
  hoje.setHours(12, 0, 0, 0);
  const lookbackIni = periodo.dataini;
  const lookbackFim = formatarDataBR(hoje);
  const dataMinimaPorCpf = mapaDataMinimaCadastro(novos);
  const comprasMap =
    novos.length > 0
      ? await agruparComprasPorCpfWrpdv(lookbackIni, lookbackFim, {
          dataMinimaPorCpf,
        })
      : new Map();

  const membros = [];
  const faixasCount = {
    "0-7d": 0,
    "8-30d": 0,
    "31-90d": 0,
    "90d+": 0,
    sem_compra: 0,
  };

  let comPrimeira = 0;
  let apenasUma = 0;
  let comSegunda = 0;
  let somaDias1a = 0;
  let nDias1a = 0;

  for (const m of novos) {
    const email = extrairEmailDadosApi(m.dados_api);
    const pos = await comprasAposCadastro(m.cpf, comprasMap);

    const diasAte = diasEntre(m.criado_em, pos.primeira);
    const faixa = !pos.primeira
      ? "sem_compra"
      : diasAte == null
        ? "8-30d"
        : faixaAteCompra(diasAte);
    faixasCount[faixa] += 1;

    let estagio = "sem_compra";
    if (pos.cupons >= 2) {
      estagio = "segunda_compra";
      comPrimeira += 1;
      comSegunda += 1;
    } else if (pos.cupons === 1) {
      estagio = "primeira_compra";
      comPrimeira += 1;
      apenasUma += 1;
    }

    if (diasAte != null) {
      somaDias1a += diasAte;
      nDias1a += 1;
    }

    membros.push({
      id: m.id,
      cpf: m.cpf,
      nome: m.nome || "Sem nome",
      email,
      cadastradoEm: m.criado_em,
      primeiraCompra: pos.primeira,
      diasAtePrimeiraCompra: diasAte,
      faixa,
      quantidadeCupons: pos.cupons,
      gastoDesdeCadastro: Math.round((pos.gasto || 0) * 100) / 100,
      estagio,
    });
  }

  const cadastrados = novos.length;
  const semCompra = cadastrados - comPrimeira;
  const conversao1aPct =
    cadastrados > 0
      ? Math.round((comPrimeira / cadastrados) * 1000) / 10
      : 0;
  const conversao2aPct =
    comPrimeira > 0
      ? Math.round((comSegunda / comPrimeira) * 1000) / 10
      : 0;

  const funil = {
    cadastrados,
    comPrimeiraCompra: comPrimeira,
    semCompra,
    apenasUmaCompra: apenasUma,
    comSegundaCompra: comSegunda,
    conversao1aPct,
    conversao2aPct,
    tempoMedioAte1aCompraDias:
      nDias1a > 0 ? Math.round((somaDias1a / nDias1a) * 10) / 10 : null,
    porFaixa: [
      { faixa: "0-7d", label: "Até 7 dias", quantidade: faixasCount["0-7d"] },
      { faixa: "8-30d", label: "8 a 30 dias", quantidade: faixasCount["8-30d"] },
      {
        faixa: "31-90d",
        label: "31 a 90 dias",
        quantidade: faixasCount["31-90d"],
      },
      { faixa: "90d+", label: "Mais de 90 dias", quantidade: faixasCount["90d+"] },
      {
        faixa: "sem_compra",
        label: "Sem compra",
        quantidade: faixasCount.sem_compra,
      },
    ],
  };

  const emailsSemCompra = [
    ...new Set(
      membros
        .filter((x) => x.estagio === "sem_compra")
        .map((x) => x.email)
        .filter(Boolean)
    ),
  ];
  const emailsUmaCompra = [
    ...new Set(
      membros
        .filter((x) => x.estagio === "primeira_compra")
        .map((x) => x.email)
        .filter(Boolean)
    ),
  ];
  const emailsEngajados = [
    ...new Set(
      membros
        .filter((x) => x.estagio === "segunda_compra")
        .map((x) => x.email)
        .filter(Boolean)
    ),
  ];

  return {
    nome: "Funil de novos membros",
    slug: "funil-novos-membros",
    geradoEm: new Date().toISOString(),
    periodo: {
      dataInicio: inicioIso,
      dataFim: fimIso,
      dataini: periodo.dataini,
      datafim: periodo.datafim,
      dias: periodo.dias,
      lookbackComprasAte: lookbackFim,
    },
    kpis: {
      cadastrados,
      comPrimeiraCompra: comPrimeira,
      semCompra,
      apenasUmaCompra: apenasUma,
      comSegundaCompra: comSegunda,
      conversao1aPct,
      conversao2aPct,
      tempoMedioAte1aCompraDias: funil.tempoMedioAte1aCompraDias,
    },
    funil,
    membros,
    emailsSemCompra,
    emailsUmaCompra,
    emailsEngajados,
    insights: montarInsights(funil),
    notas: {
      metodo:
        "Cadastros pelo criado_em no período. 1ª/2ª compra = cupons com CPF no PDV após o cadastro (até hoje).",
      uso: "Copie e-mails de ‘sem compra’ (ativação) ou ‘só 1 compra’ (2ª visita) para Marketing.",
    },
  };
}
