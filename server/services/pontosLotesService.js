import { getPool } from "../db.js";

export const MESES_VALIDADE_PONTOS = Number(process.env.PONTOS_VALIDADE_MESES || 12);
const REAIS_POR_PONTO = 50;

function addMeses(data, meses) {
  const d = new Date(data);
  d.setMonth(d.getMonth() + meses);
  return d;
}

function dataCompraParaEarnedAt(compra) {
  if (compra.data_venda) {
    const d = new Date(compra.data_venda);
    if (!Number.isNaN(d.getTime())) return d;
  }
  if (compra.processado_em) {
    return new Date(compra.processado_em);
  }
  return new Date();
}

async function carregarComprasAtivas(client, cpf, dataMinima = null) {
  const { rows } = await client.query(
    `SELECT id, numero_dcto, valor_compra, data_venda, processado_em
     FROM pontos_movimento
     WHERE cpf = $1
       AND cancelado_em IS NULL
       AND inelegivel_motivo IS NULL
       AND ($2::date IS NULL OR data_venda >= $2::date)
     ORDER BY data_venda ASC NULLS LAST, id ASC`,
    [cpf, dataMinima]
  );
  return rows;
}

async function somarSaldoLotesValidos(client, cpf) {
  const { rows } = await client.query(
    `SELECT COALESCE(SUM(saldo_restante), 0)::int AS saldo
     FROM pontos_lote
     WHERE cpf = $1
       AND saldo_restante > 0
       AND expirado_em IS NULL
       AND expires_at > NOW()`,
    [cpf]
  );
  return Number(rows[0]?.saldo) || 0;
}

async function gerarLotesDeCompras(client, cpf, compras) {
  let valorPendente = 0;
  let lotesCriados = 0;

  for (const compra of compras) {
    valorPendente += Number(compra.valor_compra) || 0;
    while (valorPendente >= REAIS_POR_PONTO) {
      valorPendente -= REAIS_POR_PONTO;
      const earnedAt = dataCompraParaEarnedAt(compra);
      const expiresAt = addMeses(earnedAt, MESES_VALIDADE_PONTOS);

      await client.query(
        `INSERT INTO pontos_lote (
           cpf, saldo_restante, earned_at, expires_at, origin_movimento_id
         )
         VALUES ($1, 1, $2, $3, $4)`,
        [cpf, earnedAt, expiresAt, compra.id]
      );
      lotesCriados += 1;
    }
  }

  return {
    valorPendente: Math.round(valorPendente * 100) / 100,
    lotesCriados,
  };
}

async function debitarFifo(client, cpf, quantidade, baixaId) {
  let restante = quantidade;

  const { rows: lotes } = await client.query(
    `SELECT id, saldo_restante
     FROM pontos_lote
     WHERE cpf = $1
       AND saldo_restante > 0
       AND expirado_em IS NULL
       AND expires_at > NOW()
     ORDER BY earned_at ASC, id ASC
     FOR UPDATE`,
    [cpf]
  );

  for (const lote of lotes) {
    if (restante <= 0) break;

    const usar = Math.min(restante, Number(lote.saldo_restante));
    if (usar <= 0) continue;

    await client.query(
      `UPDATE pontos_lote
       SET saldo_restante = saldo_restante - $2
       WHERE id = $1`,
      [lote.id, usar]
    );

    await client.query(
      `INSERT INTO pontos_baixa_lote (baixa_id, lote_id, pontos)
       VALUES ($1, $2, $3)
       ON CONFLICT (baixa_id, lote_id) DO UPDATE SET pontos = EXCLUDED.pontos`,
      [baixaId, lote.id, usar]
    );

    restante -= usar;
  }

  if (restante > 0) {
    throw new Error(
      `Saldo em lotes válidos insuficiente (faltam ${restante} ponto${restante === 1 ? "" : "s"}).`
    );
  }
}

