import { buscarProdutoApi } from "./apiClient.js";

const cacheProduto = new Map();
const PRODUTO_VAZIO = { descricao: null, codigoBarras: null };
const CONCORRENCIA_PRODUTOS = 10;

async function obterDadosProduto(codigoProduto) {
  const codigo = String(codigoProduto ?? "").trim();
  if (!codigo) return PRODUTO_VAZIO;

  if (cacheProduto.has(codigo)) {
    const cached = cacheProduto.get(codigo);
    return typeof cached?.then === "function" ? cached : cached;
  }

  const promise = (async () => {
    const resultado = await buscarProdutoApi(codigo);
    if (!resultado.ok) {
      return PRODUTO_VAZIO;
    }

    const p = resultado.produto;
    return {
      descricao: p.descricao || null,
      codigoBarras: p.codigoBarras || null,
    };
  })();

  cacheProduto.set(codigo, promise);

  try {
    const dados = await promise;
    cacheProduto.set(codigo, dados);
    return dados;
  } catch {
    cacheProduto.delete(codigo);
    return PRODUTO_VAZIO;
  }
}

async function carregarCatalogoProdutos(codigos) {
  const unicos = [
    ...new Set(
      codigos
        .map((c) => String(c ?? "").trim())
        .filter(Boolean)
    ),
  ];

  const catalogo = new Map();

  for (let i = 0; i < unicos.length; i += CONCORRENCIA_PRODUTOS) {
    const lote = unicos.slice(i, i + CONCORRENCIA_PRODUTOS);
    const resultados = await Promise.all(
      lote.map(async (codigo) => {
        const dados = await obterDadosProduto(codigo);
        return [codigo, dados];
      })
    );
    for (const [codigo, dados] of resultados) {
      catalogo.set(codigo, dados);
    }
  }

  return catalogo;
}

function arredondarMoeda(valor) {
  return Math.round(Number(valor) * 100) / 100;
}

function somarProdutos(produtos, campo = "valorTotal") {
  if (!Array.isArray(produtos)) return 0;
  return arredondarMoeda(
    produtos.reduce((acc, p) => acc + (Number(p[campo]) || 0), 0)
  );
}

