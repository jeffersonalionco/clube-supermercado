import { getPool } from "../db.js";
import { agruparComprasPorCpfWrpdv } from "./wrpdvVendasService.js";
import {
  NIVEIS_FIDELIDADE,
  periodoGastoNivel,
  resolverDataAtivacaoClube,
  resolverNivelPorGasto,
} from "./nivelFidelidadeService.js";
import { emailValido } from "../utils/validacaoCadastro.js";
import { mapaDataMinimaCadastro } from "../utils/vendasPlataforma.js";

const PROXIMO_UPGRADE_REAIS = 400;

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

function montarInsights({ niveis, proximosUpgrade, totalMembros, vipShare }) {
  const tips = [];
  const bronze = niveis.find((n) => n.id === "bronze");
  const diamante = niveis.find((n) => n.id === "diamante");

  if (bronze && totalMembros > 0 && bronze.percentual >= 50) {
    tips.push({
      tipo: "editorial",
      texto: `${bronze.percentual}% dos membros ainda são Bronze — conteúdo de “como subir de nível” e benefícios Prata/Ouro tende a engajar.`,
    });
  }
  if (proximosUpgrade.length > 0) {
    tips.push({
      tipo: "marketing",
      texto: `${proximosUpgrade.length} membro(s) estão a menos de R$ ${PROXIMO_UPGRADE_REAIS} do próximo nível — campanha curta de “falta pouco” com oferta da semana.`,
    });
  }
  if (diamante && diamante.quantidade > 0) {
    tips.push({
      tipo: "marketing",
      texto: `${diamante.quantidade} VIP (Diamante)${vipShare ? ` · ${vipShare}% da base` : ""} — priorize reconhecimento, prévia de ofertas e convite a indicar amigos.`,
    });
  }
  const ouro = niveis.find((n) => n.id === "ouro");
  if (ouro && ouro.quantidade > 0) {
    tips.push({
      tipo: "editorial",
      texto: `Base Ouro (${ouro.quantidade}): bons candidatos a stories/depoimentos de “cliente fiel” e conteúdo exclusivo de categoria.`,
    });
  }
  if (!tips.length) {
    tips.push({
      tipo: "editorial",
      texto: "Ainda poucos dados no ano — acompanhe a distribuição mensalmente para calibrar comunicação por nível.",
    });
  }
  return tips;
}

/**
 * Painel "Níveis e fidelidade" — distribuição Bronze→Diamante + listas para campanha.
 */
