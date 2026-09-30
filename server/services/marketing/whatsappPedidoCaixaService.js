import { getPool } from "../../db.js";
import { obterConfigPadaria } from "../padariaConfigService.js";
import { criarPedido, obterPedido } from "../padariaPedidosService.js";
import { listarDecoracoesPorProduto } from "../padariaDecoracoesService.js";
import { listarProdutosAdmin } from "../padariaProdutosService.js";
import { buscarAdminAtivoPorUsuario } from "../painelAdminService.js";
import { mascararCpfParcial } from "../usuarioService.js";
import { exigirAtendimento, nomeExibicaoAtendente } from "./whatsappAtendimentoService.js";
import { formatarTelefoneExibicao } from "./whatsappConversaService.js";

const ABERTOS = ["novo", "em_producao", "pronto"];

export function quantidadePedidoValida(qtd, vendaPorKg) {
  const n = Number(qtd);
  if (!Number.isFinite(n) || n <= 0) return "Informe a quantidade.";
  if (vendaPorKg) {
    if (n < 0.1) return "O peso mínimo é 0,1 kg.";
    if (n > 30) return "Confira o peso. O máximo nesta tela é 30 kg.";
    return null;
  }
  if (Math.abs(n - Math.round(n)) > 0.001) return "Use uma quantidade inteira.";
  if (n > 40) return "Confira a quantidade. O máximo nesta tela é 40.";
  return null;
}

export function telefoneCasaCom(armazenado, whatsapp) {
  const a = String(armazenado || "").replace(/\D/g, "");
  const b = String(whatsapp || "").replace(/\D/g, "");
  if (a.length < 8 || b.length < 10) return false;
  const local = b.startsWith("55") && b.length > 11 ? b.slice(2) : b;
  return a.endsWith(local.slice(-8)) && a.includes(local.slice(0, 2));
}

