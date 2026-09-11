import { getWrpdvPool } from "../db/wrpdv.js";
import { getPool } from "../db.js";
import { parseDataBR, formatarDataBR } from "../utils/periodoVendas.js";
import {
  mapaDataMinimaCadastro,
  cupomNoOuAposCadastro,
} from "../utils/vendasPlataforma.js";
import { parseFinn, isFormaConvenio } from "./wrpdvParser.js";
import { buscarClientePorCpfCnpj, normalizarCpfCnpj } from "./apiClient.js";
import { buscarVendasClienteWrpdv, valorCupomConfiavel, cupomAposDataMinima } from "./wrpdvVendasService.js";

function nomeTabelaVenda(date) {
  const mes = String(date.getMonth() + 1).padStart(2, "0");
  const ano = String(date.getFullYear()).slice(-2);
  return `tab_venda_${mes}${ano}`;
}

function mesesNoPeriodo(inicio, fim) {
  const tabelas = [];
  const cursor = new Date(inicio.getFullYear(), inicio.getMonth(), 1);
  const limite = new Date(fim.getFullYear(), fim.getMonth(), 1);
  while (cursor <= limite) {
    tabelas.push(nomeTabelaVenda(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return [...new Set(tabelas)];
}

function formatarDataHoraPg(date) {
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const y = date.getFullYear();
  return `${y}-${m}-${d}`;
}

function inicioProximoDia(date) {
  const prox = new Date(date);
  prox.setDate(prox.getDate() + 1);
  prox.setHours(0, 0, 0, 0);
  return prox;
}

async function tabelaExiste(nomeTabela) {
  const { rows } = await getWrpdvPool().query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1 LIMIT 1`,
    [nomeTabela]
  );
  return rows.length > 0;
}

function cupomContaNoClube(c, membrosSet, dataMinimaPorCpf) {
  if (!membrosSet.has(c.cpf)) return false;
  const min = dataMinimaPorCpf.get(c.cpf);
  if (min && !cupomAposDataMinima(c.dataHora, min)) return false;
  return true;
}

async function buscarNomesUsuarios(cpfs) {
  if (!cpfs.length) return new Map();
  const { rows } = await getPool().query(
    `SELECT cpf,
            COALESCE(
              dados_api->>'nome',
              dados_api->'cliente'->>'nome',
              ''
            ) AS nome
     FROM usuario
     WHERE cpf = ANY($1)`,
    [cpfs]
  );
  const mapa = new Map();
  for (const r of rows) {
    const nome = String(r.nome || "").trim();
    if (nome) mapa.set(r.cpf, nome);
  }
  return mapa;
}

async function buscarNomesERP(cpfs) {
  const mapa = new Map();
  const MAX_PARALELO = 5;

  for (let i = 0; i < cpfs.length; i += MAX_PARALELO) {
    const lote = cpfs.slice(i, i + MAX_PARALELO);
    const resultados = await Promise.allSettled(
      lote.map((cpf) => buscarClientePorCpfCnpj(cpf))
    );
    for (let j = 0; j < lote.length; j++) {
      const r = resultados[j];
      if (r.status === "fulfilled" && r.value?.ok && r.value.cliente) {
        const nome = String(
          r.value.cliente.nome || r.value.cliente.razao_social || ""
        ).trim();
        if (nome) mapa.set(lote[j], nome);
      }
    }
  }
  return mapa;
}

/**
 * Relatório de vendas do clube agrupado por PDV/caixa.
 * Retorna: resumo por PDV + detalhe de cupons por PDV.
 */
export async function obterRelatorioPdv({
  dataInicio = "",
  dataFim = "",
  dias = 7,
} = {}) {
  let inicio, fim;

  if (dataInicio && dataFim) {
    inicio = parseDataBR(dataInicio);
    fim = parseDataBR(dataFim);
  }

  if (!inicio || !fim) {
    const n = Math.min(90, Math.max(1, Number(dias) || 7));
    fim = new Date();
    fim.setHours(12, 0, 0, 0);
    inicio = new Date(fim);
    inicio.setDate(inicio.getDate() - (n - 1));
  }

  const tabelas = mesesNoPeriodo(inicio, fim);
  const inicioPg = formatarDataHoraPg(inicio);
  const fimExclusive = formatarDataHoraPg(inicioProximoDia(fim));

  const cuponsRaw = [];

  for (const tabela of tabelas) {
    if (!(await tabelaExiste(tabela))) continue;

    const { rows } = await getWrpdvPool().query(
      `SELECT
         tvd_cupom,
         tvd_pdv,
         tvd_unidade,
         MIN(tvd_data_hora) AS data_hora,
         (array_agg(tvd_registro ORDER BY tvd_data_hora))[1] AS finn_registro
       FROM ${tabela}
       WHERE tvd_tipo_reg = 'FINN'
         AND regexp_replace(split_part(tvd_registro, '|', 16), '\\D', '', 'g') <> ''
         AND tvd_data_hora >= $1::timestamp
         AND tvd_data_hora < $2::timestamp
       GROUP BY tvd_cupom, tvd_pdv, tvd_unidade`,
      [`${inicioPg} 00:00:00`, `${fimExclusive} 00:00:00`]
    );

    for (const row of rows) {
      const finn = parseFinn(row.finn_registro);
      const cpf = String(finn.cpf || "").trim();
      if (cpf.length < 11) continue;

      const valor = await valorCupomConfiavel(
        tabela,
        {
          tvd_cupom: row.tvd_cupom,
          tvd_pdv: row.tvd_pdv,
          tvd_unidade: row.tvd_unidade,
          data_hora: row.data_hora,
        },
        finn.valor
      );

      cuponsRaw.push({
        cupom: String(row.tvd_cupom ?? "").trim(),
        pdv: String(row.tvd_pdv ?? "").trim(),
        unidade: String(row.tvd_unidade ?? "").trim(),
        dataHora: row.data_hora,
        valor,
        cpf,
        nomeERP: String(finn.nomeCliente || "").trim(),
        forma: finn.forma || null,
        convenio: isFormaConvenio(finn.forma),
      });
    }
  }

  const cpfsUnicos = [...new Set(cuponsRaw.map((c) => c.cpf))];

  const { rows: membrosRows } = await getPool().query(
    `SELECT cpf, criado_em FROM usuario`
  );
  const membrosSet = new Set(membrosRows.map((r) => r.cpf));
  const dataMinimaPorCpf = mapaDataMinimaCadastro(membrosRows);

  const nomesMapa = await buscarNomesUsuarios(cpfsUnicos);

  const cuponsClube = cuponsRaw.filter((c) =>
    cupomContaNoClube(c, membrosSet, dataMinimaPorCpf)
  );
  const cuponsForaClube = cuponsRaw.filter((c) => !membrosSet.has(c.cpf));

  const naoMembrosMap = new Map();
  for (const c of cuponsForaClube) {
    if (!naoMembrosMap.has(c.cpf)) {
      naoMembrosMap.set(c.cpf, {
        cpf: c.cpf,
        nome: c.nomeERP || c.cpf,
        totalGasto: 0,
        cupons: 0,
        cuponsConvenio: 0,
        pdvs: new Set(),
        ultimaCompra: null,
      });
    }
    const agg = naoMembrosMap.get(c.cpf);
    agg.totalGasto += c.valor;
    agg.cupons += 1;
    if (c.convenio) agg.cuponsConvenio += 1;
    agg.pdvs.add(c.pdv);
    if (!agg.ultimaCompra || new Date(c.dataHora) > new Date(agg.ultimaCompra)) {
      agg.ultimaCompra = c.dataHora;
    }
  }

  const nomesERP = await buscarNomesERP([...naoMembrosMap.keys()]);

  for (const [cpf, nome] of nomesERP) {
    const agg = naoMembrosMap.get(cpf);
    if (agg && nome) agg.nome = nome;
  }

  const naoMembros = [...naoMembrosMap.values()]
    .map((c) => ({
      cpf: c.cpf,
      nome: c.nome,
      totalGasto: Math.round(c.totalGasto * 100) / 100,
      cupons: c.cupons,
      cuponsConvenio: c.cuponsConvenio,
      pdvs: [...c.pdvs].sort(),
      ultimaCompra: c.ultimaCompra,
    }))
    .sort((a, b) => b.totalGasto - a.totalGasto);

  const pdvMap = new Map();

  function garantirPdv(pdv) {
    if (!pdvMap.has(pdv)) {
      pdvMap.set(pdv, {
        pdv,
        totalVendido: 0,
        quantidadeCupons: 0,
        clientes: new Map(),
        naoMembros: new Map(),
        cupons: [],
        foraClube: {
          totalVendido: 0,
          quantidadeCupons: 0,
          valorConvenio: 0,
        },
      });
    }
    return pdvMap.get(pdv);
  }

  for (const c of cuponsClube) {
    const agg = garantirPdv(c.pdv);
    agg.totalVendido += c.valor;
    agg.quantidadeCupons += 1;

    if (!agg.clientes.has(c.cpf)) {
      agg.clientes.set(c.cpf, {
        cpf: c.cpf,
        nome: nomesMapa.get(c.cpf) || c.nomeERP || c.cpf,
        totalGasto: 0,
        cupons: 0,
        cuponsConvenio: 0,
      });
    }
    const cli = agg.clientes.get(c.cpf);
    cli.totalGasto += c.valor;
    cli.cupons += 1;
    if (c.convenio) cli.cuponsConvenio += 1;

    agg.cupons.push({
      cupom: c.cupom,
      dataHora: c.dataHora,
      cpf: c.cpf,
      nome: nomesMapa.get(c.cpf) || c.nomeERP || c.cpf,
      valor: Math.round(c.valor * 100) / 100,
      forma: c.forma,
      convenio: c.convenio,
    });
  }

  for (const c of cuponsForaClube) {
    const agg = garantirPdv(c.pdv);
    agg.foraClube.totalVendido += c.valor;
    agg.foraClube.quantidadeCupons += 1;
    if (c.convenio) agg.foraClube.valorConvenio += c.valor;

    if (!agg.naoMembros.has(c.cpf)) {
      agg.naoMembros.set(c.cpf, {
        cpf: c.cpf,
        nome: c.nomeERP || c.cpf,
        totalGasto: 0,
        cupons: 0,
        cuponsConvenio: 0,
      });
    }
    const cli = agg.naoMembros.get(c.cpf);
    cli.totalGasto += c.valor;
    cli.cupons += 1;
    if (c.convenio) cli.cuponsConvenio += 1;
  }

  for (const [cpf, nome] of nomesERP) {
    for (const pdvData of pdvMap.values()) {
      const cli = pdvData.naoMembros.get(cpf);
      if (cli && nome) cli.nome = nome;
    }
  }

  const valorTotalForaClube =
    Math.round(
      cuponsForaClube.reduce((s, c) => s + c.valor, 0) * 100
    ) / 100;

  const resumoPdvs = [...pdvMap.values()]
    .map((p) => {
      const fora = {
        totalVendido: Math.round(p.foraClube.totalVendido * 100) / 100,
        quantidadeCupons: p.foraClube.quantidadeCupons,
        clientesUnicos: p.naoMembros.size,
        valorConvenio: Math.round(p.foraClube.valorConvenio * 100) / 100,
      };
      fora.ticketMedio =
        fora.quantidadeCupons > 0
          ? Math.round((fora.totalVendido / fora.quantidadeCupons) * 100) / 100
          : 0;
      fora.pctDoTotalFora =
        valorTotalForaClube > 0
          ? Math.round((fora.totalVendido / valorTotalForaClube) * 1000) / 10
          : 0;
      fora.pctConvenio =
        fora.totalVendido > 0
          ? Math.round((fora.valorConvenio / fora.totalVendido) * 1000) / 10
          : 0;

      return {
      pdv: p.pdv,
      totalVendido: Math.round(p.totalVendido * 100) / 100,
      quantidadeCupons: p.quantidadeCupons,
      clientesUnicos: p.clientes.size,
      ticketMedio:
        p.quantidadeCupons > 0
          ? Math.round((p.totalVendido / p.quantidadeCupons) * 100) / 100
          : 0,
      resumoForaClube: fora,
      clientes: [...p.clientes.values()]
        .map((c) => ({
          ...c,
          totalGasto: Math.round(c.totalGasto * 100) / 100,
        }))
        .sort((a, b) => b.totalGasto - a.totalGasto),
      naoMembros: [...p.naoMembros.values()]
        .map((c) => ({
          ...c,
          totalGasto: Math.round(c.totalGasto * 100) / 100,
        }))
        .sort((a, b) => b.totalGasto - a.totalGasto),
      cupons: p.cupons.sort(
        (a, b) => new Date(b.dataHora) - new Date(a.dataHora)
      ),
    };
    })
    .sort((a, b) => b.totalVendido - a.totalVendido);

  const pdvsForaClube = [...resumoPdvs]
    .filter((p) => p.resumoForaClube.totalVendido > 0)
    .sort(
      (a, b) => b.resumoForaClube.totalVendido - a.resumoForaClube.totalVendido
    );

  const totalGeral = resumoPdvs.reduce((s, p) => s + p.totalVendido, 0);
  const cuponsGeral = resumoPdvs.reduce((s, p) => s + p.quantidadeCupons, 0);

  return {
    geradoEm: new Date().toISOString(),
    escopo: {
      membros:
        "Cupons de membros cadastrados, somente a partir da data de cadastro no clube.",
      foraClube: "CPF informado no caixa por clientes não cadastrados no programa.",
    },
    periodo: {
      dataInicio: formatarDataBR(inicio),
      dataFim: formatarDataBR(fim),
    },
    totalGeral: Math.round(totalGeral * 100) / 100,
    cuponsGeral,
    pdvsAtivos: resumoPdvs.length,
    ticketMedioGeral:
      cuponsGeral > 0 ? Math.round((totalGeral / cuponsGeral) * 100) / 100 : 0,
    pdvs: resumoPdvs,
    pdvsForaClube,
    naoMembros: {
      total: naoMembros.length,
      cupons: cuponsForaClube.length,
      valorTotal: valorTotalForaClube,
      clientes: naoMembros,
    },
  };
}

function resolverPeriodoRelatorio({ dataInicio = "", dataFim = "", dias = 7 } = {}) {
  let inicio;
  let fim;

  if (dataInicio && dataFim) {
    inicio = parseDataBR(dataInicio);
    fim = parseDataBR(dataFim);
  }

  if (!inicio || !fim) {
    const n = Math.min(90, Math.max(1, Number(dias) || 7));
    fim = new Date();
    fim.setHours(12, 0, 0, 0);
    inicio = new Date(fim);
    inicio.setDate(inicio.getDate() - (n - 1));
  }

  return {
    inicio,
    fim,
    dataInicio: formatarDataBR(inicio),
    dataFim: formatarDataBR(fim),
  };
}

/**
 * Detalhe completo dos cupons de um cliente (itens, pagamento, descontos).
 * Opcionalmente filtra por PDV/caixa.
 */
export async function obterCuponsDetalheClientePdv({
  cpf = "",
  pdv = "",
  dataInicio = "",
  dataFim = "",
  dias = 7,
} = {}) {
  const documento = normalizarCpfCnpj(cpf);
  if (!documento) {
    throw new Error("CPF/CNPJ inválido");
  }

  const periodo = resolverPeriodoRelatorio({ dataInicio, dataFim, dias });
  const vendas = await buscarVendasClienteWrpdv(
    documento,
    periodo.dataInicio,
    periodo.dataFim
  );

  if (!vendas.ok) {
    throw new Error(vendas.error || "Erro ao buscar cupons do cliente");
  }

  const { rows: membroRows } = await getPool().query(
    `SELECT criado_em FROM usuario WHERE cpf = $1 LIMIT 1`,
    [documento]
  );

  const pdvNorm = String(pdv ?? "").trim();
  let cupons = vendas.itens || [];
  if (pdvNorm) {
    cupons = cupons.filter((c) => String(c.pdv) === pdvNorm);
  }

  const membroClube = membroRows.length > 0;
  if (membroClube && membroRows[0].criado_em) {
    cupons = cupons.filter((c) =>
      cupomNoOuAposCadastro(c.dataHora || c.data, membroRows[0].criado_em)
    );
  }

  cupons.sort((a, b) => {
    const da = String(a.data || "");
    const db = String(b.data || "");
    if (da !== db) return db.localeCompare(da);
    return String(b.numeroDcto || "").localeCompare(String(a.numeroDcto || ""));
  });

  const nomesMapa = await buscarNomesUsuarios([documento]);
  let nome = nomesMapa.get(documento) || "";
  if (!nome) {
    const erpMapa = await buscarNomesERP([documento]);
    nome = erpMapa.get(documento) || documento;
  }

  const valorTotal = cupons.reduce(
    (s, c) => s + (Number(c.valorTotalCupom) || 0),
    0
  );
  const quantidadeItens = cupons.reduce(
    (s, c) => s + (c.produtos?.length || 0),
    0
  );

  return {
    cpf: documento,
    nome,
    pdv: pdvNorm || null,
    membroClube,
    periodo: {
      dataInicio: periodo.dataInicio,
      dataFim: periodo.dataFim,
    },
    cupons,
    totais: {
      quantidadeCupons: cupons.length,
      quantidadeItens,
      valorTotal: Math.round(valorTotal * 100) / 100,
    },
  };
}
