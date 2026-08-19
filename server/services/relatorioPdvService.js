import { getWrpdvPool } from "../db/wrpdv.js";
import { getPool } from "../db.js";
import { parseDataBR, formatarDataBR } from "../utils/periodoVendas.js";
import { parseFinn } from "./wrpdvParser.js";
import { buscarClientePorCpfCnpj } from "./apiClient.js";

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

      cuponsRaw.push({
        cupom: String(row.tvd_cupom ?? "").trim(),
        pdv: String(row.tvd_pdv ?? "").trim(),
        unidade: String(row.tvd_unidade ?? "").trim(),
        dataHora: row.data_hora,
        valor: Number(finn.valor) || 0,
        cpf,
        nomeERP: String(finn.nomeCliente || "").trim(),
      });
    }
  }

  const cpfsUnicos = [...new Set(cuponsRaw.map((c) => c.cpf))];

  const membrosSet = new Set();
  if (cpfsUnicos.length) {
    const { rows } = await getPool().query(
      `SELECT cpf FROM usuario WHERE cpf = ANY($1)`,
      [cpfsUnicos]
    );
    for (const r of rows) membrosSet.add(r.cpf);
  }

  const nomesMapa = await buscarNomesUsuarios(cpfsUnicos);

  const cuponsClube = cuponsRaw.filter((c) => membrosSet.has(c.cpf));
  const cuponsForaClube = cuponsRaw.filter((c) => !membrosSet.has(c.cpf));

  const naoMembrosMap = new Map();
  for (const c of cuponsForaClube) {
    if (!naoMembrosMap.has(c.cpf)) {
      naoMembrosMap.set(c.cpf, {
        cpf: c.cpf,
        nome: c.nomeERP || c.cpf,
        totalGasto: 0,
        cupons: 0,
        pdvs: new Set(),
        ultimaCompra: null,
      });
    }
    const agg = naoMembrosMap.get(c.cpf);
    agg.totalGasto += c.valor;
    agg.cupons += 1;
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
      });
    }
    const cli = agg.clientes.get(c.cpf);
    cli.totalGasto += c.valor;
    cli.cupons += 1;

    agg.cupons.push({
      cupom: c.cupom,
      dataHora: c.dataHora,
      cpf: c.cpf,
      nome: nomesMapa.get(c.cpf) || c.nomeERP || c.cpf,
      valor: Math.round(c.valor * 100) / 100,
    });
  }

  for (const c of cuponsForaClube) {
    const agg = garantirPdv(c.pdv);
    if (!agg.naoMembros.has(c.cpf)) {
      agg.naoMembros.set(c.cpf, {
        cpf: c.cpf,
        nome: c.nomeERP || c.cpf,
        totalGasto: 0,
        cupons: 0,
      });
    }
    const cli = agg.naoMembros.get(c.cpf);
    cli.totalGasto += c.valor;
    cli.cupons += 1;
  }

  for (const [cpf, nome] of nomesERP) {
    for (const pdvData of pdvMap.values()) {
      const cli = pdvData.naoMembros.get(cpf);
      if (cli && nome) cli.nome = nome;
    }
  }

  const resumoPdvs = [...pdvMap.values()]
    .map((p) => ({
      pdv: p.pdv,
      totalVendido: Math.round(p.totalVendido * 100) / 100,
      quantidadeCupons: p.quantidadeCupons,
      clientesUnicos: p.clientes.size,
      ticketMedio:
        p.quantidadeCupons > 0
          ? Math.round((p.totalVendido / p.quantidadeCupons) * 100) / 100
          : 0,
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
    }))
    .sort((a, b) => b.totalVendido - a.totalVendido);

  const totalGeral = resumoPdvs.reduce((s, p) => s + p.totalVendido, 0);
  const cuponsGeral = resumoPdvs.reduce((s, p) => s + p.quantidadeCupons, 0);

  return {
    geradoEm: new Date().toISOString(),
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
    naoMembros: {
      total: naoMembros.length,
      cupons: cuponsForaClube.length,
      valorTotal: Math.round(
        cuponsForaClube.reduce((s, c) => s + c.valor, 0) * 100
      ) / 100,
      clientes: naoMembros,
    },
  };
}
