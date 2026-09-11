import { getPool } from "../db.js";
import { obterProdutoAdmin } from "./padariaProdutosService.js";
import { obterConfigPadaria } from "./padariaConfigService.js";
import { registrarAuditoriaPadaria } from "./padariaAuditoriaService.js";
import {
  listarDecoracoesPorProduto,
  obterDecoracao,
  baixarEstoqueDecoracao,
} from "./padariaDecoracoesService.js";
import {
  agora,
  anoBrasilia,
  dataBrasiliaISO,
  instanteBrasilia,
} from "../utils/fusoBrasilia.js";

const STATUS_VALIDOS = new Set([
  "novo",
  "em_producao",
  "pronto",
  "entregue",
  "cancelado",
]);

/** Transições permitidas (backend é a fonte da verdade). */
export const TRANSICOES_PEDIDO = {
  novo: ["em_producao", "cancelado"],
  em_producao: ["pronto", "cancelado", "novo"],
  pronto: ["entregue", "em_producao"],
  entregue: [],
  cancelado: [],
};

const TRANSICOES = TRANSICOES_PEDIDO;

export function podeTransicionarStatus(de, para) {
  return Boolean(TRANSICOES[de]?.includes(para));
}

const MOTIVOS_CANCELAMENTO = new Set([
  "cliente_desistiu",
  "erro_pedido",
  "falta_ingrediente",
  "problema_operacional",
  "outro",
]);

export const MOTIVOS_CANCELAMENTO_LABEL = {
  cliente_desistiu: "Cliente desistiu",
  erro_pedido: "Erro no pedido",
  falta_ingrediente: "Falta de ingrediente",
  problema_operacional: "Problema operacional",
  outro: "Outro",
};

function arredondarMoeda(valor) {
  return Math.round(Number(valor) * 100) / 100;
}

function mapItem(row) {
  return {
    id: row.id,
    produtoCodigo: row.produto_codigo,
    nome: row.nome_snapshot,
    quantidade: Number(row.quantidade),
    precoUnitario: Number(row.preco_unitario),
    unidade: row.unidade,
    subtotal: Number(row.subtotal),
    cobertura: row.cobertura,
    recheio: row.recheio,
    obsItem: row.obs_item,
    decoracaoId: row.decoracao_id || null,
    decoracaoCodigo: row.decoracao_codigo || null,
    decoracaoNome: row.decoracao_nome || null,
    decoracaoPreco: Number(row.decoracao_preco) || 0,
  };
}

function mapPedido(row, itens = []) {
  if (!row) return null;
  return {
    id: row.id,
    codigoPublico: row.codigo_publico,
    clienteNome: row.cliente_nome,
    clienteCpf: row.cliente_cpf,
    clienteTelefone: row.cliente_telefone,
    dataRetirada: row.data_retirada,
    horaRetirada: String(row.hora_retirada || "").slice(0, 5),
    status: row.status,
    observacao: row.observacao,
    criadoPor: row.criado_por,
    criadoPorNome: row.criado_por_nome || null,
    prontoEm: row.pronto_em,
    prontoPor: row.pronto_por,
    prontoPorNome: row.pronto_por_nome || null,
    entregueEm: row.entregue_em || null,
    entreguePor: row.entregue_por || null,
    entreguePorNome: row.entregue_por_nome || null,
    canceladoEm: row.cancelado_em || null,
    canceladoPor: row.cancelado_por || null,
    canceladoPorNome: row.cancelado_por_nome || null,
    motivoCancelamento: row.motivo_cancelamento || null,
    motivoCancelamentoLabel: row.motivo_cancelamento
      ? MOTIVOS_CANCELAMENTO_LABEL[row.motivo_cancelamento] || row.motivo_cancelamento
      : null,
    criadoEm: row.criado_em,
    atualizadoEm: row.atualizado_em,
    itens,
    total: itens.reduce((acc, i) => acc + (Number(i.subtotal) || 0), 0),
  };
}

