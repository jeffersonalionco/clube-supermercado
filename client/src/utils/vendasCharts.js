import {
  formatarDataBR,
  parseDataBR,
  periodoMesAtual,
  periodoUltimosDias,
} from "./datas.js";

const MESES_CURTOS = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

function vendaAtiva(venda) {
  return venda && !venda.cancelada && !venda.convenio;
}

function labelDiaCurto(date) {
  return `${String(date.getDate()).padStart(2, "0")}/${MESES_CURTOS[date.getMonth()]}`;
}

/** Resumo agregado a partir de porData (espelha o backend para cupons ativos). */
export function calcularResumoDePorData(porData) {
  const vendas = (porData || []).flatMap((dia) => dia.vendas || []);
  const ativas = vendas.filter(vendaAtiva);
  const totalGasto = arredondar(ativas.reduce((acc, v) => acc + Number(v.total || 0), 0));
  const totalDescontos = arredondar(
    ativas.reduce((acc, v) => acc + Number(v.totalDesconto || 0), 0)
  );
  const totalItens = vendas.reduce(
    (acc, v) => acc + Number(v.quantidadeProdutos || 0),
    0
  );

  return {
    totalVendas: vendas.length,
    totalVendasAtivas: ativas.length,
    totalCanceladas: vendas.filter((v) => v.cancelada).length,
    totalConvenio: vendas.filter((v) => v.convenio).length,
    totalGasto,
    totalDescontos,
    totalItens,
    ticketMedio:
      ativas.length > 0 ? arredondar(totalGasto / ativas.length) : 0,
  };
}

function arredondar(valor) {
  return Math.round(Number(valor) * 100) / 100;
}

function filtrarPorDataEntre(porData, inicio, fim) {
  return (porData || []).filter((dia) => {
    const d = parseDataBR(dia.data);
    if (!d) return false;
    return d >= inicio && d <= fim;
  });
}

export function resumoMesAtualDePorData(porData) {
  const { dataini, datafim } = periodoMesAtual();
  const ini = parseDataBR(dataini);
  const fim = parseDataBR(datafim);
  if (!ini || !fim) return calcularResumoDePorData([]);
  return calcularResumoDePorData(filtrarPorDataEntre(porData, ini, fim));
}

/** Série diária dos últimos N dias (inclui dias zerados). */
export function montarSerieGastoDiario(porData, dias = 30) {
  const mapa = new Map();
  for (const dia of porData || []) {
    const d = parseDataBR(dia.data);
    if (!d) continue;
    const chave = formatarDataBR(d);
    const ativas = (dia.vendas || []).filter(vendaAtiva);
    mapa.set(chave, arredondar(ativas.reduce((acc, v) => acc + Number(v.total || 0), 0)));
  }

  const fim = new Date();
  fim.setHours(0, 0, 0, 0);
  const pontos = [];

  for (let i = dias - 1; i >= 0; i -= 1) {
    const d = new Date(fim);
    d.setDate(d.getDate() - i);
    const chave = formatarDataBR(d);
    pontos.push({
      data: chave,
      label: labelDiaCurto(d),
      valor: mapa.get(chave) ?? 0,
      destaque: i === 0,
    });
  }

  const maxValor = Math.max(...pontos.map((p) => p.valor), 0);
  const total = arredondar(pontos.reduce((acc, p) => acc + p.valor, 0));

  return { pontos, maxValor, total, dias };
}

/** Dados para rosca: pago vs economizado (últimos 30 dias). */
export function montarEconomia(porData, dias = 30) {
  const { dataini, datafim } = periodoUltimosDias(dias);
  const ini = parseDataBR(dataini);
  const fim = parseDataBR(datafim);
  const filtrado = filtrarPorDataEntre(porData, ini, fim);
  const resumo = calcularResumoDePorData(filtrado);

  const pago = resumo.totalGasto;
  const economia = resumo.totalDescontos;
  const bruto = arredondar(pago + economia);
  const total = Math.max(pago + economia, pago, 1);

  return {
    pago,
    economia,
    bruto,
    total,
    percentualEconomia: economia > 0 ? Math.round((economia / total) * 100) : 0,
    temDados: resumo.totalVendasAtivas > 0,
    periodoLabel: `Últimos ${dias} dias`,
  };
}