function dataIso(valor) {
  if (valor instanceof Date) {
    const y = valor.getFullYear();
    const m = String(valor.getMonth() + 1).padStart(2, "0");
    const d = String(valor.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(valor || "").slice(0, 10);
}

function moeda(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n)) return "";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function textoResumoPedido(pedido) {
  const itens = (pedido?.itens || [])
    .map((item) => {
      const qtd = Number(item.quantidade);
      const qtdTxt = Number.isInteger(qtd) ? String(qtd) : String(qtd).replace(".", ",");
      const un = item.unidade === "KG" ? " kg" : "×";
      const linha = item.unidade === "KG" ? `• ${qtdTxt}${un} ${item.nome}` : `• ${qtdTxt}${un} ${item.nome}`;
      return item.decoracaoNome ? `${linha}\n  Decoração: ${item.decoracaoNome}` : linha;
    })
    .join("\n");
  const [ano, mes, dia] = dataIso(pedido?.dataRetirada).split("-");
  const quando = dia && mes ? `${dia}/${mes}${ano ? `/${ano}` : ""}` : dataIso(pedido?.dataRetirada);
  const hora = String(pedido?.horaRetirada || "").slice(0, 5);
  const total = moeda(pedido?.total);
  return (
    `🧾 *Pedido anotado*\n` +
    `*${pedido?.codigoPublico || "Pedido"}*\n\n` +
    `${itens}\n\n` +
    `Retirada: *${quando}* às *${hora}*\n` +
    (total ? `Total estimado: *${total}*\n` : "") +
    `\nA padaria confirma a produção.`
  );
}

function pedidoPublico(pedido) {
  return {
    id: pedido.id,
    codigoPublico: pedido.codigoPublico,
    clienteNome: pedido.clienteNome,
    dataRetirada: dataIso(pedido.dataRetirada),
    horaRetirada: String(pedido.horaRetirada || "").slice(0, 5),
    status: pedido.status,
    total: pedido.total,
    itens: (pedido.itens || []).map((item) => ({
      nome: item.nome,
      quantidade: item.quantidade,
      unidade: item.unidade,
      decoracaoNome: item.decoracaoNome || null,
    })),
  };
}

function imagemSegura(url) {
  const s = String(url || "").trim();
  if (/^https:\/\//i.test(s)) return s.slice(0, 500);
  if (s.startsWith("/uploads/")) return s.slice(0, 500);
  return null;
}

function produtoPublico(produto) {
  return {
    codigo: produto.codigo,
    nome: produto.nome,
    preco: produto.preco,
    vendaPorKg: Boolean(produto.vendaPorKg),
    unidade: produto.vendaPorKg ? "KG" : produto.unidadeMedida || "UN",
    imagemUrl: imagemSegura(produto.imagemUrl),
    categoriaNome: produto.categoriaNome || null,
    cobertura: produto.cobertura || null,
    recheio: produto.recheio || null,
  };
}

async function nomeDoCliente(telefone) {
  const { rows } = await getPool().query(
    `SELECT c.nome_wa, c.tem_clube, usr.nome AS nome_clube, usr.cpf
     FROM whatsapp_contato c
     LEFT JOIN usuario usr ON usr.id = c.usuario_id
     WHERE c.telefone = $1`,
    [telefone]
  );
  const row = rows[0];
  if (!row) return { nome: "", cpf: null };
  return {
    nome: row.nome_clube || row.nome_wa || "",
    cpf: row.tem_clube ? String(row.cpf || "").replace(/\D/g, "") || null : null,
  };
}

async function nomeAtendente(adminUsuario) {
  const login = String(adminUsuario || "").trim().toLowerCase();
  const admin = await buscarAdminAtivoPorUsuario(login);
  return nomeExibicaoAtendente(admin?.nome, login);
}

function partesTelefone(telefone) {
  const b = String(telefone || "").replace(/\D/g, "");
  const local = b.startsWith("55") && b.length > 11 ? b.slice(2) : b;
  return { ddd: local.slice(0, 2), fim: local.slice(-8) };
}

export async function contextoPedidoCaixa(telefone) {
  const tel = String(telefone || "").replace(/\D/g, "");
  const config = await obterConfigPadaria();
  const cliente = await nomeDoCliente(tel);
  const { ddd, fim } = partesTelefone(tel);
  if (fim.length < 8 || ddd.length < 2) {
    return {
      nomeSugerido: cliente.nome,
      cpfMascarado: cliente.cpf ? mascararCpfParcial(cliente.cpf) : null,
      horario: {
        inicio: String(config.horario_retirada_inicio || "08:00").slice(0, 5),
        fim: String(config.horario_retirada_fim || "19:00").slice(0, 5),
        antecedenciaHoras: Number(config.antecedencia_minima_horas) || 0,
      },
      pedidos: [],
    };
  }
  const { rows } = await getPool().query(
    `SELECT p.id
     FROM padaria_pedido p
     WHERE p.status = ANY($1::varchar[])
       AND regexp_replace(COALESCE(p.cliente_telefone, ''), '\\D', '', 'g') LIKE '%' || $2
       AND regexp_replace(COALESCE(p.cliente_telefone, ''), '\\D', '', 'g') LIKE '%' || $3 || '%'
     ORDER BY p.data_retirada ASC, p.hora_retirada ASC
     LIMIT 20`,
    [ABERTOS, fim, ddd]
  );
  const pedidos = [];
  for (const row of rows) {
    const pedido = await obterPedido(row.id);
    if (pedido && telefoneCasaCom(pedido.clienteTelefone, tel)) {
      pedidos.push(pedidoPublico(pedido));
    }
  }
  return {
    nomeSugerido: cliente.nome,
    cpfMascarado: cliente.cpf ? mascararCpfParcial(cliente.cpf) : null,
    horario: {
      inicio: String(config.horario_retirada_inicio || "08:00").slice(0, 5),
      fim: String(config.horario_retirada_fim || "19:00").slice(0, 5),
      antecedenciaHoras: Number(config.antecedencia_minima_horas) || 0,
    },
    pedidos,
  };
}

export async function buscarCatalogoCaixa(busca) {
  const q = String(busca || "").trim().slice(0, 60);
  if (q.length < 2) return [];
  const lista = await listarProdutosAdmin({
    busca: q,
    apenasCatalogo: true,
    limite: 8,
  });
  return (lista.produtos || [])
    .filter((produto) => produto.ativoCatalogo && produto.ativoRp)
    .map(produtoPublico);
}

export async function vitrineCatalogoCaixa({ busca = "", categoriaId = null } = {}) {
  const q = String(busca || "").trim().slice(0, 60);
  const lista = await listarProdutosAdmin({
    busca: q.length >= 2 ? q : "",
    apenasCatalogo: true,
    categoriaId,
    limite: 24,
  });
  return (lista.produtos || [])
    .filter((produto) => produto.ativoCatalogo && produto.ativoRp)
    .map(produtoPublico);
}

export async function categoriasCatalogoCaixa() {
  const { listarCategoriasPadaria } = await import("../padariaCategoriasService.js");
  const lista = await listarCategoriasPadaria({ apenasAtivas: true });
  return lista.map((cat) => ({ id: cat.id, nome: cat.nome }));
}

export async function resolverCatalogoCaixa(codigos) {
  const lista = [...new Set((codigos || []).map((c) => String(c || "").trim()).filter(Boolean))].slice(0, 12);
  const produtos = [];
  for (const codigo of lista) {
    const achados = await buscarCatalogoCaixa(codigo);
    const exato = achados.find((p) => p.codigo === codigo);
    produtos.push(exato ? { ...exato, encontrado: true } : { codigo, encontrado: false });
  }
  return produtos;
}

export async function decoracoesCatalogoCaixa(codigo) {
  const lista = await listarDecoracoesPorProduto(codigo, { apenasAtivas: true });
  return lista
    .filter((item) => item.disponivel)
    .map((item) => ({
      id: item.id,
      nome: item.nome,
      preco: item.preco,
    }));
}

async function pedidoRecenteIgual(telefone, dataRetirada, horaRetirada, itens) {
  const { ddd, fim } = partesTelefone(telefone);
  const { rows } = await getPool().query(
    `SELECT p.id
     FROM padaria_pedido p
     WHERE p.status = 'novo'
       AND p.criado_em > NOW() - INTERVAL '45 seconds'
       AND p.data_retirada = $1::date
       AND p.hora_retirada = $2::time
       AND regexp_replace(COALESCE(p.cliente_telefone, ''), '\\D', '', 'g') LIKE '%' || $3
       AND regexp_replace(COALESCE(p.cliente_telefone, ''), '\\D', '', 'g') LIKE '%' || $4 || '%'
     ORDER BY p.id DESC
     LIMIT 5`,
    [dataRetirada, horaRetirada, fim, ddd]
  );
  const assinatura = itens
    .map((item) => `${item.produtoCodigo}:${Number(item.quantidade)}:${item.decoracaoId || ""}`)
    .sort()
    .join("|");
  for (const row of rows) {
    const pedido = await obterPedido(row.id);
    if (!pedido || !telefoneCasaCom(pedido.clienteTelefone, telefone)) continue;
    const atual = (pedido.itens || [])
      .map((item) => `${item.produtoCodigo}:${Number(item.quantidade)}:${item.decoracaoId || ""}`)
      .sort()
      .join("|");
    if (atual === assinatura) return pedido;
  }
  return null;
}

export async function criarPedidoCaixa({
  telefone,
  adminUsuario,
  nomeCliente,
  dataRetirada,
  horaRetirada,
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

  const data = String(dataRetirada || "").slice(0, 10);
  const hora = String(horaRetirada || "").slice(0, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return { ok: false, error: "Informe a data de retirada." };
  if (!/^\d{2}:\d{2}$/.test(hora)) return { ok: false, error: "Informe a hora de retirada." };

  const preparados = [];
  for (const bruto of itens) {
    const codigo = String(bruto.codigo || bruto.produtoCodigo || "").trim();
    const achados = await buscarCatalogoCaixa(codigo);
    const produto = achados.find((p) => p.codigo === codigo);
    if (!produto) return { ok: false, error: `Produto ${codigo} não está no catálogo.` };
    const erroQtd = quantidadePedidoValida(bruto.quantidade, produto.vendaPorKg);
    if (erroQtd) return { ok: false, error: erroQtd };
    preparados.push({
      produtoCodigo: codigo,
      quantidade: Number(bruto.quantidade),
      decoracaoId: Number(bruto.decoracaoId) || null,
    });
  }

  const repetido = await pedidoRecenteIgual(tel, data, hora, preparados);
  if (repetido) {
    return { ok: true, repetido: true, pedido: pedidoPublico(repetido), atendimento: sessao.atendimento };
  }

  const cliente = await nomeDoCliente(tel);
  const atendente = await nomeAtendente(adminUsuario);
  const nota = String(observacao || "").replace(/\u0000/g, "").trim().slice(0, 400);
  const obs = [`WhatsApp · ${atendente}`, nota].filter(Boolean).join("\n");

  try {
    const pedido = await criarPedido({
      clienteNome: nome,
      clienteCpf: cliente.cpf,
      clienteTelefone: formatarTelefoneExibicao(tel),
      dataRetirada: data,
      horaRetirada: hora,
      observacao: obs,
      itens: preparados,
      criadoPorId: null,
      criadoPorNome: atendente,
    });
    return { ok: true, pedido: pedidoPublico(pedido), atendimento: sessao.atendimento };
  } catch (error) {
    const msg = String(error?.message || "");
    if (/informe|adicione|inválid|não está|não é possível|deve ter|deve ser|passado|antecedência|formato|decoração|sem estoque/i.test(msg)) {
      return { ok: false, error: msg };
    }
    console.warn("[whatsapp/caixa/pedido]", msg);
    return { ok: false, error: "Não foi possível anotar o pedido." };
  }
}

export async function enviarResumoPedidoCaixa({ telefone, adminUsuario, pedidoId }) {
  const tel = String(telefone || "").replace(/\D/g, "");
  const id = Number(pedidoId);
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Pedido inválido." };
  const pedido = await obterPedido(id);
  if (!pedido || !telefoneCasaCom(pedido.clienteTelefone, tel)) {
    return { ok: false, error: "Esse pedido não é desta conversa." };
  }
  if (!ABERTOS.includes(pedido.status)) {
    return { ok: false, error: "Esse pedido não está mais aberto." };
  }
  const { responderConversaWhatsapp } = await import("./whatsappConversaService.js");
  return responderConversaWhatsapp({
    telefone: tel,
    adminUsuario,
    texto: textoResumoPedido(pedido),
  });
}
