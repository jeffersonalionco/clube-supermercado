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
import { mapaDataMinimaCadastro } from "../utils/vendasPlataforma.js";

function isoParaBr(valor) {
  const s = String(valor || "").trim();
  const match = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return `${match[3]}/${match[2]}/${match[1]}`;
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

  const n = Math.min(90, Math.max(1, Number(dias) || 30));
  const fim = new Date();
  fim.setHours(12, 0, 0, 0);
  const inicio = new Date(fim);
  inicio.setDate(inicio.getDate() - (n - 1));
  return {
    dataini: formatarDataBR(inicio),
    datafim: formatarDataBR(fim),
    dias: n,
  };
}

async function contarUsuarios({ dataInicioIso = "", dataFimIso = "" } = {}) {
  const condicoes = [];
  const params = [];

  if (dataInicioIso) {
    params.push(dataInicioIso);
    condicoes.push(
      `criado_em >= ($${params.length}::date AT TIME ZONE 'America/Sao_Paulo')`
    );
  }
  if (dataFimIso) {
    params.push(dataFimIso);
    condicoes.push(
      `criado_em < (($${params.length}::date + INTERVAL '1 day') AT TIME ZONE 'America/Sao_Paulo')`
    );
  }

  const where = condicoes.length ? `WHERE ${condicoes.join(" AND ")}` : "";
  const { rows } = await getPool().query(
    `SELECT COUNT(*)::int AS total FROM usuario ${where}`,
    params
  );
  return rows[0]?.total ?? 0;
}

async function listarNovosClientesPeriodo(dataInicioIso, dataFimIso) {
  const params = [];
  const condicoes = [];

  if (dataInicioIso) {
    params.push(dataInicioIso);
    condicoes.push(
      `criado_em >= ($${params.length}::date AT TIME ZONE 'America/Sao_Paulo')`
    );
  }
  if (dataFimIso) {
    params.push(dataFimIso);
    condicoes.push(
      `criado_em < (($${params.length}::date + INTERVAL '1 day') AT TIME ZONE 'America/Sao_Paulo')`
    );
  }

  const where = condicoes.length ? `WHERE ${condicoes.join(" AND ")}` : "";
  const { rows } = await getPool().query(
    `SELECT cpf, nome, cliente_codigo, criado_em
     FROM usuario
     ${where}
     ORDER BY criado_em ASC, nome ASC`,
    params
  );

  return rows.map((row) => ({
    cpf: row.cpf,
    nome: row.nome || "—",
    clienteCodigo: row.cliente_codigo,
    cadastradoEm: row.criado_em,
  }));
}

async function listarMembrosComCadastro() {
  const { rows } = await getPool().query(
    `SELECT cpf, criado_em FROM usuario`
  );
  return rows;
}

function brParaIso(dataBr) {
  const d = parseDataBR(dataBr);
  if (!d) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Relatório do Clube Superama+ para o painel admin.
 * Lista completa de novos clientes e de produtos vendidos no período.
 * Vendas = compras com CPF de membros cadastrados na plataforma.
 */
export async function obterRelatorioClube({
  dataInicio = "",
  dataFim = "",
  dias = 30,
} = {}) {
  const periodo = resolverPeriodo({ dataInicio, dataFim, dias });
  const inicioIso = brParaIso(periodo.dataini);
  const fimIso = brParaIso(periodo.datafim);

  const [clientesTotal, novosClientes, membros] = await Promise.all([
    contarUsuarios(),
    listarNovosClientesPeriodo(inicioIso, fimIso),
    listarMembrosComCadastro(),
  ]);

  const dataMinimaPorCpf = mapaDataMinimaCadastro(membros);
  const comprasMap = await agruparComprasPorCpfWrpdv(
    periodo.dataini,
    periodo.datafim,
    { dataMinimaPorCpf }
  );

  const setMembros = new Set(membros.map((m) => m.cpf));
  let valorVendido = 0;
  let quantidadeCupons = 0;
  let membrosComCompra = 0;

  for (const cpf of setMembros) {
    const vendas = comprasMap.get(cpf);
    if (!vendas || !vendas.quantidadeCupons) continue;
    membrosComCompra += 1;
    valorVendido += Number(vendas.totalGasto) || 0;
    quantidadeCupons += Number(vendas.quantidadeCupons) || 0;
  }

  const produtosVendidos = await topProdutosPorCpfsWrpdv(
    [...setMembros],
    periodo.dataini,
    periodo.datafim,
    { limite: null, dataMinimaPorCpf }
  );

  const ticketMedio =
    quantidadeCupons > 0
      ? Math.round((valorVendido / quantidadeCupons) * 100) / 100
      : 0;

  const valorProdutos = Math.round(
    produtosVendidos.reduce((acc, p) => acc + (Number(p.valorTotal) || 0), 0) *
      100
  ) / 100;

  return {
    geradoEm: new Date().toISOString(),
    periodo: {
      dataInicio: inicioIso,
      dataFim: fimIso,
      dataini: periodo.dataini,
      datafim: periodo.datafim,
      dias: periodo.dias,
    },
    cadastros: {
      total: clientesTotal,
      noPeriodo: novosClientes.length,
    },
    vendas: {
      escopo: "compras_com_cpf_membros",
      descricao:
        "Compras no caixa com CPF de membros, somente a partir da data de cadastro na plataforma.",
      valorVendido: Math.round(valorVendido * 100) / 100,
      quantidadeCupons,
      membrosComCompra,
      ticketMedio,
      quantidadeProdutos: produtosVendidos.length,
      valorProdutos,
      compradoresForaDoClube: [...comprasMap.keys()].filter(
        (cpf) => !setMembros.has(cpf)
      ).length,
    },
    novosClientes,
    produtosVendidos,
  };
}