export async function obterRelatorioNiveisFidelidade({ ano } = {}) {
  const agora = new Date();
  const anoRef = Number(ano) || agora.getFullYear();
  const referencia =
    anoRef === agora.getFullYear()
      ? agora
      : new Date(anoRef, 11, 31, 12, 0, 0, 0);

  const periodoBase = periodoGastoNivel(null, referencia);
  const dataini = periodoBase.dataini;
  const datafim = periodoBase.datafim;

  const { rows: membros } = await getPool().query(
    `SELECT id, cpf, nome, dados_api, criado_em, aceite_regulamento_em
     FROM usuario
     ORDER BY COALESCE(NULLIF(trim(nome), ''), cpf) ASC`
  );

  const dataMinimaPorCpf = mapaDataMinimaCadastro(membros);
  const comprasMap = await agruparComprasPorCpfWrpdv(dataini, datafim, {
    dataMinimaPorCpf,
  });

  const porNivel = Object.fromEntries(
    NIVEIS_FIDELIDADE.map((n) => [
      n.id,
      {
        id: n.id,
        nome: n.nome,
        descricao: n.descricao,
        minInclusive: n.minInclusive,
        limiarProximo: n.limiarProximo,
        quantidade: 0,
        faturamento: 0,
        membros: [],
        emails: [],
      },
    ])
  );

  const proximosUpgrade = [];
  let gastoTotalAno = 0;
  let membrosComGasto = 0;

  for (const m of membros) {
    const ativadoEm = resolverDataAtivacaoClube(m);
    const periodoMembro = periodoGastoNivel(ativadoEm, referencia);
    let gasto = 0;

    if (!periodoMembro.periodoVazio) {
      // Cupons já filtrados por criado_em (cadastro na plataforma).
      gasto = Number(comprasMap.get(m.cpf)?.totalGasto) || 0;
    }

    const nivel = resolverNivelPorGasto(gasto);
    const email = extrairEmailDadosApi(m.dados_api);
    const item = {
      id: m.id,
      cpf: m.cpf,
      nome: m.nome || "Sem nome",
      email,
      gastoAno: nivel.gastoAno,
      nivelId: nivel.id,
      nivelNome: nivel.nome,
      faltaParaProximo: nivel.faltaParaProximo,
      progressoPct: nivel.progressoPct,
      proximoNivel: nivel.proximoNivel,
      ativadoEm: ativadoEm ? ativadoEm.toISOString() : null,
      cadastradoEm: m.criado_em,
    };

    const bucket = porNivel[nivel.id];
    bucket.quantidade += 1;
    bucket.faturamento += gasto;
    bucket.membros.push(item);
    if (email) bucket.emails.push(email);

    gastoTotalAno += gasto;
    if (gasto > 0) membrosComGasto += 1;

    if (
      nivel.proximoNivel &&
      nivel.faltaParaProximo > 0 &&
      nivel.faltaParaProximo <= PROXIMO_UPGRADE_REAIS
    ) {
      proximosUpgrade.push(item);
    }
  }

  const totalMembros = membros.length;
  const niveis = NIVEIS_FIDELIDADE.map((meta) => {
    const b = porNivel[meta.id];
    b.faturamento = Math.round(b.faturamento * 100) / 100;
    b.percentual =
      totalMembros > 0
        ? Math.round((b.quantidade / totalMembros) * 1000) / 10
        : 0;
    b.gastoMedio =
      b.quantidade > 0
        ? Math.round((b.faturamento / b.quantidade) * 100) / 100
        : 0;
    b.emails = [...new Set(b.emails)];
    b.emailsDisponiveis = b.emails.length;
    b.membros.sort((a, c) => c.gastoAno - a.gastoAno);
    b.acaoMarketing =
      meta.id === "bronze"
        ? "Educar benefícios e 1ª meta de gasto."
        : meta.id === "prata"
          ? "Empurrar para Ouro com mix de categorias."
          : meta.id === "ouro"
            ? "Reconhecer fidelidade e antecipar ofertas."
            : "VIP: exclusividade, indicação e conteúdo premium.";
    return b;
  });

  proximosUpgrade.sort((a, b) => a.faltaParaProximo - b.faltaParaProximo);
  const emailsProximos = [
    ...new Set(proximosUpgrade.map((p) => p.email).filter(Boolean)),
  ];

  const diamante = niveis.find((n) => n.id === "diamante");
  const vipShare =
    totalMembros > 0 && diamante
      ? Math.round((diamante.quantidade / totalMembros) * 1000) / 10
      : 0;

  return {
    nome: "Níveis e fidelidade",
    slug: "niveis-fidelidade",
    geradoEm: new Date().toISOString(),
    anoReferencia: anoRef,
    periodo: {
      dataini,
      datafim,
      dataInicio: periodoBase.dataini.split("/").reverse().join("-"),
      dataFim: periodoBase.datafim.split("/").reverse().join("-"),
    },
    limiares: NIVEIS_FIDELIDADE.map((n) => ({
      id: n.id,
      nome: n.nome,
      minInclusive: n.minInclusive,
      limiarProximo: n.limiarProximo,
    })),
    kpis: {
      totalMembros,
      membrosComGasto,
      gastoTotalAno: Math.round(gastoTotalAno * 100) / 100,
      proximosDoUpgrade: proximosUpgrade.length,
      limiarProximoUpgradeReais: PROXIMO_UPGRADE_REAIS,
      vipShare,
    },
    niveis,
    proximosUpgrade: proximosUpgrade.slice(0, 200),
    emailsProximosUpgrade: emailsProximos,
    insights: montarInsights({
      niveis,
      proximosUpgrade,
      totalMembros,
      vipShare,
    }),
    notas: {
      gasto:
        "Gasto no ano corrente com CPF no PDV, somente a partir do cadastro na plataforma. Limiares: Bronze R$0 · Prata R$3 mil · Ouro R$8 mil · Diamante R$15 mil.",
      uso: "Use ‘Perto do upgrade’ e cada nível para campanhas de e-mail e pautas editoriais por persona.",
    },
  };
}