const SELECT_PEDIDO = `
  SELECT p.*,
         cu.nome AS criado_por_nome,
         pu.nome AS pronto_por_nome,
         eu.nome AS entregue_por_nome,
         kau.nome AS cancelado_por_nome
  FROM padaria_pedido p
  LEFT JOIN padaria_usuario cu ON cu.id = p.criado_por
  LEFT JOIN padaria_usuario pu ON pu.id = p.pronto_por
  LEFT JOIN padaria_usuario eu ON eu.id = p.entregue_por
  LEFT JOIN padaria_usuario kau ON kau.id = p.cancelado_por
`;

async function gerarCodigoPublico(client) {
  const ano = anoBrasilia();
  const { rows } = await client.query(
    `INSERT INTO padaria_pedido_seq (ano, ultimo)
     VALUES ($1, 1)
     ON CONFLICT (ano) DO UPDATE
     SET ultimo = padaria_pedido_seq.ultimo + 1
     RETURNING ultimo`,
    [ano]
  );
  const seq = rows[0].ultimo;
  return `PAD-${ano}-${String(seq).padStart(6, "0")}`;
}

async function carregarItensPorPedidos(pedidoIds) {
  if (!pedidoIds.length) return new Map();
  const { rows } = await getPool().query(
    `SELECT * FROM padaria_pedido_item
     WHERE pedido_id = ANY($1::int[])
     ORDER BY id`,
    [pedidoIds]
  );
  const map = new Map();
  for (const row of rows) {
    const lista = map.get(row.pedido_id) || [];
    lista.push(mapItem(row));
    map.set(row.pedido_id, lista);
  }
  return map;
}

async function carregarPedidoCompleto(id) {
  const { rows } = await getPool().query(
    `${SELECT_PEDIDO} WHERE p.id = $1`,
    [id]
  );
  if (!rows[0]) return null;
  const itensMap = await carregarItensPorPedidos([Number(id)]);
  return mapPedido(rows[0], itensMap.get(Number(id)) || []);
}

function parseHora(hora) {
  const raw = String(hora || "").trim();
  let m = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?/);
  if (!m) {
    const digits = raw.replace(/\D/g, "");
    if (digits.length === 3 || digits.length === 4) {
      const padded = digits.padStart(4, "0");
      m = [null, padded.slice(0, 2), padded.slice(2)];
    }
  }
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/** Aceita YYYY-MM-DD ou DD-MM-YYYY / DD/MM/YYYY. */
function normalizarDataIso(valor) {
  const s = String(valor || "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (!m) return null;
  const dia = String(m[1]).padStart(2, "0");
  const mes = String(m[2]).padStart(2, "0");
  const ano = m[3];
  const n = Number(ano);
  const mo = Number(mes);
  const d = Number(dia);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || n < 2000) return null;
  return `${ano}-${mes}-${dia}`;
}

