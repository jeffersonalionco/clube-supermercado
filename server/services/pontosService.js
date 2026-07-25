import { getPool } from "../db.js";
import { buscarCuponsResumoWrpdv } from "./wrpdvVendasService.js";
import { parseChaveCupom } from "./wrpdvParser.js";
import {
  aplicarDebitoFifo,
  MESES_VALIDADE_PONTOS,
  obterProximaExpiracao,
  sincronizarLotesPontos,
} from "./pontosLotesService.js";
import { formatarDataBR, MAX_DIAS_PERIODO } from "../utils/periodoVendas.js";
import {
  cupomAposCadastro,
  cupomElegivelPontos,
  dataInicioPlataformaBR,
  dataInicioPontos,
  dataInicioPontosBR,
  filtrarItensAposCadastro,
  gerarJanelasVendas,
  inicioDiaCadastro,
  ordenarItensPorDataAsc,
} from "../utils/vendasPlataforma.js";
import { obterConfigPrograma } from "./programaConfigService.js";
import { buscarUsuarioPorCpf } from "./usuarioService.js";

export { programaPontosAtivo } from "./programaConfigService.js";

import {
  REAIS_POR_PONTO,
  VALOR_REFERENCIA_PONTO,
} from "../constants/pontosPrograma.js";

export { REAIS_POR_PONTO, VALOR_REFERENCIA_PONTO };
export { MESES_VALIDADE_PONTOS };

const SQL_OCULTAR_CREDITO_MANUAL = `AND numero_dcto NOT LIKE 'CREDITO-MANUAL-%'`;

function chaveCupom(item) {
  return String(item?.chaveCupom ?? item?.numeroDcto ?? "").trim();
}

function somarValorVenda(item) {
  if (item?.valorTotalCupom != null) {
    return Number(item.valorTotalCupom) || 0;
  }
  const produtos = item?.produtos;
  if (!Array.isArray(produtos)) return 0;
  return produtos.reduce((acc, p) => acc + (Number(p.valorTotal) || 0), 0);
}