/** Comparativo mês atual vs mês anterior. */
export function montarComparativoMeses(porData) {
  const agora = new Date();
  const mesAtual = agora.getMonth();
  const anoAtual = agora.getFullYear();
  const mesAnterior = mesAtual === 0 ? 11 : mesAtual - 1;
  const anoAnterior = mesAtual === 0 ? anoAtual - 1 : anoAtual;

  const atual = { gasto: 0, cupons: 0, label: capitalizar(MESES_CURTOS[mesAtual]) };
  const anterior = {
    gasto: 0,
    cupons: 0,
    label: capitalizar(MESES_CURTOS[mesAnterior]),
  };

  for (const dia of porData || []) {
    const d = parseDataBR(dia.data);
    if (!d) continue;
    const ativas = (dia.vendas || []).filter(vendaAtiva);
    const gasto = arredondar(ativas.reduce((acc, v) => acc + Number(v.total || 0), 0));
    const cupons = ativas.length;

    if (d.getMonth() === mesAtual && d.getFullYear() === anoAtual) {
      atual.gasto = arredondar(atual.gasto + gasto);
      atual.cupons += cupons;
    } else if (d.getMonth() === mesAnterior && d.getFullYear() === anoAnterior) {
      anterior.gasto = arredondar(anterior.gasto + gasto);
      anterior.cupons += cupons;
    }
  }

  const maxGasto = Math.max(atual.gasto, anterior.gasto, 1);
  let variacao = null;
  if (anterior.gasto > 0) {
    variacao = Math.round(((atual.gasto - anterior.gasto) / anterior.gasto) * 100);
  } else if (atual.gasto > 0) {
    variacao = 100;
  }

  return {
    atual,
    anterior,
    maxGasto,
    variacao,
    temDados: atual.cupons > 0 || anterior.cupons > 0,
  };
}

function capitalizar(str) {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function periodoInsightsVendas() {
  return periodoUltimosDias(90);
}

export function filtrarPorDias(porData, dias) {
  const { dataini, datafim } = periodoUltimosDias(dias);
  const ini = parseDataBR(dataini);
  const fim = parseDataBR(datafim);
  if (!ini || !fim) return [];
  return filtrarPorDataEntre(porData, ini, fim);
}

export function periodoDoMes(mes, ano) {
  const ini = new Date(ano, mes, 1);
  const fim = new Date(ano, mes + 1, 0);
  return { dataini: formatarDataBR(ini), datafim: formatarDataBR(fim) };
}

/** Mensagem dinâmica para o hero dos gráficos. */
export function montarMensagemContextual(porData, dias = 30) {
  const filtrado = filtrarPorDias(porData, dias);
  const resumo = calcularResumoDePorData(filtrado);

  if (resumo.totalVendasAtivas === 0) {
    return {
      tom: "neutro",
      icone: "cart",
      texto: "Faça compras com seu CPF no caixa para ver seus números aqui.",
    };
  }

  if (resumo.totalDescontos > 0) {
    return {
      tom: "ouro",
      icone: "economia",
      texto: `Você economizou ${formatarMoedaCurta(resumo.totalDescontos)} em descontos nos últimos ${dias} dias.`,
      destaque: formatarMoedaCurta(resumo.totalDescontos),
    };
  }

  let ultimaData = null;
  for (const dia of filtrado) {
    const d = parseDataBR(dia.data);
    if (!d) continue;
    if ((dia.vendas || []).some(vendaAtiva)) {
      if (!ultimaData || d > ultimaData) ultimaData = d;
    }
  }

  if (ultimaData) {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const diff = Math.round((hoje - ultimaData) / (1000 * 60 * 60 * 24));
    if (diff === 0) {
      return {
        tom: "verde",
        icone: "hoje",
        texto: "Você comprou hoje — obrigado por fazer parte do clube!",
      };
    }
    if (diff <= 7) {
      return {
        tom: "verde",
        icone: "recente",
        texto: `Sua última compra foi há ${diff} ${diff === 1 ? "dia" : "dias"}.`,
      };
    }
  }

  return {
    tom: "verde",
    icone: "resumo",
    texto: `${resumo.totalVendasAtivas} ${resumo.totalVendasAtivas === 1 ? "cupom" : "cupons"} nos últimos ${dias} dias · média ${formatarMoedaCurta(resumo.ticketMedio)} por compra.`,
  };
}

function formatarMoedaCurta(valor) {
  return Number(valor).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}