function labelDataBR(dataStr) {
  const match = String(dataStr || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return dataStr;
  const date = new Date(
    Number(match[3]),
    Number(match[2]) - 1,
    Number(match[1])
  );
  try {
    return date.toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  } catch {
    return dataStr;
  }
}

function ordenarPorDataDesc(a, b) {
  const pa = a.data?.split("/").reverse().join("") || "";
  const pb = b.data?.split("/").reverse().join("") || "";
  return pb.localeCompare(pa);
}

function mapearProdutos(produtosBrutos, catalogo) {
  return (produtosBrutos || []).map((p) => {
    const codigo = String(p.codigoProduto ?? "").trim();
    const dados = catalogo.get(codigo) || PRODUTO_VAZIO;
    const descricaoInline = String(p.descricao ?? "").trim();
    const valorBruto = arredondarMoeda(p.valorBruto ?? p.valorTotal);
    const valorDesconto = arredondarMoeda(p.valorDesconto ?? 0);
    const valorLiquido = arredondarMoeda(
      p.valorLiquido ?? valorBruto - valorDesconto
    );

    return {
      codigoProduto: p.codigoProduto,
      descricao: descricaoInline || dados.descricao,
      codigoBarras: p.codigoBarras || dados.codigoBarras,
      quantidade: Number(p.quantidadeUnitaria) || 0,
      valorBruto,
      valorDesconto,
      valorLiquido,
      valorTotal: valorLiquido,
      temDesconto: valorDesconto > 0,
      oferta: p.oferta === "SIM",
      ofertaLabel: p.oferta === "SIM" ? "Oferta" : null,
    };
  });
}

export async function apresentarVendas(itens, periodo) {
  const lista = Array.isArray(itens) ? itens : [];

  const todosCodigos = lista.flatMap((item) =>
    (item.produtos || [])
      .filter((p) => !String(p.descricao ?? "").trim())
      .map((p) => p.codigoProduto)
  );
  const catalogo = await carregarCatalogoProdutos(todosCodigos);

  const vendas = lista.map((item) => {
    const produtos = mapearProdutos(item.produtos, catalogo);
    const subtotal = arredondarMoeda(
      item.subtotalItens ?? somarProdutos(produtos, "valorBruto")
    );
    const totalDesconto = arredondarMoeda(item.totalDesconto ?? 0);
    const totalDescontoCupom = arredondarMoeda(item.totalDescontoCupom ?? 0);
    const total = arredondarMoeda(
      item.totalLiquido ?? item.valorTotalCupom ?? somarProdutos(produtos)
    );

    return {
      data: item.data,
      numeroDcto: String(item.numeroDcto ?? ""),
      pdv: item.pdv ? String(item.pdv) : null,
      chaveCupom: item.chaveCupom || null,
      formaPagamento: item.formaPagamento || null,
      formasPagamento: item.formasPagamento || [],
      unidade: item.unidade || null,
      cancelada: Boolean(item.cancelada),
      convenio: Boolean(item.convenio),
      elegivelPontos: item.elegivelPontos !== false && !item.cancelada && !item.convenio,
      subtotal,
      totalDesconto,
      totalDescontoCupom,
      temDesconto: totalDesconto > 0,
      total,
      quantidadeProdutos: produtos.length,
      produtos,
    };
  });

  const vendaContaPontos = (v) => !v.cancelada && !v.convenio;
  const vendasAtivas = vendas.filter(vendaContaPontos);

  const porDataMap = new Map();
  for (const venda of vendas) {
    const chave = venda.data || "Sem data";
    if (!porDataMap.has(chave)) {
      porDataMap.set(chave, []);
    }
    porDataMap.get(chave).push(venda);
  }

  const porData = [...porDataMap.entries()]
    .map(([data, vendasDia]) => {
      const ativasDia = vendasDia.filter(vendaContaPontos);
      const totalDia = ativasDia.reduce((acc, v) => acc + v.total, 0);
      const totalItens = vendasDia.reduce(
        (acc, v) => acc + v.quantidadeProdutos,
        0
      );
      const canceladasDia = vendasDia.filter((v) => v.cancelada).length;
      const convenioDia = vendasDia.filter((v) => v.convenio).length;
      return {
        data,
        dataLabel: labelDataBR(data),
        totalDia,
        quantidadeVendas: vendasDia.length,
        quantidadeCanceladas: canceladasDia,
        quantidadeConvenio: convenioDia,
        totalItens,
        vendas: vendasDia.sort((a, b) =>
          String(b.numeroDcto).localeCompare(String(a.numeroDcto))
        ),
      };
    })
    .sort(ordenarPorDataDesc);

  const totalGasto = arredondarMoeda(vendasAtivas.reduce((acc, v) => acc + v.total, 0));
  const totalDescontos = arredondarMoeda(
    vendasAtivas.reduce((acc, v) => acc + v.totalDesconto, 0)
  );
  const totalItens = vendas.reduce((acc, v) => acc + v.quantidadeProdutos, 0);
  const totalCanceladas = vendas.filter((v) => v.cancelada).length;
  const totalConvenio = vendas.filter((v) => v.convenio).length;

  return {
    periodo,
    resumo: {
      totalVendas: vendas.length,
      totalVendasAtivas: vendasAtivas.length,
      totalCanceladas,
      totalConvenio,
      totalGasto,
      totalDescontos,
      totalItens,
      ticketMedio:
        vendasAtivas.length > 0
          ? arredondarMoeda(totalGasto / vendasAtivas.length)
          : 0,
    },
    porData,
    vendas,
  };
}
