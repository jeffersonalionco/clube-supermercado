import { getWrpdvPool } from "../db/wrpdv.js";
import { normalizarCpfCnpj } from "./apiClient.js";
import { formatarDataBR, parseDataBR } from "../utils/periodoVendas.js";
import {
  aplicarDescontosDstn,
  cupomTemConvenioNasLinhas,
  descontosDasLinhas,
  isTipoItem,
  isTipoPagamento,
  pagamentosDasLinhas,
  parseFinn,
  parseVitn,
} from "./wrpdvParser.js";

const tabelasExistentes = new Map();

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

async function tabelaVendaExiste(nomeTabela) {
  if (tabelasExistentes.has(nomeTabela)) {
    return tabelasExistentes.get(nomeTabela);
  }

  const { rows } = await getWrpdvPool().query(
    `SELECT 1
     FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1
     LIMIT 1`,
    [nomeTabela]
  );

  const existe = rows.length > 0;
  tabelasExistentes.set(nomeTabela, existe);
  return existe;
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

async function buscarCabecalhosCupons(tabela, cpf, inicio, fim) {
  const existe = await tabelaVendaExiste(tabela);
  if (!existe) return [];

  const inicioPg = formatarDataHoraPg(inicio);
  const fimPg = formatarDataHoraPg(fim);
  const fimExclusive = formatarDataHoraPg(inicioProximoDia(fim));

  const { rows } = await getWrpdvPool().query(
    `SELECT
       tvd_cupom,
       tvd_pdv,
       tvd_unidade,
       MIN(tvd_data_hora) AS data_hora,
       (array_agg(tvd_registro ORDER BY tvd_data_hora))[1] AS finn_registro
     FROM ${tabela}
     WHERE tvd_tipo_reg = 'FINN'
       AND regexp_replace(split_part(tvd_registro, '|', 16), '\\D', '', 'g') = $1
       AND tvd_data_hora >= $2::timestamp
       AND tvd_data_hora < $3::timestamp
     GROUP BY tvd_cupom, tvd_pdv, tvd_unidade`,
    [`${cpf}`, `${inicioPg} 00:00:00`, `${fimExclusive} 00:00:00`]
  );

  return rows.map((row) => ({
    cupom: String(row.tvd_cupom ?? "").trim(),
    pdv: String(row.tvd_pdv ?? "").trim(),
    unidade: String(row.tvd_unidade ?? "").trim(),
    dataHora: row.data_hora,
    finnRegistro: row.finn_registro,
    tabela,
  }));
}

async function buscarLinhasCupom(cabecalho) {
  const { cupom, pdv, unidade, dataHora, tabela } = cabecalho;
  const dataCupom = formatarDataHoraPg(new Date(dataHora));

  const { rows } = await getWrpdvPool().query(
    `SELECT tvd_tipo_reg, tvd_registro, tvd_data_hora
     FROM ${tabela}
     WHERE tvd_cupom = $1
       AND tvd_pdv = $2
       AND tvd_unidade = $3
       AND tvd_data_hora::date = $4::date
     ORDER BY tvd_data_hora`,
    [cupom, pdv, unidade, dataCupom]
  );

  return rows;
}

function statusNfceCancelado(status) {
  const codigo = String(status ?? "").trim().toUpperCase();
  return codigo !== "" && codigo !== "A";
}

async function cupomCancelado(cupom, pdv, unidade) {
  const { rows } = await getWrpdvPool().query(
    `SELECT nfc_status
     FROM movnfce
     WHERE nfc_coo = $1
       AND nfc_estacao = $2
       AND nfc_unidade = $3
     ORDER BY nfc_datamvto DESC
     LIMIT 1`,
    [cupom, pdv, unidade]
  );

  if (!rows.length) return false;
  return statusNfceCancelado(rows[0].nfc_status);
}

/** Consulta cancelamento em lote no movnfce. */
export async function mapaCuponsCancelados(cabecalhos) {
  const mapa = new Map();
  const lista = (cabecalhos || []).filter((c) => c.cupom && c.pdv);
  if (!lista.length) return mapa;

  const CHUNK = 80;
  for (let i = 0; i < lista.length; i += CHUNK) {
    const lote = lista.slice(i, i + CHUNK);
    const params = [];
    const tuplas = lote
      .map((c, idx) => {
        const base = idx * 3;
        params.push(c.cupom, c.pdv, c.unidade || "001");
        return `($${base + 1}, $${base + 2}, $${base + 3})`;
      })
      .join(", ");

    const { rows } = await getWrpdvPool().query(
      `SELECT DISTINCT ON (nfc_coo, nfc_estacao, nfc_unidade)
              nfc_coo, nfc_estacao, nfc_unidade, nfc_status
       FROM movnfce
       WHERE (nfc_coo, nfc_estacao, nfc_unidade) IN (${tuplas})
       ORDER BY nfc_coo, nfc_estacao, nfc_unidade, nfc_datamvto DESC`,
      params
    );

    for (const row of rows) {
      const chave = `${row.nfc_estacao}-${row.nfc_coo}`;
      mapa.set(chave, statusNfceCancelado(row.nfc_status));
    }
  }

  return mapa;
}

function montarResumoCupom(cab, cancelado, convenio) {
  const finn = parseFinn(cab.finnRegistro);
  return {
    chaveCupom: `${cab.pdv}-${cab.cupom}`,
    numeroDcto: cab.cupom,
    pdv: cab.pdv,
    unidade: cab.unidade,
    data: formatarDataBR(new Date(cab.dataHora)),
    valorTotalCupom: finn.valor,
    cancelado,
    convenio,
    elegivelPontos: !cancelado && !convenio,
  };
}

async function buscarLinhasFinCupom(cabecalho) {
  const { cupom, pdv, unidade, dataHora, tabela } = cabecalho;
  const dataCupom = formatarDataHoraPg(new Date(dataHora));

  const { rows } = await getWrpdvPool().query(
    `SELECT tvd_tipo_reg, tvd_registro
     FROM ${tabela}
     WHERE tvd_cupom = $1
       AND tvd_pdv = $2
       AND tvd_unidade = $3
       AND tvd_data_hora::date = $4::date
       AND tvd_tipo_reg LIKE 'FIN%'`,
    [cupom, pdv, unidade, dataCupom]
  );

  return rows;
}

/**
 * Agrega compras por CPF no período (todas as vendas com CPF no cupom FINN).
 * Retorna Map<cpf, { totalGasto, quantidadeCupons, ultimaCompra }>.
 */
export async function agruparComprasPorCpfWrpdv(dataini, datafim) {
  const inicio = parseDataBR(dataini);
  const fim = parseDataBR(datafim);
  if (!inicio || !fim) {
    return new Map();
  }

  const mapa = new Map();
  const tabelas = mesesNoPeriodo(inicio, fim);
  const inicioPg = formatarDataHoraPg(inicio);
  const fimExclusive = formatarDataHoraPg(inicioProximoDia(fim));

  for (const tabela of tabelas) {
    const existe = await tabelaVendaExiste(tabela);
    if (!existe) continue;

    const { rows } = await getWrpdvPool().query(
      `SELECT
         regexp_replace(split_part(tvd_registro, '|', 16), '\\D', '', 'g') AS cpf,
         tvd_cupom,
         tvd_pdv,
         tvd_unidade,
         MIN(tvd_data_hora) AS data_hora,
         (array_agg(tvd_registro ORDER BY tvd_data_hora))[1] AS finn_registro
       FROM ${tabela}
       WHERE tvd_tipo_reg = 'FINN'
         AND tvd_data_hora >= $1::timestamp
         AND tvd_data_hora < $2::timestamp
       GROUP BY 1, tvd_cupom, tvd_pdv, tvd_unidade`,
      [`${inicioPg} 00:00:00`, `${fimExclusive} 00:00:00`]
    );

    for (const row of rows) {
      const cpf = String(row.cpf ?? "").trim();
      if (cpf.length < 11) continue;

      const finn = parseFinn(row.finn_registro);
      const valor = Number(finn.valor) || 0;
      const dataHora = row.data_hora;

      if (!mapa.has(cpf)) {
        mapa.set(cpf, {
          cpf,
          totalGasto: 0,
          quantidadeCupons: 0,
          ultimaCompra: null,
        });
      }

      const agg = mapa.get(cpf);
      agg.totalGasto += valor;
      agg.quantidadeCupons += 1;
      if (!agg.ultimaCompra || new Date(dataHora) > new Date(agg.ultimaCompra)) {
        agg.ultimaCompra = dataHora;
      }
    }
  }

  for (const agg of mapa.values()) {
    agg.totalGasto = Math.round(agg.totalGasto * 100) / 100;
  }

  return mapa;
}

/**
 * Resumo leve dos cupons do CPF (para sync de pontos — sem carregar itens).
 */
export async function buscarCuponsResumoWrpdv(cpfCnpj, dataini, datafim) {
  const documento = normalizarCpfCnpj(cpfCnpj);
  if (!documento) {
    return { ok: false, error: "CPF/CNPJ inválido" };
  }

  const inicio = parseDataBR(dataini);
  const fim = parseDataBR(datafim);
  if (!inicio || !fim) {
    return { ok: false, error: "Datas inválidas para consulta de compras" };
  }

  try {
    const tabelas = mesesNoPeriodo(inicio, fim);
    const cabecalhos = [];

    for (const tabela of tabelas) {
      const lote = await buscarCabecalhosCupons(tabela, documento, inicio, fim);
      cabecalhos.push(...lote);
    }

    const cancelados = await mapaCuponsCancelados(cabecalhos);
    const cupons = [];

    for (const cab of cabecalhos) {
      const chave = `${cab.pdv}-${cab.cupom}`;
      const cancelado = cancelados.get(chave) === true;
      const linhasFin = await buscarLinhasFinCupom(cab);
      const convenio = cupomTemConvenioNasLinhas(linhasFin);
      cupons.push(montarResumoCupom(cab, cancelado, convenio));
    }

    return { ok: true, cupons };
  } catch (error) {
    console.error("[wrpdv/cupons-resumo]", error.message);
    return {
      ok: false,
      error: "Não foi possível sincronizar suas compras no momento",
    };
  }
}

function montarVenda(cabecalho, linhas, { cancelada = false, convenio = false } = {}) {
  const { cupom, pdv, unidade, dataHora } = cabecalho;
  const itens = linhas.filter((l) => isTipoItem(l.tvd_tipo_reg));
  const pagamentos = pagamentosDasLinhas(linhas);
  const finn = pagamentos[0] ?? null;
  const temConvenio = convenio || cupomTemConvenioNasLinhas(linhas);
  const formasPagamento = [
    ...new Set(pagamentos.map((p) => p.forma).filter(Boolean)),
  ];

  const produtosBrutos = itens.map((linha) => {
    const p = parseVitn(linha.tvd_registro);
    return {
      codigoProduto: p.codigoInterno || p.codigoBarras,
      descricao: p.descricao,
      codigoBarras: p.codigoBarras,
      quantidadeUnitaria: p.quantidade,
      valorTotal: p.valorTotal,
      oferta: p.oferta ? "SIM" : "NAO",
    };
  });

  const descontos = descontosDasLinhas(linhas);
  const {
    produtos,
    subtotalItens,
    totalDesconto,
    totalDescontoCupom,
    totalLiquido,
  } = aplicarDescontosDstn(produtosBrutos, descontos);

  const valorTotalCupom =
    finn?.valor > 0
      ? Math.round(Number(finn.valor) * 100) / 100
      : totalLiquido;

  return {
    data: formatarDataBR(new Date(dataHora)),
    numeroDcto: cupom,
    pdv,
    chaveCupom: `${pdv}-${cupom}`,
    unidade: { codigo: unidade },
    valorTotalCupom,
    subtotalItens,
    totalDesconto,
    totalDescontoCupom,
    totalLiquido: valorTotalCupom,
    formaPagamento: finn?.forma ?? formasPagamento[0] ?? null,
    formasPagamento,
    cancelada,
    convenio: temConvenio,
    elegivelPontos: !cancelada && !temConvenio,
    produtos,
  };
}

/**
 * Busca vendas do cliente no WR PDV (tab_venda_MMYY) pelo CPF no registro FINN.
 * Retorno compatível com o formato usado pelo app (substitui API ERP).
 */
export async function buscarVendasClienteWrpdv(cpfCnpj, dataini, datafim) {
  const documento = normalizarCpfCnpj(cpfCnpj);
  if (!documento) {
    return { ok: false, error: "CPF/CNPJ inválido" };
  }

  const inicio = parseDataBR(dataini);
  const fim = parseDataBR(datafim);

  if (!inicio || !fim) {
    return { ok: false, error: "Datas inválidas para consulta de compras" };
  }

  try {
    const tabelas = mesesNoPeriodo(inicio, fim);
    const cabecalhos = [];

    for (const tabela of tabelas) {
      const lote = await buscarCabecalhosCupons(tabela, documento, inicio, fim);
      cabecalhos.push(...lote);
    }

    const cancelados = await mapaCuponsCancelados(cabecalhos);
    const itens = [];

    for (const cab of cabecalhos) {
      const chave = `${cab.pdv}-${cab.cupom}`;
      const cancelada = cancelados.get(chave) === true;

      const linhas = await buscarLinhasCupom(cab);
      if (!linhas.length) continue;

      const convenio = cupomTemConvenioNasLinhas(linhas);

      itens.push(montarVenda(cab, linhas, { cancelada, convenio }));
    }

    itens.sort((a, b) => {
      const da = parseDataBR(a.data)?.getTime() || 0;
      const db = parseDataBR(b.data)?.getTime() || 0;
      if (da !== db) return da - db;
      return String(a.chaveCupom).localeCompare(String(b.chaveCupom));
    });

    return { ok: true, itens };
  } catch (error) {
    console.error("[wrpdv/vendas]", error.message);
    return {
      ok: false,
      error: "Não foi possível carregar suas compras no momento",
    };
  }
}