async function expirarLotesAte(client, cpf, dataLimite, { criarBaixa = true } = {}) {
  const { rows: vencidos } = await client.query(
    `SELECT id, saldo_restante, expires_at
     FROM pontos_lote
     WHERE cpf = $1
       AND saldo_restante > 0
       AND expirado_em IS NULL
       AND expires_at <= $2
     ORDER BY expires_at ASC, id ASC
     FOR UPDATE`,
    [cpf, dataLimite]
  );

  if (!vencidos.length) {
    return { pontosExpirados: 0, baixaId: null };
  }

  let totalExpirados = 0;
  const alocacoes = [];

  for (const lote of vencidos) {
    const qtd = Number(lote.saldo_restante) || 0;
    if (qtd <= 0) continue;

    totalExpirados += qtd;
    alocacoes.push({ loteId: lote.id, pontos: qtd });

    await client.query(
      `UPDATE pontos_lote
       SET saldo_restante = 0,
           expirado_em = COALESCE(expirado_em, $2)
       WHERE id = $1`,
      [lote.id, dataLimite]
    );
  }

  if (totalExpirados <= 0 || !criarBaixa) {
    return { pontosExpirados: totalExpirados, baixaId: null };
  }

  const saldoValido = await somarSaldoLotesValidos(client, cpf);
  const saldoDepois = saldoValido;
  const saldoAntes = saldoDepois + totalExpirados;

  const observacao =
    `${totalExpirados} ponto${totalExpirados === 1 ? "" : "s"} expirado${totalExpirados === 1 ? "" : "s"} ` +
    `por não utilização dentro do prazo de ${MESES_VALIDADE_PONTOS} meses.`;

  const { rows: baixaRows } = await client.query(
    `INSERT INTO pontos_baixa (
       cpf, pontos, saldo_antes, saldo_depois, observacao, admin_usuario, tipo
     )
     VALUES ($1, $2, $3, $4, $5, 'sistema', 'expiracao')
     RETURNING id`,
    [cpf, totalExpirados, saldoAntes, saldoDepois, observacao]
  );

  const baixaId = baixaRows[0].id;

  for (const item of alocacoes) {
    await client.query(
      `INSERT INTO pontos_baixa_lote (baixa_id, lote_id, pontos)
       VALUES ($1, $2, $3)
       ON CONFLICT (baixa_id, lote_id) DO NOTHING`,
      [baixaId, item.loteId, item.pontos]
    );
  }

  return { pontosExpirados: totalExpirados, baixaId };
}

/**
 * Reconstrói lotes a partir das compras, reaplica baixas em ordem cronológica
 * (com expirações antes de cada débito) e expira o restante vencido.
 */
export async function sincronizarLotesPontos(client, cpf, { dataMinima = null } = {}) {
  await client.query(
    `DELETE FROM pontos_baixa_lote
     WHERE baixa_id IN (SELECT id FROM pontos_baixa WHERE cpf = $1)`,
    [cpf]
  );
  await client.query(`DELETE FROM pontos_lote WHERE cpf = $1`, [cpf]);
  await client.query(`DELETE FROM pontos_baixa WHERE cpf = $1 AND tipo = 'expiracao'`, [cpf]);

  const compras = await carregarComprasAtivas(client, cpf, dataMinima);
  const { valorPendente } = await gerarLotesDeCompras(client, cpf, compras);

  const { rows: baixas } = await client.query(
    `SELECT id, pontos, criado_em
     FROM pontos_baixa
     WHERE cpf = $1
       AND COALESCE(tipo, 'resgate') IN ('resgate', 'manual')
     ORDER BY criado_em ASC, id ASC`,
    [cpf]
  );

  for (const baixa of baixas) {
    const momento = new Date(baixa.criado_em);
    await expirarLotesAte(client, cpf, momento, { criarBaixa: true });
    await debitarFifo(client, cpf, Number(baixa.pontos), baixa.id);
  }

  await expirarLotesAte(client, cpf, new Date(), { criarBaixa: true });

  const saldo = await somarSaldoLotesValidos(client, cpf);

  return { saldo, valorPendente };
}

export async function aplicarDebitoFifo(client, cpf, quantidade, baixaId) {
  await expirarLotesAte(client, cpf, new Date(), { criarBaixa: true });
  await debitarFifo(client, cpf, quantidade, baixaId);
  return somarSaldoLotesValidos(client, cpf);
}

export async function obterProximaExpiracao(cpf) {
  const { rows } = await getPool().query(
    `SELECT expires_at AS proxima,
            COALESCE(SUM(saldo_restante), 0)::int AS pontos
     FROM pontos_lote
     WHERE cpf = $1
       AND saldo_restante > 0
       AND expirado_em IS NULL
       AND expires_at > NOW()
     GROUP BY expires_at
     ORDER BY expires_at ASC
     LIMIT 1`,
    [cpf]
  );

  if (!rows[0]?.proxima) {
    return { proximaExpiracao: null, pontosNaProximaExpiracao: 0 };
  }

  return {
    proximaExpiracao: rows[0].proxima,
    pontosNaProximaExpiracao: rows[0].pontos ?? 0,
  };
}
