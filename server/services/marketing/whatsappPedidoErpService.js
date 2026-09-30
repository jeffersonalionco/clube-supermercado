import { getPool } from "../../db.js";
import {
  apiRequest,
  buscarClientePorCpfCnpj,
  buscarProdutoUnidadePorCodigo,
  lerRespostaApi,
  listarProdutosUnidadePagina,
  normalizarCpfCnpj,
} from "../apiClient.js";
import { exigirAtendimento, nomeExibicaoAtendente } from "./whatsappAtendimentoService.js";
import { buscarAdminAtivoPorUsuario } from "../painelAdminService.js";

const PAGINAS_BUSCA = 4;
const indicePorUnidade = new Map();

export function unidadeErp() {
  return String(
    process.env.CADASTRO_UNIDADE || process.env.CLUBE_DESCONTOS_UNIDADE || "001"
  ).trim();
}

export function agoraSaoPaulo(data = new Date()) {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(data);
  const pegar = (tipo) => parts.find((p) => p.type === tipo)?.value || "00";
  const dia = `${pegar("day")}/${pegar("month")}/${pegar("year")}`;
  const hora = pegar("hour") === "24" ? "00" : pegar("hour");
  return { data: dia, dataHora: `${dia} ${hora}:${pegar("minute")}:${pegar("second")}` };
}