function parseDataVenda(dataStr) {
  const match = String(dataStr || "").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function formatarDataPg(valor) {
  if (!valor) return null;
  if (valor instanceof Date) {
    const dia = String(valor.getDate()).padStart(2, "0");
    const mes = String(valor.getMonth() + 1).padStart(2, "0");
    const ano = valor.getFullYear();
    return `${dia}/${mes}/${ano}`;
  }
  const partes = String(valor).slice(0, 10).split("-");
  if (partes.length !== 3) return null;
  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

async function ensurePontosConta(client, cpf) {
  await client.query(
    `INSERT INTO pontos_conta (cpf)
     VALUES ($1)
     ON CONFLICT (cpf) DO NOTHING`,
    [cpf]
  );
}

function cupomResumoFromItem(item) {
  const chave = chaveCupom(item);
  if (!chave) return null;

  const convenio = Boolean(item.convenio);
  const cancelado = Boolean(item.cancelada);

  return {
    chaveCupom: chave,
    numeroDcto: String(item.numeroDcto ?? "").trim(),
    pdv: item.pdv ? String(item.pdv) : parseChaveCupom(chave).pdv,
    data: item.data,
    valorTotalCupom: somarValorVenda(item),
    cancelado,
    convenio,
    elegivelPontos: item.elegivelPontos !== false && !cancelado && !convenio,
  };
}

function mesclarCuponsResumo(listas) {
  const mapa = new Map();
  for (const lista of listas) {
    for (const cupom of lista) {
      if (!cupom?.chaveCupom) continue;
      const atual = mapa.get(cupom.chaveCupom);
      if (!atual) {
        mapa.set(cupom.chaveCupom, cupom);
        continue;
      }
      mapa.set(cupom.chaveCupom, {
        ...atual,
        ...cupom,
        cancelado: Boolean(atual.cancelado || cupom.cancelado),
        convenio: Boolean(atual.convenio || cupom.convenio),
        elegivelPontos: Boolean(
          (atual.elegivelPontos !== false && cupom.elegivelPontos !== false) &&
            !(atual.cancelado || cupom.cancelado) &&
            !(atual.convenio || cupom.convenio)
        ),
      });
    }
  }
  return mapa;
}

function formatarCupomLabel(chave) {
  const { pdv, cupom } = parseChaveCupom(chave);
  if (pdv && cupom) return `${cupom} · caixa ${pdv}`;
  return cupom || chave;
}

async function carregarComprasAtivas(client, cpf) {
  const { rows } = await client.query(
    `SELECT numero_dcto, valor_compra, data_venda, id, cancelado_em, inelegivel_motivo
     FROM pontos_movimento
     WHERE cpf = $1 AND cancelado_em IS NULL AND inelegivel_motivo IS NULL
     ORDER BY data_venda ASC NULLS LAST, id ASC`,
    [cpf]
  );
  return rows;
}

function calcularSaldoDeCompras(compras, resgates) {
  let valorPendente = 0;
  let saldoCompras = 0;

  for (const compra of compras) {
    valorPendente += Number(compra.valor_compra) || 0;
    const pontosGerados = Math.floor(valorPendente / REAIS_POR_PONTO);
    valorPendente %= REAIS_POR_PONTO;
    saldoCompras += pontosGerados;
  }

  let saldo = saldoCompras;
  for (const resgate of resgates) {
    saldo -= Number(resgate.pontos) || 0;
  }
  if (saldo < 0) saldo = 0;

  return {
    saldo,
    valorPendente: Math.round(valorPendente * 100) / 100,
  };
}

async function calcularPontosEstornoCupom(client, cpf, numeroDcto) {
  const { rows: todas } = await client.query(
    `SELECT numero_dcto, valor_compra, data_venda, id, cancelado_em
     FROM pontos_movimento
     WHERE cpf = $1
     ORDER BY data_venda ASC NULLS LAST, id ASC`,
    [cpf]
  );

  const movimento = todas.find((row) => row.numero_dcto === numeroDcto);
  if (!movimento) return 0;

  const ativas = todas.filter(
    (row) => !row.cancelado_em && !row.inelegivel_motivo
  );
  const comCupom = movimento.cancelado_em
    ? [...ativas, movimento].sort((a, b) => {
        const ta = a.data_venda ? new Date(a.data_venda).getTime() : a.id;
        const tb = b.data_venda ? new Date(b.data_venda).getTime() : b.id;
        return ta - tb || a.id - b.id;
      })
    : ativas;

  const semCupom = comCupom.filter((row) => row.numero_dcto !== numeroDcto);

  const { rows: resgates } = await client.query(
    `SELECT pontos FROM pontos_baixa WHERE cpf = $1 ORDER BY criado_em ASC`,
    [cpf]
  );

  const saldoCom = calcularSaldoDeCompras(comCupom, resgates).saldo;
  const saldoSem = calcularSaldoDeCompras(semCupom, resgates).saldo;
  return Math.max(0, saldoCom - saldoSem);
}

async function registrarEstornoCupom(client, cpf, movimento, pontos) {
  await client.query(
    `INSERT INTO pontos_estorno (cpf, numero_dcto, pontos, valor_compra, data_venda)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (cpf, numero_dcto) DO NOTHING`,
    [
      cpf,
      movimento.numero_dcto,
      pontos,
      movimento.valor_compra,
      movimento.data_venda,
    ]
  );
}

async function garantirEstornosRegistrados(client, cpf) {
  const { rows } = await client.query(
    `SELECT pm.numero_dcto, pm.valor_compra, pm.data_venda
     FROM pontos_movimento pm
     LEFT JOIN pontos_estorno pe
       ON pe.cpf = pm.cpf AND pe.numero_dcto = pm.numero_dcto
     WHERE pm.cpf = $1
       AND pm.cancelado_em IS NOT NULL
       AND pe.id IS NULL`,
    [cpf]
  );

  for (const movimento of rows) {
    const pontos = await calcularPontosEstornoCupom(
      client,
      cpf,
      movimento.numero_dcto
    );
    await registrarEstornoCupom(client, cpf, movimento, pontos);
  }
}

function formatarDataPgDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function resolverDataMinimaPontos(criadoEm) {
  const config = await obterConfigPrograma();
  if (!config.pontosHabilitadoEm) return null;
  return formatarDataPgDate(dataInicioPontos(criadoEm, config.pontosHabilitadoEm));
}

function resultadoReconciliarDesativado(criadoEm) {
  return {
    ok: true,
    novosCupons: 0,
    cuponsCancelados: 0,
    cuponsConvenio: 0,
    pontosCreditados: 0,
    pontosEstornados: 0,
    saldo: null,
    dataInicioPlataforma: dataInicioPlataformaBR(criadoEm),
    periodo: null,
    programaDesativado: true,
  };
}

async function recalcularPontosConta(client, cpf, dataMinima = null) {
  const { saldo, valorPendente } = await sincronizarLotesPontos(client, cpf, {
    dataMinima,
  });

  await client.query(
    `UPDATE pontos_conta
     SET saldo_pontos = $2,
         valor_pendente = $3,
         atualizado_em = NOW()
     WHERE cpf = $1`,
    [cpf, saldo, valorPendente]
  );

  return { saldo, valorPendente };
}

async function marcarCuponsCancelados(client, cpf, chaves) {
  const lista = [...new Set((chaves || []).map((c) => String(c).trim()).filter(Boolean))];
  if (!lista.length) return 0;

  let cancelados = 0;

  for (const chave of lista) {
    const { rows } = await client.query(
      `SELECT numero_dcto, valor_compra, data_venda, cancelado_em
       FROM pontos_movimento
       WHERE cpf = $1 AND numero_dcto = $2`,
      [cpf, chave]
    );

    const movimento = rows[0];
    if (!movimento || movimento.cancelado_em) continue;

    const pontosEstorno = await calcularPontosEstornoCupom(client, cpf, chave);

    await client.query(
      `UPDATE pontos_movimento
       SET cancelado_em = NOW()
       WHERE cpf = $1 AND numero_dcto = $2 AND cancelado_em IS NULL`,
      [cpf, chave]
    );

    await registrarEstornoCupom(client, cpf, movimento, pontosEstorno);
    cancelados += 1;
  }

  return cancelados;
}

async function marcarCuponsInelegiveisConvenio(client, cpf, chaves) {
  const lista = [...new Set((chaves || []).map((c) => String(c).trim()).filter(Boolean))];
  if (!lista.length) return 0;

  let marcados = 0;

  for (const chave of lista) {
    const { rows } = await client.query(
      `SELECT numero_dcto, inelegivel_motivo, cancelado_em
       FROM pontos_movimento
       WHERE cpf = $1 AND numero_dcto = $2`,
      [cpf, chave]
    );

    const movimento = rows[0];
    if (
      !movimento ||
      movimento.cancelado_em ||
      movimento.inelegivel_motivo === "convenio"
    ) {
      continue;
    }

    const atualizado = await client.query(
      `UPDATE pontos_movimento
       SET inelegivel_motivo = 'convenio'
       WHERE cpf = $1
         AND numero_dcto = $2
         AND cancelado_em IS NULL
         AND inelegivel_motivo IS NULL`,
      [cpf, chave]
    );

    if (atualizado.rowCount > 0) {
      marcados += 1;
    }
  }

  return marcados;
}

async function inserirCuponsValidos(client, cpf, cupons, criadoEm, habilitadoEm) {
  let novosCupons = 0;

  for (const cupom of cupons) {
    if (cupom.cancelado || cupom.convenio || cupom.elegivelPontos === false) {
      continue;
    }
    if (!cupomElegivelPontos({ data: cupom.data }, criadoEm, habilitadoEm)) continue;

    const valorCompra = Number(cupom.valorTotalCupom) || 0;
    const dataVenda = parseDataVenda(cupom.data);
    if (!cupom.chaveCupom || valorCompra <= 0) continue;

    const inserido = await client.query(
      `INSERT INTO pontos_movimento (cpf, numero_dcto, data_venda, valor_compra)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (cpf, numero_dcto) DO NOTHING
       RETURNING id`,
      [cpf, cupom.chaveCupom, dataVenda, valorCompra]
    );

    if (inserido.rowCount > 0) {
      novosCupons += 1;
    }
  }

  return novosCupons;
}

/**
 * Sincroniza cupons com o WR PDV, marca cancelados e recalcula saldo.
 * Recálculo cronológico garante estorno correto com saldo acumulado (R$ 50/ponto).
 */
export async function reconciliarPontos(cpf, criadoEm, { cuponsExtras = [] } = {}) {
  const config = await obterConfigPrograma();
  if (!config.pontosHabilitado) {
    return resultadoReconciliarDesativado(criadoEm);
  }

  const inicio = dataInicioPontos(criadoEm, config.pontosHabilitadoEm);
  const dataMinima = formatarDataPgDate(inicio);
  const fim = new Date();
  const janelas = gerarJanelasVendas(inicio, fim, MAX_DIAS_PERIODO);
  const resumosWrpdv = [];

  for (const janela of janelas) {
    const resultado = await buscarCuponsResumoWrpdv(
      cpf,
      janela.dataini,
      janela.datafim
    );

    if (!resultado.ok) {
      return { ok: false, error: resultado.error };
    }

    resumosWrpdv.push(...resultado.cupons);
  }

  const extras = cuponsExtras
    .map(cupomResumoFromItem)
    .filter(Boolean);

  const mapaCupons = mesclarCuponsResumo([resumosWrpdv, extras]);
  const chavesCanceladasWrpdv = [...mapaCupons.values()]
    .filter((c) => c.cancelado)
    .map((c) => c.chaveCupom);
  const chavesConvenioWrpdv = [...mapaCupons.values()]
    .filter((c) => c.convenio)
    .map((c) => c.chaveCupom);

  const client = await getPool().connect();
  let novosCupons = 0;
  let cuponsCancelados = 0;
  let cuponsConvenio = 0;
  let saldoAntes = 0;
  let saldoDepois = 0;

  try {
    await client.query("BEGIN");
    await ensurePontosConta(client, cpf);

    const { rows: saldoRows } = await client.query(
      `SELECT COALESCE(saldo_pontos, 0)::int AS saldo FROM pontos_conta WHERE cpf = $1`,
      [cpf]
    );
    saldoAntes = Number(saldoRows[0]?.saldo) || 0;

    novosCupons = await inserirCuponsValidos(
      client,
      cpf,
      [...mapaCupons.values()],
      criadoEm,
      config.pontosHabilitadoEm
    );

    cuponsCancelados = await marcarCuponsCancelados(
      client,
      cpf,
      chavesCanceladasWrpdv
    );

    cuponsConvenio = await marcarCuponsInelegiveisConvenio(
      client,
      cpf,
      chavesConvenioWrpdv
    );

    await garantirEstornosRegistrados(client, cpf);

    const recalculo = await recalcularPontosConta(client, cpf, dataMinima);
    saldoDepois = recalculo.saldo;

    await client.query("COMMIT");

    return {
      ok: true,
      novosCupons,
      cuponsCancelados,
      cuponsConvenio,
      pontosCreditados: Math.max(0, saldoDepois - saldoAntes),
      pontosEstornados: Math.max(0, saldoAntes - saldoDepois),
      saldo: saldoDepois,
      dataInicioPlataforma: dataInicioPontosBR(criadoEm, config.pontosHabilitadoEm),
      periodo: {
        dataini: formatarDataBR(inicio),
        datafim: formatarDataBR(fim),
      },
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
export async function sincronizarPontosDeItens(cpf, itens, criadoEm) {
  const elegiveis = filtrarItensAposCadastro(itens, criadoEm);
  const resultado = await reconciliarPontos(cpf, criadoEm, {
    cuponsExtras: ordenarItensPorDataAsc(elegiveis),
  });

  if (!resultado.ok) {
    return { ok: false, error: resultado.error };
  }

  return {
    ok: true,
    novosCupons: resultado.novosCupons,
    pontosCreditados: resultado.pontosCreditados,
    cuponsCancelados: resultado.cuponsCancelados,
    cuponsConvenio: resultado.cuponsConvenio,
    pontosEstornados: resultado.pontosEstornados,
  };
}

export async function sincronizarPontos(cpf, criadoEm) {
  const resultado = await reconciliarPontos(cpf, criadoEm);

  if (!resultado.ok) {
    return resultado;
  }

  return {
    ok: true,
    dataInicioPlataforma: resultado.dataInicioPlataforma,
    periodo: resultado.periodo,
    novosCupons: resultado.novosCupons,
    pontosCreditados: resultado.pontosCreditados,
    cuponsCancelados: resultado.cuponsCancelados,
    cuponsConvenio: resultado.cuponsConvenio,
    pontosEstornados: resultado.pontosEstornados,
  };
}

export async function obterSaldoPontos(cpf) {
  const { rows } = await getPool().query(
    `SELECT COALESCE(pc.saldo_pontos, 0)::int AS saldo,
            COALESCE(pc.valor_pendente, 0)::float AS valor_pendente,
            (SELECT COUNT(*)::int FROM pontos_movimento pm
             WHERE pm.cpf = $1
               AND pm.cancelado_em IS NULL
               AND pm.inelegivel_motivo IS NULL
               ${SQL_OCULTAR_CREDITO_MANUAL.replace("numero_dcto", "pm.numero_dcto")}) AS cupons
     FROM (SELECT $1::varchar AS cpf) u
     LEFT JOIN pontos_conta pc ON pc.cpf = u.cpf`,
    [cpf]
  );

  const saldo = rows[0]?.saldo ?? 0;
  const valorPendente = Number(rows[0]?.valor_pendente) || 0;
  const falta = valorPendente > 0 ? REAIS_POR_PONTO - valorPendente : REAIS_POR_PONTO;
  const expiracao = await obterProximaExpiracao(cpf);

  return {
    saldo,
    valorPendente: Math.round(valorPendente * 100) / 100,
    faltaParaProximoPonto: Math.round(falta * 100) / 100,
    cupons: rows[0]?.cupons ?? 0,
    validadeMeses: MESES_VALIDADE_PONTOS,
    proximaExpiracao: expiracao.proximaExpiracao,
    pontosProximaExpiracao: expiracao.pontosNaProximaExpiracao,
  };
}

export async function obterExtratoPontos(cpf, limite = 15) {
  const { rows } = await getPool().query(
    `SELECT numero_dcto, data_venda, valor_compra, processado_em, cancelado_em
     FROM pontos_movimento
     WHERE cpf = $1 AND cancelado_em IS NULL AND inelegivel_motivo IS NULL
       ${SQL_OCULTAR_CREDITO_MANUAL}
     ORDER BY data_venda DESC NULLS LAST, processado_em DESC
     LIMIT $2`,
    [cpf, limite]
  );

  return rows.map((row) => ({
    cupom: row.numero_dcto,
    cupomLabel: formatarCupomLabel(row.numero_dcto),
    data: formatarDataPg(row.data_venda),
    valorCompra: Number(row.valor_compra) || 0,
    processadoEm: row.processado_em,
    cancelada: false,
  }));
}

export async function obterMovimentosCompras(cpf, limite = 50) {
  const { rows } = await getPool().query(
    `SELECT numero_dcto, data_venda, valor_compra, processado_em, cancelado_em
     FROM pontos_movimento
     WHERE cpf = $1
       ${SQL_OCULTAR_CREDITO_MANUAL}
     ORDER BY COALESCE(cancelado_em, processado_em) DESC
     LIMIT $2`,
    [cpf, limite]
  );

  return rows.map((row) => ({
    cupom: row.numero_dcto,
    cupomLabel: formatarCupomLabel(row.numero_dcto),
    data: formatarDataPg(row.data_venda),
    valorCompra: Number(row.valor_compra) || 0,
    processadoEm: row.processado_em,
    canceladaEm: row.cancelado_em,
    cancelada: Boolean(row.cancelado_em),
  }));
}

export async function obterExtratoEstornos(cpf, limite = 50) {
  const { rows } = await getPool().query(
    `SELECT numero_dcto, pontos, valor_compra, data_venda, criado_em
     FROM pontos_estorno
     WHERE cpf = $1
     ORDER BY criado_em DESC
     LIMIT $2`,
    [cpf, limite]
  );

  return rows.map((row) => ({
    cupom: row.numero_dcto,
    cupomLabel: formatarCupomLabel(row.numero_dcto),
    pontos: Number(row.pontos) || 0,
    valorCompra: Number(row.valor_compra) || 0,
    dataVenda: formatarDataPg(row.data_venda),
    criadoEm: row.criado_em,
  }));
}

export async function obterHistoricoBaixas(cpf, limite = 20) {
  const { rows } = await getPool().query(
    `SELECT pb.id, pb.pontos, pb.saldo_antes, pb.saldo_depois, pb.observacao, pb.admin_usuario,
            pb.brinde_id, pb.brinde_nome, pb.brinde_imagem_url, pb.criado_em, pb.tipo,
            pb.comprovante_id, rc.codigo AS codigo_resgate,
            rc.assinatura_confirmada_em
     FROM pontos_baixa pb
     LEFT JOIN resgate_comprovante rc ON rc.id = pb.comprovante_id
     WHERE pb.cpf = $1
     ORDER BY pb.criado_em DESC
     LIMIT $2`,
    [cpf, limite]
  );

  return rows.map((row) => ({
    id: row.id,
    pontos: row.pontos,
    saldoAntes: row.saldo_antes,
    saldoDepois: row.saldo_depois,
    observacao: row.observacao,
    adminUsuario: row.admin_usuario,
    brindeId: row.brinde_id,
    brindeNome: row.brinde_nome,
    brindeImagemUrl: row.brinde_imagem_url,
    criadoEm: row.criado_em,
    tipo: row.tipo || "resgate",
    comprovanteId: row.comprovante_id,
    codigoResgate: row.codigo_resgate,
    assinaturaConfirmadaEm: row.assinatura_confirmada_em,
  }));
}

export async function obterHistoricoCompleto(cpf, limite = 40, criadoEm = null) {
  const [compras, estornos, resgates] = await Promise.all([
    obterMovimentosCompras(cpf, limite),
    obterExtratoEstornos(cpf, limite),
    obterHistoricoBaixas(cpf, limite),
  ]);

  function parseDataBR(dataStr) {
    const match = String(dataStr || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) return null;
    return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
  }

  let convenioItens = [];
  if (criadoEm) {
    const cuponsConvenio = await listarCuponsConvenioWrpdv(cpf, criadoEm);
    const chavesCompra = new Set(compras.map((c) => c.cupom));

    convenioItens = cuponsConvenio
      .filter((cupom) => !chavesCompra.has(cupom.chaveCupom))
      .map((cupom) => ({
        tipo: "convenio",
        id: `convenio-${cupom.chaveCupom}`,
        data: cupom.data,
        ordenacao: parseDataBR(cupom.data)?.getTime() || 0,
        cupom: cupom.chaveCupom,
        cupomLabel: formatarCupomLabel(cupom.chaveCupom),
        valorCompra: Number(cupom.valorTotalCupom) || 0,
      }));
  }

  const itens = [
    ...compras.map((c) => ({
      tipo: "compra",
      id: `compra-${c.cupom}`,
      data: c.data,
      ordenacao:
        parseDataBR(c.data)?.getTime() || new Date(c.processadoEm).getTime(),
      cupom: c.cupom,
      cupomLabel: c.cupomLabel,
      valorCompra: c.valorCompra,
      cancelada: c.cancelada,
      canceladaEm: c.canceladaEm,
    })),
    ...estornos.map((e) => ({
      tipo: "estorno",
      id: `estorno-${e.cupom}`,
      data: e.criadoEm,
      ordenacao: new Date(e.criadoEm).getTime(),
      cupom: e.cupom,
      cupomLabel: e.cupomLabel,
      pontos: e.pontos,
      valorCompra: e.valorCompra,
      dataVenda: e.dataVenda,
    })),
    ...resgates.map((r) => ({
      tipo: r.tipo === "expiracao" ? "expiracao" : "resgate",
      id: `${r.tipo === "expiracao" ? "expiracao" : "resgate"}-${r.id}`,
      data: r.criadoEm,
      ordenacao: new Date(r.criadoEm).getTime(),
      pontos: r.pontos,
      brindeId: r.brindeId,
      brindeNome: r.brindeNome,
      brindeImagemUrl: r.brindeImagemUrl,
      saldoAntes: r.saldoAntes,
      saldoDepois: r.saldoDepois,
      observacao: r.observacao,
      codigoResgate: r.codigoResgate,
      comprovanteId: r.comprovanteId,
      assinaturaConfirmadaEm: r.assinaturaConfirmadaEm,
    })),
    ...convenioItens,
  ]
    .sort((a, b) => b.ordenacao - a.ordenacao)
    .slice(0, limite);

  const comprasAtivas = compras.filter((c) => !c.cancelada);

  return {
    compras: comprasAtivas,
    estornos,
    resgates,
    timeline: itens,
    resumo: {
      totalCompras: comprasAtivas.length,
      totalCancelamentos: estornos.length,
      totalConvenio: convenioItens.length,
      pontosEstornados: estornos.reduce((acc, e) => acc + e.pontos, 0),
      totalResgates: resgates.filter((r) => r.tipo !== "expiracao").length,
      pontosResgatados: resgates
        .filter((r) => r.tipo !== "expiracao")
        .reduce((acc, r) => acc + r.pontos, 0),
      totalExpiracoes: resgates.filter((r) => r.tipo === "expiracao").length,
      pontosExpirados: resgates
        .filter((r) => r.tipo === "expiracao")
        .reduce((acc, r) => acc + r.pontos, 0),
    },
  };
}

async function listarCuponsConvenioWrpdv(cpf, criadoEm) {
  const inicio = inicioDiaCadastro(criadoEm);
  const fim = new Date();
  const janelas = gerarJanelasVendas(inicio, fim, MAX_DIAS_PERIODO);
  const mapa = new Map();

  for (const janela of janelas) {
    const resultado = await buscarCuponsResumoWrpdv(
      cpf,
      janela.dataini,
      janela.datafim
    );

    if (!resultado.ok) continue;

    for (const cupom of resultado.cupons) {
      if (!cupom.convenio || !cupom.chaveCupom) continue;
      if (!cupomAposCadastro({ data: cupom.data }, criadoEm)) continue;
      mapa.set(cupom.chaveCupom, cupom);
    }
  }

  return [...mapa.values()];
}

export async function registrarResgateBrinde(cpf, brindeId, opts) {
  const { registrarResgateComProvante } = await import("./resgateComprovanteService.js");
  const comprovante = await registrarResgateComProvante(cpf, [brindeId], opts);
  const item = comprovante.itens[0];
  return {
    id: item?.baixaId,
    pontos: item?.pontos,
    saldoAntes: comprovante.saldoAntes,
    saldoDepois: comprovante.saldoDepois,
    observacao: comprovante.observacao || item?.brindeNome,
    adminUsuario: comprovante.adminUsuario,
    criadoEm: comprovante.criadoEm,
    codigoResgate: comprovante.codigo,
    comprovante,
    brinde: {
      id: item?.brindeId,
      nome: item?.brindeNome,
      pontos: item?.pontos,
    },
  };
}

export async function obterDataMinimaPontosParaCpf(cpf) {
  const usuario = await buscarUsuarioPorCpf(cpf);
  if (!usuario?.criado_em) return null;
  return resolverDataMinimaPontos(usuario.criado_em);
}

export async function darBaixaPontos(cpf, pontos, { observacao, adminUsuario }) {
  const qtd = Number(pontos);
  if (!Number.isInteger(qtd) || qtd < 1) {
    throw new Error("Quantidade de pontos inválida");
  }

  const dataMinima = await obterDataMinimaPontosParaCpf(cpf);
  const client = await getPool().connect();

  try {
    await client.query("BEGIN");
    await ensurePontosConta(client, cpf);

    await client.query(
      `SELECT cpf FROM pontos_conta WHERE cpf = $1 FOR UPDATE`,
      [cpf]
    );

    const { saldo: saldoAntes, valorPendente } = await sincronizarLotesPontos(client, cpf, {
      dataMinima,
    });

    if (saldoAntes < qtd) {
      throw new Error(
        `Saldo insuficiente. O cliente possui ${saldoAntes} ponto${saldoAntes === 1 ? "" : "s"}.`
      );
    }

    const { rows: baixaRows } = await client.query(
      `INSERT INTO pontos_baixa (
         cpf, pontos, saldo_antes, saldo_depois, observacao, admin_usuario, tipo
       )
       VALUES ($1, $2, $3, $4, $5, $6, 'manual')
       RETURNING id, criado_em`,
      [cpf, qtd, saldoAntes, saldoAntes - qtd, observacao, adminUsuario]
    );

    const saldoDepois = await aplicarDebitoFifo(client, cpf, qtd, baixaRows[0].id);

    await client.query(
      `UPDATE pontos_baixa SET saldo_depois = $2 WHERE id = $1`,
      [baixaRows[0].id, saldoDepois]
    );

    await client.query(
      `UPDATE pontos_conta
       SET saldo_pontos = $2,
           valor_pendente = $3,
           atualizado_em = NOW()
       WHERE cpf = $1`,
      [cpf, saldoDepois, valorPendente]
    );

    await client.query("COMMIT");

    return {
      id: baixaRows[0].id,
      pontos: qtd,
      saldoAntes,
      saldoDepois,
      observacao,
      adminUsuario,
      criadoEm: baixaRows[0].criado_em,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Visão consolidada: pontos em circulação (clientes) × pontos custodiados em brindes (estoque).
 */
export async function obterResumoPontosBrindes() {
  const db = getPool();

  const [clientesRes, brindesRes, resgatesRes, usuariosRes] = await Promise.all([
    db.query(`
      SELECT
        COALESCE(SUM(saldo_pontos), 0)::int AS pontos_total,
        COUNT(*) FILTER (WHERE saldo_pontos > 0)::int AS com_saldo,
        COUNT(*)::int AS contas
      FROM pontos_conta
    `),
    db.query(`
      SELECT id, nome, pontos, estoque, valor, ativo, categoria
      FROM brindes
      ORDER BY ativo DESC, estoque DESC, pontos ASC, nome ASC
    `),
    db.query(`
      SELECT
        COALESCE(SUM(pontos), 0)::int AS pontos_resgatados,
        COUNT(*)::int AS total_resgates
      FROM pontos_baixa
    `),
    db.query(`SELECT COUNT(*)::int AS total FROM usuario`),
  ]);

  const pontosClientes = clientesRes.rows[0]?.pontos_total ?? 0;
  const clientesComPontos = clientesRes.rows[0]?.com_saldo ?? 0;
  const contasPontos = clientesRes.rows[0]?.contas ?? 0;
  const pontosResgatados = resgatesRes.rows[0]?.pontos_resgatados ?? 0;
  const totalResgates = resgatesRes.rows[0]?.total_resgates ?? 0;
  const clientesCadastrados = usuariosRes.rows[0]?.total ?? 0;

  let unidadesEstoque = 0;
  let pontosEmBrindes = 0;
  let valorEmBrindes = 0;
  let brindesDisponiveis = 0;

  const brindes = brindesRes.rows.map((row) => {
    const estoque = Number(row.estoque) || 0;
    const pontos = Number(row.pontos) || 0;
    const valor = row.valor != null ? Number(row.valor) : null;
    const ativo = Boolean(row.ativo);
    const pontosNoEstoque = estoque * pontos;
    const valorNoEstoque = valor != null ? estoque * valor : null;

    if (ativo && estoque > 0) {
      unidadesEstoque += estoque;
      pontosEmBrindes += pontosNoEstoque;
      brindesDisponiveis += 1;
      if (valorNoEstoque != null) {
        valorEmBrindes += valorNoEstoque;
      }
    }

    return {
      id: row.id,
      nome: row.nome,
      categoria: row.categoria,
      pontos,
      estoque,
      valor,
      ativo,
      pontosNoEstoque,
      valorNoEstoque:
        valorNoEstoque != null ? Math.round(valorNoEstoque * 100) / 100 : null,
    };
  });

  const deficitPontos = Math.max(0, pontosClientes - pontosEmBrindes);
  const excedentePontos = Math.max(0, pontosEmBrindes - pontosClientes);
  const coberturaPercentual =
    pontosClientes > 0
      ? Math.min(100, Math.round((pontosEmBrindes / pontosClientes) * 100))
      : pontosEmBrindes > 0
        ? 100
        : 0;

  return {
    clientes: {
      cadastrados: clientesCadastrados,
      comContaPontos: contasPontos,
      comSaldo: clientesComPontos,
    },
    pontos: {
      emCirculacao: pontosClientes,
      equivalenteReais: pontosClientes * REAIS_POR_PONTO,
      passivoBrindesReais:
        Math.round(pontosClientes * VALOR_REFERENCIA_PONTO * 100) / 100,
      resgatados: pontosResgatados,
      totalResgates,
    },
    brindes: {
      disponiveis: brindesDisponiveis,
      unidadesEstoque,
      pontosNoEstoque: pontosEmBrindes,
      coberturaBrindesReais:
        Math.round(pontosEmBrindes * VALOR_REFERENCIA_PONTO * 100) / 100,
      valorNoEstoque: Math.round(valorEmBrindes * 100) / 100,
      itens: brindes,
    },
    balanco: {
      deficitPontos,
      excedentePontos,
      deficitReais:
        Math.round(deficitPontos * VALOR_REFERENCIA_PONTO * 100) / 100,
      coberturaPercentual,
      coberto: deficitPontos === 0,
    },
    reaisPorPonto: REAIS_POR_PONTO,
    valorReferenciaPonto: VALOR_REFERENCIA_PONTO,
  };
}