function formatarHoraHHMM(minutos) {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

async function validarRetirada(dataRetirada, horaRetirada) {
  const config = await obterConfigPadaria();
  const data = normalizarDataIso(dataRetirada);
  if (!data) {
    throw new Error("Data de retirada inválida. Use o formato dia-mês-ano (ex.: 31-08-2026).");
  }

  const minutos = parseHora(horaRetirada);
  if (minutos == null) {
    throw new Error("Hora de retirada inválida. Use o formato 24h (ex.: 16:30).");
  }
  const hora = formatarHoraHHMM(minutos);

  const inicio = parseHora(config.horario_retirada_inicio || "08:00");
  const fim = parseHora(config.horario_retirada_fim || "19:00");
  if (inicio != null && fim != null && (minutos < inicio || minutos > fim)) {
    throw new Error(
      `Horário de retirada deve ser entre ${config.horario_retirada_inicio} e ${config.horario_retirada_fim} (24h).`
    );
  }

  const agoraDt = agora();
  const retirada = instanteBrasilia(data, hora);
  if (!retirada || Number.isNaN(retirada.getTime())) {
    throw new Error("Data de retirada inválida");
  }

  const antecedenciaHoras = Number(config.antecedencia_minima_horas);
  const margemMs =
    Number.isFinite(antecedenciaHoras) && antecedenciaHoras > 0
      ? antecedenciaHoras * 60 * 60 * 1000
      : 0;

  if (retirada.getTime() < agoraDt.getTime() - 60 * 1000) {
    throw new Error(
      "Não é possível criar pedido com retirada no passado. Escolha data e hora futuras."
    );
  }
  if (margemMs > 0 && retirada.getTime() < agoraDt.getTime() + margemMs) {
    throw new Error(
      `Retirada deve ter ao menos ${antecedenciaHoras}h de antecedência em relação ao horário atual.`
    );
  }

  return { data, hora };
}

export async function criarPedido({
  clienteNome,
  clienteCpf,
  clienteTelefone,
  dataRetirada,
  horaRetirada,
  observacao,
  itens,
  criadoPorId,
  criadoPorNome,
}) {
  const nome = String(clienteNome || "").trim();
  if (!nome) throw new Error("Informe o nome do cliente");
  if (!dataRetirada) throw new Error("Informe a data de retirada");
  if (!horaRetirada) throw new Error("Informe a hora de retirada");
  if (!Array.isArray(itens) || itens.length === 0) {
    throw new Error("Adicione ao menos um item ao pedido");
  }

  const retiradaOk = await validarRetirada(dataRetirada, horaRetirada);
  const dataRetiradaIso = retiradaOk.data;
  const horaRetiradaNorm = retiradaOk.hora;

  const itensValidados = [];
  for (const raw of itens) {
    const codigo = String(raw.produtoCodigo || raw.codigo || "").trim();
    const qtd = Number(raw.quantidade);
    if (!codigo) throw new Error("Item sem código de produto");
    if (!(qtd > 0)) throw new Error(`Quantidade inválida para ${codigo}`);

    const produto = await obterProdutoAdmin(codigo);
    if (!produto || !produto.ativoCatalogo || !produto.ativoRp) {
      throw new Error(`Produto ${codigo} não está disponível no catálogo`);
    }

    const unidade = produto.vendaPorKg ? "KG" : produto.unidadeMedida || "UN";
    const preco = Number(produto.preco) || 0;
    if (!(preco >= 0)) throw new Error(`Preço inválido para ${codigo}`);

    const decoracoesAtivas = await listarDecoracoesPorProduto(produto.codigo, {
      apenasAtivas: true,
    });
    let decoracaoId = null;
    let decoracaoCodigo = null;
    let decoracaoNome = null;
    let decoracaoPreco = 0;

    const rawDecoId = Number(raw.decoracaoId || raw.decoracao_id || 0);
    const rawDecoCodigo = String(
      raw.decoracaoCodigo || raw.decoracao_codigo || ""
    ).trim();

    // Decoração é opcional: padrão = bolo sem decoração
    if (rawDecoId || rawDecoCodigo) {
      let escolhida = null;
      if (rawDecoId) {
        escolhida = decoracoesAtivas.find((d) => d.id === rawDecoId) || null;
      } else if (rawDecoCodigo) {
        escolhida =
          decoracoesAtivas.find(
            (d) =>
              String(d.codigo || "").toLowerCase() === rawDecoCodigo.toLowerCase()
          ) || null;
      }
      if (!escolhida) {
        const deco = rawDecoId ? await obterDecoracao(rawDecoId) : null;
        if (
          deco &&
          deco.ativo &&
          (deco.global || deco.produtoCodigo === produto.codigo)
        ) {
          escolhida = deco;
        }
      }
      if (!escolhida) {
        throw new Error(
          `Decoração inválida para o produto ${produto.nome}`
        );
      }
      if (escolhida.controlaEstoque && !escolhida.disponivel) {
        throw new Error(
          `Decoração “${escolhida.nome}” sem estoque no momento`
        );
      }
      decoracaoId = escolhida.id;
      decoracaoCodigo = escolhida.codigo || null;
      decoracaoNome = escolhida.nome;
      decoracaoPreco = Number(escolhida.preco) || 0;
    }

    const subtotal = arredondarMoeda(
      produto.vendaPorKg
        ? preco * qtd + decoracaoPreco
        : (preco + decoracaoPreco) * qtd
    );

    itensValidados.push({
      produtoCodigo: produto.codigo,
      nomeSnapshot: produto.nome,
      quantidade: qtd,
      precoUnitario: preco,
      unidade,
      subtotal,
      cobertura: String(raw.cobertura || produto.cobertura || "").trim() || null,
      recheio: String(raw.recheio || produto.recheio || "").trim() || null,
      obsItem: String(raw.obsItem || "").trim() || null,
      decoracaoId,
      decoracaoCodigo,
      decoracaoNome,
      decoracaoPreco,
    });
  }

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const codigoPublico = await gerarCodigoPublico(client);
    const { rows } = await client.query(
      `INSERT INTO padaria_pedido (
         codigo_publico, cliente_nome, cliente_cpf, cliente_telefone,
         data_retirada, hora_retirada, observacao, criado_por, status
       ) VALUES ($1, $2, $3, $4, $5::date, $6::time, $7, $8, 'novo')
       RETURNING id`,
      [
        codigoPublico,
        nome,
        String(clienteCpf || "").replace(/\D/g, "") || null,
        String(clienteTelefone || "").trim() || null,
        String(dataRetiradaIso).slice(0, 10),
        String(horaRetiradaNorm).slice(0, 5),
        String(observacao || "").trim() || null,
        criadoPorId || null,
      ]
    );
    const pedidoId = rows[0].id;

    for (const item of itensValidados) {
      await client.query(
        `INSERT INTO padaria_pedido_item (
           pedido_id, produto_codigo, nome_snapshot, quantidade,
           preco_unitario, unidade, subtotal, cobertura, recheio, obs_item,
           decoracao_id, decoracao_codigo, decoracao_nome, decoracao_preco
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          pedidoId,
          item.produtoCodigo,
          item.nomeSnapshot,
          item.quantidade,
          item.precoUnitario,
          item.unidade,
          item.subtotal,
          item.cobertura,
          item.recheio,
          item.obsItem,
          item.decoracaoId,
          item.decoracaoCodigo,
          item.decoracaoNome,
          item.decoracaoPreco,
        ]
      );
      if (item.decoracaoId) {
        const unidadesEstoque = item.unidade === "KG"
          ? 1
          : Math.max(1, Math.round(Number(item.quantidade) || 1));
        await baixarEstoqueDecoracao(client, item.decoracaoId, unidadesEstoque);
      }
    }

    await client.query("COMMIT");
    const pedido = await carregarPedidoCompleto(pedidoId);
    await registrarAuditoriaPadaria({
      usuarioId: criadoPorId,
      usuarioNome: criadoPorNome,
      acao: "pedido_criado",
      entidade: "pedido",
      entidadeId: pedidoId,
      dados: { codigoPublico, total: pedido?.total, itens: itensValidados.length },
    });
    return pedido;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Pedidos ativos na mesma data cuja hora de retirada cai em ±janelaMinutos
 * da hora informada (padrão 15). Usado no alerta do atendente.
 */
export async function listarPedidosConflitoHorario({
  dataRetirada,
  horaRetirada,
  janelaMinutos = 15,
} = {}) {
  const data = normalizarDataIso(dataRetirada);
  if (!data) throw new Error("Data de retirada inválida");
  const minutosAlvo = parseHora(horaRetirada);
  if (minutosAlvo == null) throw new Error("Hora de retirada inválida");
  const hora = formatarHoraHHMM(minutosAlvo);
  const janela = Math.min(Math.max(Number(janelaMinutos) || 15, 1), 120);

  const { rows } = await getPool().query(
    `${SELECT_PEDIDO}
     WHERE p.data_retirada = $1::date
       AND p.status NOT IN ('cancelado', 'entregue')
       AND ABS(
         EXTRACT(EPOCH FROM (p.hora_retirada - $2::time)) / 60.0
       ) <= $3
     ORDER BY p.hora_retirada ASC, p.id ASC
     LIMIT 30`,
    [data, hora, janela]
  );

  const itensMap = await carregarItensPorPedidos(rows.map((r) => r.id));
  const pedidos = rows.map((row) => {
    const pedido = mapPedido(row, itensMap.get(row.id) || []);
    const mins = parseHora(pedido.horaRetirada) ?? 0;
    pedido.minutosDiferenca = mins - minutosAlvo;
    return pedido;
  });

  return {
    data,
    hora,
    janelaMinutos: janela,
    temConflito: pedidos.length > 0,
    pedidos,
  };
}

export async function listarPedidos({
  status,
  dataRetirada,
  dataInicio,
  dataFim,
  busca,
  limite = 50,
  offset = 0,
} = {}) {
  const conds = [];
  const params = [];
  let i = 1;

  if (status && STATUS_VALIDOS.has(status)) {
    conds.push(`p.status = $${i++}`);
    params.push(status);
  }
  if (dataRetirada) {
    conds.push(`p.data_retirada = $${i++}::date`);
    params.push(dataRetirada);
  }
  if (dataInicio) {
    conds.push(`p.data_retirada >= $${i++}::date`);
    params.push(dataInicio);
  }
  if (dataFim) {
    conds.push(`p.data_retirada <= $${i++}::date`);
    params.push(dataFim);
  }
  if (busca?.trim()) {
    conds.push(
      `(p.cliente_nome ILIKE $${i} OR p.codigo_publico ILIKE $${i} OR COALESCE(p.cliente_cpf, '') LIKE $${i} OR COALESCE(p.cliente_telefone, '') ILIKE $${i})`
    );
    params.push(`%${busca.trim()}%`);
    i += 1;
  }

  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  const lim = Math.min(Math.max(Number(limite) || 50, 1), 200);
  const off = Math.max(Number(offset) || 0, 0);

  const countRes = await getPool().query(
    `SELECT COUNT(*)::int AS total FROM padaria_pedido p ${where}`,
    params
  );

  params.push(lim, off);
  const { rows } = await getPool().query(
    `${SELECT_PEDIDO}
     ${where}
     ORDER BY p.data_retirada DESC, p.hora_retirada DESC, p.id DESC
     LIMIT $${i} OFFSET $${i + 1}`,
    params
  );

  const itensMap = await carregarItensPorPedidos(rows.map((r) => r.id));
  const pedidos = rows.map((row) => mapPedido(row, itensMap.get(row.id) || []));

  return {
    pedidos,
    total: countRes.rows[0]?.total ?? 0,
    limite: lim,
    offset: off,
  };
}

export async function obterPedido(id) {
  return carregarPedidoCompleto(Number(id));
}

export async function obterPedidoPorCodigo(codigo) {
  const { rows } = await getPool().query(
    `${SELECT_PEDIDO} WHERE p.codigo_publico = $1`,
    [String(codigo || "").trim().toUpperCase()]
  );
  if (!rows[0]) return null;
  const itensMap = await carregarItensPorPedidos([rows[0].id]);
  return mapPedido(rows[0], itensMap.get(rows[0].id) || []);
}

export async function buscarClientePorTelefone(telefone) {
  const tel = String(telefone || "").replace(/\D/g, "");
  if (tel.length < 8) return null;
  const { rows } = await getPool().query(
    `SELECT cliente_nome, cliente_telefone, cliente_cpf
     FROM padaria_pedido
     WHERE regexp_replace(COALESCE(cliente_telefone, ''), '\\D', '', 'g') LIKE $1
     ORDER BY criado_em DESC
     LIMIT 1`,
    [`%${tel.slice(-8)}`]
  );
  if (!rows[0]) return null;
  return {
    nome: rows[0].cliente_nome,
    telefone: rows[0].cliente_telefone,
    cpf: rows[0].cliente_cpf,
  };
}

export async function listarProducaoDoDia(data) {
  const dataRef = data || dataBrasiliaISO();
  const { rows } = await getPool().query(
    `${SELECT_PEDIDO}
     WHERE p.data_retirada = $1::date
       AND p.status IN ('novo', 'em_producao', 'pronto')
     ORDER BY p.hora_retirada ASC, p.id ASC`,
    [dataRef]
  );

  const itensMap = await carregarItensPorPedidos(rows.map((r) => r.id));
  const agoraDt = agora();
  const pedidos = rows.map((row) => {
    const pedido = mapPedido(row, itensMap.get(row.id) || []);
    const retirada = instanteBrasilia(dataRef, pedido.horaRetirada || "00:00");
    const diffMin = retirada
      ? Math.round((retirada.getTime() - agoraDt.getTime()) / 60000)
      : 0;
    pedido.minutosParaRetirada = diffMin;
    pedido.atrasado = diffMin < 0 && pedido.status !== "pronto";
    pedido.urgente = diffMin >= 0 && diffMin <= 30;
    return pedido;
  });

  const cancelados = await listarCanceladosDoDia(dataRef);

  return {
    data: dataRef,
    pedidos,
    cancelados: cancelados.pedidos,
    resumo: {
      novo: pedidos.filter((p) => p.status === "novo").length,
      emProducao: pedidos.filter((p) => p.status === "em_producao").length,
      pronto: pedidos.filter((p) => p.status === "pronto").length,
      cancelados: cancelados.pedidos.length,
    },
  };
}

/** Cancelamentos do dia (alerta persistente na tela de produção). */
export async function listarCanceladosDoDia(data) {
  const dataRef = data || dataBrasiliaISO();
  const { rows } = await getPool().query(
    `${SELECT_PEDIDO}
     WHERE p.data_retirada = $1::date
       AND p.status = 'cancelado'
     ORDER BY COALESCE(p.cancelado_em, p.atualizado_em) DESC, p.id DESC
     LIMIT 50`,
    [dataRef]
  );
  const itensMap = await carregarItensPorPedidos(rows.map((r) => r.id));
  return {
    data: dataRef,
    pedidos: rows.map((row) => mapPedido(row, itensMap.get(row.id) || [])),
  };
}

export async function obterDashboardPadaria(data) {
  const dataRef = data || dataBrasiliaISO();
  const { rows: contagem } = await getPool().query(
    `SELECT status, COUNT(*)::int AS qtd
     FROM padaria_pedido
     WHERE data_retirada = $1::date
     GROUP BY status`,
    [dataRef]
  );
  const porStatus = Object.fromEntries(
    contagem.map((r) => [r.status, r.qtd])
  );

  const { rows: proximas } = await getPool().query(
    `SELECT codigo_publico, cliente_nome, hora_retirada, status
     FROM padaria_pedido
     WHERE data_retirada = $1::date
       AND status IN ('novo', 'em_producao', 'pronto')
     ORDER BY hora_retirada ASC
     LIMIT 8`,
    [dataRef]
  );

  return {
    data: dataRef,
    totais: {
      hoje:
        (porStatus.novo || 0) +
        (porStatus.em_producao || 0) +
        (porStatus.pronto || 0) +
        (porStatus.entregue || 0) +
        (porStatus.cancelado || 0),
      novos: porStatus.novo || 0,
      emProducao: porStatus.em_producao || 0,
      prontos: porStatus.pronto || 0,
      entregues: porStatus.entregue || 0,
      cancelados: porStatus.cancelado || 0,
    },
    proximasRetiradas: proximas.map((r) => ({
      codigoPublico: r.codigo_publico,
      clienteNome: r.cliente_nome,
      horaRetirada: String(r.hora_retirada || "").slice(0, 5),
      status: r.status,
    })),
  };
}

export async function atualizarStatusPedido(
  id,
  status,
  usuarioId,
  { motivoCancelamento = null, usuarioNome = null } = {}
) {
  if (!STATUS_VALIDOS.has(status)) {
    throw new Error("Status inválido");
  }

  const atual = await obterPedido(id);
  if (!atual) throw new Error("Pedido não encontrado");

  if (!TRANSICOES[atual.status]?.includes(status)) {
    throw new Error(
      `Não é possível mudar de "${atual.status}" para "${status}"`
    );
  }

  if (status === "cancelado") {
    const motivo = String(motivoCancelamento || "").trim();
    if (!motivo || !MOTIVOS_CANCELAMENTO.has(motivo)) {
      throw new Error(
        "Informe o motivo do cancelamento (cliente_desistiu, erro_pedido, falta_ingrediente, problema_operacional ou outro)"
      );
    }
  }

  const sets = ["status = $1", "atualizado_em = NOW()"];
  const params = [status];
  let i = 2;

  if (status === "pronto") {
    sets.push(`pronto_em = NOW()`, `pronto_por = $${i++}`);
    params.push(usuarioId || null);
  }
  if (status === "entregue") {
    sets.push(`entregue_em = NOW()`, `entregue_por = $${i++}`);
    params.push(usuarioId || null);
  }
  if (status === "cancelado") {
    sets.push(
      `cancelado_em = NOW()`,
      `cancelado_por = $${i++}`,
      `motivo_cancelamento = $${i++}`
    );
    params.push(usuarioId || null, motivoCancelamento);
  }

  params.push(id);
  await getPool().query(
    `UPDATE padaria_pedido SET ${sets.join(", ")} WHERE id = $${i}`,
    params
  );

  const pedido = await obterPedido(id);
  await registrarAuditoriaPadaria({
    usuarioId,
    usuarioNome,
    acao:
      status === "cancelado"
        ? "pedido_cancelado"
        : status === "entregue"
          ? "pedido_entregue"
          : `pedido_status_${status}`,
    entidade: "pedido",
    entidadeId: id,
    dados: {
      de: atual.status,
      para: status,
      codigoPublico: pedido?.codigoPublico,
      motivoCancelamento: motivoCancelamento || null,
      reverteu:
        (atual.status === "em_producao" && status === "novo") ||
        (atual.status === "pronto" && status === "em_producao"),
    },
  });
  return pedido;
}

export async function atualizarPedidoAtendente(
  id,
  { observacao, status, motivoCancelamento },
  usuario = {}
) {
  const atual = await obterPedido(id);
  if (!atual) throw new Error("Pedido não encontrado");

  if (observacao !== undefined) {
    await getPool().query(
      `UPDATE padaria_pedido
       SET observacao = $1, atualizado_em = NOW()
       WHERE id = $2`,
      [String(observacao || "").trim() || null, id]
    );
  }

  if (status) {
    if (status === "entregue") {
      if (atual.status !== "pronto") {
        throw new Error("Só é possível entregar pedidos prontos");
      }
      return atualizarStatusPedido(id, "entregue", usuario.id, {
        usuarioNome: usuario.nome,
      });
    }
    if (status === "cancelado") {
      if (!["novo", "em_producao"].includes(atual.status)) {
        throw new Error("Pedido não pode mais ser cancelado");
      }
      return atualizarStatusPedido(id, "cancelado", usuario.id, {
        motivoCancelamento,
        usuarioNome: usuario.nome,
      });
    }
    throw new Error("Status não permitido para atendente");
  }

  return obterPedido(id);
}