function semAcento(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function produtoErpPublico(produto) {
  const codigo = String(produto?.Codigo ?? produto?.codigo ?? produto?.SKU ?? "").trim();
  const nome = String(produto?.Descricao ?? produto?.descricao ?? "").trim();
  const precoBruto = Number(produto?.PrecoPDV ?? produto?.Preco ?? produto?.preco ?? 0);
  const estoqueBruto = Number(produto?.Estoque1 ?? produto?.Estoque ?? produto?.estoque);
  return {
    codigo,
    nome,
    preco: Number.isFinite(precoBruto) ? Math.round(precoBruto * 100) / 100 : 0,
    estoque: Number.isFinite(estoqueBruto) ? estoqueBruto : null,
    unidadeMedida: String(produto?.UnidadeMedida ?? produto?.unidadeMedida ?? "UN").trim() || "UN",
  };
}

export function mensagemErp(data, fallback) {
  const lista = data?.response?.messages || data?.messages || [];
  const textos = [...new Set(
    lista
      .map((item) => (typeof item === "string" ? item : item?.message))
      .filter((item) => typeof item === "string")
      .map((item) => item.replace(/\s+/g, " ").trim())
      .filter((item) => item && !/stacktrace|exception|\.java:|br\.com\.rpinfo/i.test(item) && !item.startsWith("at "))
  )].slice(0, 3);
  return textos.join(" ") || data?.response?.message || fallback;
}

export function montarCorpoPedidoErp({
  unidade,
  nome,
  cpf,
  fone,
  codigoCliente,
  observacao,
  numeroPedidoCliente,
  itens,
  momento,
}) {
  const linhas = itens.map((item) => {
    const qtd = Number(item.quantidade);
    const preco = Number(item.preco);
    return {
      codigoProduto: Number(item.codigo),
      qtdUnitaria: qtd,
      qtdEmbalagem: 1,
      valorProduto: preco,
      valorBrutoTotal: Math.round(preco * qtd * 100) / 100,
    };
  });
  const corpo = {
    unidade,
    origem: "WhatsApp",
    codigoDocumento: "8200",
    data: momento.data,
    origemDataHora: momento.dataHora,
    numeroPedidoCliente: (String(numeroPedidoCliente || "").replace(/\D/g, "").slice(0, 20) || String(Date.now())),
    formaPagamento: "000",
    nome: String(nome).slice(0, 120),
    fone: String(fone || "").replace(/\D/g, "").slice(-11),
    observacao: String(observacao || "").replace(/\s+/g, " ").trim().slice(0, 400),
    itens: linhas,
  };
  if (codigoCliente) corpo.codigoCliente = Number(codigoCliente);
  const doc = normalizarCpfCnpj(cpf);
  if (doc.length === 11) corpo.cpf = doc;
  return corpo;
}

function indice(unidade) {
  if (!indicePorUnidade.has(unidade)) {
    indicePorUnidade.set(unidade, { produtos: new Map(), cursor: 0, esgotado: false });
  }
  return indicePorUnidade.get(unidade);
}

async function avancarIndice(unidade) {
  const idx = indice(unidade);
  if (idx.esgotado) return;
  for (let i = 0; i < PAGINAS_BUSCA; i += 1) {
    const pagina = await listarProdutosUnidadePagina(idx.cursor, unidade, { apenasAtivos: true });
    if (!pagina.ok) throw new Error(pagina.error || "Falha ao consultar produtos.");
    if (!pagina.produtos.length) {
      idx.esgotado = true;
      return;
    }
    for (const bruto of pagina.produtos) {
      const produto = produtoErpPublico(bruto);
      if (produto.codigo && produto.nome) idx.produtos.set(produto.codigo, produto);
    }
    const ultimo = Number(pagina.produtos.at(-1)?.Codigo) || 0;
    if (!ultimo || ultimo === idx.cursor) {
      idx.esgotado = true;
      return;
    }
    idx.cursor = ultimo;
  }
}

export async function buscarProdutosErp(termo) {
  const q = String(termo || "").trim().slice(0, 60);
  if (q.length < 2) return { produtos: [], aviso: null };
  const unidade = unidadeErp();
  if (/^\d+$/.test(q)) {
    const direto = await buscarProdutoUnidadePorCodigo(q, unidade);
    if (direto.ok) {
      const produto = produtoErpPublico(direto.produto);
      return { produtos: produto.codigo ? [produto] : [], aviso: null };
    }
    return { produtos: [], aviso: "Não encontrei esse código na unidade." };
  }

  const idx = indice(unidade);
  let achados = [...idx.produtos.values()].filter((p) => semAcento(p.nome).includes(semAcento(q)));
  if (achados.length < 8 && !idx.esgotado) {
    await avancarIndice(unidade);
    achados = [...idx.produtos.values()].filter((p) => semAcento(p.nome).includes(semAcento(q)));
  }
  return {
    produtos: achados.slice(0, 12),
    aviso: achados.length
      ? null
      : "Nada nas primeiras páginas do catálogo. Use o código do produto.",
  };
}

async function cpfDoContato(telefone) {
  const { rows } = await getPool().query(
    `SELECT c.tem_clube, usr.cpf
     FROM whatsapp_contato c
     LEFT JOIN usuario usr ON usr.id = c.usuario_id
     WHERE c.telefone = $1`,
    [telefone]
  );
  if (!rows[0]?.tem_clube) return "";
  return normalizarCpfCnpj(rows[0].cpf);
}

export async function criarPedidoErpCaixa({
  telefone,
  adminUsuario,
  nomeCliente,
  cpfInformado,
  observacao,
  itens,
}) {
  const tel = String(telefone || "").replace(/\D/g, "");
  const sessao = await exigirAtendimento({ telefone: tel, adminUsuario });
  if (!sessao.ok) return sessao;

  const nome = String(nomeCliente || "").replace(/\s+/g, " ").trim().slice(0, 120);
  if (nome.length < 2) return { ok: false, error: "Informe o nome do cliente." };
  if (!Array.isArray(itens) || !itens.length || itens.length > 8) {
    return { ok: false, error: "Adicione de 1 a 8 itens." };
  }

  const unidade = unidadeErp();
  const preparados = [];
  for (const bruto of itens) {
    const codigo = String(bruto.codigo || "").trim();
    const qtd = Number(bruto.quantidade);
    if (!/^\d+$/.test(codigo)) return { ok: false, error: "Código de produto inválido." };
    if (!Number.isFinite(qtd) || qtd <= 0 || qtd > 999) {
      return { ok: false, error: "Confira a quantidade." };
    }
    const consulta = await buscarProdutoUnidadePorCodigo(codigo, unidade);
    if (!consulta.ok) return { ok: false, error: consulta.error || `Produto ${codigo} não encontrado.` };
    const produto = produtoErpPublico(consulta.produto);
    if (!(produto.preco > 0)) return { ok: false, error: `${produto.nome || codigo} está sem preço na unidade.` };
    preparados.push({ ...produto, quantidade: qtd });
  }

  const cpfClube = await cpfDoContato(tel);
  const cpfInformadoLimpo = cpfClube || normalizarCpfCnpj(cpfInformado);
  let codigoCliente = null;
  let cpf = "";
  if (cpfInformadoLimpo.length === 11) {
    const cliente = await buscarClientePorCpfCnpj(cpfInformadoLimpo).catch(() => ({ ok: false }));
    const bruto = cliente?.cliente?.codigo ?? cliente?.cliente?.codigo_cliente ?? cliente?.cliente?.Codigo;
    const codigo = Number(bruto);
    if (cliente.ok && Number.isInteger(codigo) && codigo > 0) {
      codigoCliente = codigo;
      cpf = cpfInformadoLimpo;
    }
  }

  const admin = await buscarAdminAtivoPorUsuario(String(adminUsuario || "").trim().toLowerCase());
  const atendente = nomeExibicaoAtendente(admin?.nome, adminUsuario);
  const nota = [`WhatsApp · ${atendente}`, String(observacao || "").trim()].filter(Boolean).join("\n");
  const momento = agoraSaoPaulo();
  const numero = `${tel.slice(-7)}${Date.now()}`;
  const corpo = montarCorpoPedidoErp({
    unidade,
    nome,
    cpf,
    fone: tel,
    codigoCliente,
    observacao: nota,
    numeroPedidoCliente: numero,
    itens: preparados,
    momento,
  });

  const response = await apiRequest("/v3.3/pedidos", {
    method: "POST",
    body: JSON.stringify(corpo),
  });
  const { data, parseError } = await lerRespostaApi(response);
  if (parseError) return { ok: false, error: parseError };
  const status = data?.response?.status;
  if (!response.ok || status !== "ok") {
    console.warn(
      "[whatsapp/erp/pedido]",
      response.status,
      mensagemErp(data, "falha"),
      "camposItem",
      Object.keys(corpo.itens[0] || {}).join(",")
    );
    return { ok: false, error: mensagemErp(data, "O ERP não abriu o pedido.") };
  }

  const codigoPedido = Number(data?.response?.codigopedido);
  if (!Number.isInteger(codigoPedido) || codigoPedido <= 0) {
    return { ok: false, error: "O ERP não devolveu o código do pedido." };
  }

  const total = preparados.reduce((acc, item) => acc + item.preco * item.quantidade, 0);
  return {
    ok: true,
    codigoPedido,
    numeroPedidoCliente: numero,
    atendimento: sessao.atendimento,
    resumo: textoResumoErp({ codigoPedido, itens: preparados, total }),
    pedido: {
      codigoPedido,
      total: Math.round(total * 100) / 100,
      itens: preparados.map((item) => ({
        codigo: item.codigo,
        nome: item.nome,
        quantidade: item.quantidade,
        preco: item.preco,
      })),
    },
  };
}

export function textoResumoErp({ codigoPedido, itens, total }) {
  const linhas = (itens || [])
    .map((item) => `• ${item.quantidade}× ${item.nome}`)
    .join("\n");
  const valor = Number(total).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return `🧾 *Pedido registrado*\nCódigo *${codigoPedido}*\n\n${linhas}\n\nTotal: *${valor}*`;
}
