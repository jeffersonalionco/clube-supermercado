/**
 * Fluxo enxuto de encomenda via catálogo WhatsApp.
 * Textos curtos + botões de ação (sem links soltos no texto).
 */
import { getPool } from "../../db.js";
import {
  enviarIndicadorDigitandoWhatsapp,
  enviarMensagemBotoesWhatsapp,
  enviarMensagemCtaUrlWhatsapp,
  enviarMensagemTextoWhatsapp,
  normalizarTelefoneWa,
} from "./whatsappCloudService.js";
import { trackCatalogoMetaFireAndForget } from "./metaConversionsService.js";

export const SESSAO_CATALOGO_PEDIDO = "catalogo_pedido";

export const BTN_CAT_CANCELAR = "btn_cat_cancelar";
export const BTN_CAT_TEL_MESMO = "btn_cat_tel_mesmo";
export const BTN_CAT_TEL_OUTRO = "btn_cat_tel_outro";

export function isBotaoCatalogoPedido(buttonId) {
  return (
    buttonId === BTN_CAT_CANCELAR ||
    buttonId === BTN_CAT_TEL_MESMO ||
    buttonId === BTN_CAT_TEL_OUTRO
  );
}

function sessaoTtlMs() {
  // Inatividade: sem resposta → cancela o pedido iniciado (sem avisar o cliente)
  const min = Number(process.env.WHATSAPP_CATALOGO_SESSAO_MIN || 10);
  return Math.max(3, min) * 60 * 1000;
}

function pausaMs() {
  return Math.max(0, Number(process.env.WHATSAPP_TYPING_MS || 900));
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function pausaDigitando(wamid) {
  if (wamid) {
    try {
      await enviarIndicadorDigitandoWhatsapp({ messageId: wamid });
    } catch {
      /* ignore */
    }
  }
  await sleep(pausaMs());
}

function linkPadariaProduto(codigo) {
  const root = "https://clube.mercadosuperama.com.br";
  const cod = String(codigo || "").trim();
  if (!cod) return `${root}/#/padaria`;
  return `${root}/#/padaria?codigo=${encodeURIComponent(cod)}`;
}

function moedaBr(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarTelBr(tel) {
  const d = String(tel || "").replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("55")) {
    return `(${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  }
  if (d.length === 11) {
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  }
  return tel || "—";
}

export function statusExpedientePadaria(agora = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(agora);

  const wd = parts.find((p) => p.type === "weekday")?.value || "";
  const hour = Number(parts.find((p) => p.type === "hour")?.value || 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value || 0);
  const minutos = hour * 60 + minute;
  const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dia = map[wd] ?? new Date().getDay();

  const abreH = Number(process.env.WHATSAPP_PADARIA_ABRE ?? 8);
  const fechaH = Number(process.env.WHATSAPP_PADARIA_FECHA ?? 19);
  const abre = Math.max(0, abreH) * 60;
  const fecha = Math.min(23, Math.max(abreH + 1, fechaH)) * 60;

  if (dia === 0) return { aberto: false };
  return { aberto: minutos >= abre && minutos < fecha };
}

async function garantirEstado(telefone) {
  await getPool().query(
    `INSERT INTO whatsapp_auto_reply_estado (telefone, atualizado_em)
     VALUES ($1, NOW())
     ON CONFLICT (telefone) DO NOTHING`,
    [telefone]
  );
}

export async function limparSessaoCatalogoPedido(telefone) {
  await getPool().query(
    `UPDATE whatsapp_auto_reply_estado
     SET sessao_modo = NULL,
         sessao_atividade_em = NULL,
         sessao_dados = NULL,
         atualizado_em = NOW()
     WHERE telefone = $1 AND sessao_modo = $2`,
    [telefone, SESSAO_CATALOGO_PEDIDO]
  );
}

/**
 * Cancela em silêncio pedidos abandonados (sem mensagem ao cliente).
 * @returns {Promise<number>} quantidade limpa
 */
export async function limparSessoesCatalogoExpiradas() {
  const ttlMin = Math.max(3, Number(process.env.WHATSAPP_CATALOGO_SESSAO_MIN || 10));
  const { rowCount } = await getPool().query(
    `UPDATE whatsapp_auto_reply_estado
     SET sessao_modo = NULL,
         sessao_atividade_em = NULL,
         sessao_dados = NULL,
         atualizado_em = NOW()
     WHERE sessao_modo = $1
       AND (
         sessao_atividade_em IS NULL
         OR sessao_atividade_em < NOW() - ($2::text || ' minutes')::interval
       )`,
    [SESSAO_CATALOGO_PEDIDO, String(ttlMin)]
  );
  if (rowCount > 0) {
    console.log(
      `[whatsapp/catalogo] ${rowCount} pedido(s) abandonado(s) cancelado(s) por inatividade (${ttlMin} min)`
    );
  }
  return rowCount || 0;
}

let jobLimpeza = null;

/** Limpa sessões abandonadas periodicamente (sem falar com o cliente). */
export function iniciarJobLimpezaCatalogoPedido() {
  if (jobLimpeza) return;
  const min = Math.max(2, Number(process.env.WHATSAPP_CATALOGO_LIMPEZA_MIN || 3));
  const tick = () => {
    limparSessoesCatalogoExpiradas().catch((err) =>
      console.warn("[whatsapp/catalogo] limpeza:", err.message)
    );
  };
  jobLimpeza = setInterval(tick, min * 60 * 1000);
  setTimeout(tick, 20_000);
  console.log(`[whatsapp/catalogo] limpeza de inatividade a cada ${min} min (TTL ${Math.max(3, Number(process.env.WHATSAPP_CATALOGO_SESSAO_MIN || 10))} min)`);
}

async function salvarSessao(telefone, dados) {
  await garantirEstado(telefone);
  await getPool().query(
    `UPDATE whatsapp_auto_reply_estado
     SET sessao_modo = $2,
         sessao_atividade_em = NOW(),
         sessao_dados = $3::jsonb,
         sessao_usuario_id = NULL,
         atualizado_em = NOW()
     WHERE telefone = $1`,
    [telefone, SESSAO_CATALOGO_PEDIDO, JSON.stringify(dados || {})]
  );
}

async function tocarSessao(telefone) {
  await getPool().query(
    `UPDATE whatsapp_auto_reply_estado
     SET sessao_atividade_em = NOW(), atualizado_em = NOW()
     WHERE telefone = $1 AND sessao_modo = $2`,
    [telefone, SESSAO_CATALOGO_PEDIDO]
  );
}

export async function obterSessaoCatalogoPedido(telefone) {
  const { rows } = await getPool().query(
    `SELECT * FROM whatsapp_auto_reply_estado WHERE telefone = $1`,
    [telefone]
  );
  const estado = rows[0];
  if (!estado || estado.sessao_modo !== SESSAO_CATALOGO_PEDIDO) {
    return { ativa: false, dados: null };
  }
  if (!estado.sessao_atividade_em) {
    await limparSessaoCatalogoPedido(telefone);
    return { ativa: false, dados: null, expirou: true };
  }
  const elapsed = Date.now() - new Date(estado.sessao_atividade_em).getTime();
  if (elapsed >= sessaoTtlMs()) {
    await limparSessaoCatalogoPedido(telefone);
    // Silencioso: não envia mensagem ao cliente
    console.log(
      "[whatsapp/catalogo] sessão expirada (silencioso)",
      telefone
    );
    return { ativa: false, dados: null, expirou: true };
  }
  await tocarSessao(telefone);
  return { ativa: true, dados: estado.sessao_dados || {} };
}

async function buscarProduto(codigo) {
  const cod = String(codigo || "").trim();
  if (!cod) return null;
  try {
    const { rows } = await getPool().query(
      `SELECT codigo, nome_catalogo, nome_rp, preco, venda_por_kg
       FROM padaria_produto WHERE codigo = $1 LIMIT 1`,
      [cod]
    );
    const r = rows[0];
    if (!r) return null;
    return {
      codigo: r.codigo,
      nome: String(r.nome_catalogo || r.nome_rp || "").trim() || r.codigo,
      preco: Number(r.preco) || 0,
      vendaPorKg: Boolean(r.venda_por_kg),
    };
  } catch {
    return null;
  }
}

function equipeWaNumero() {
  return normalizarTelefoneWa(
    process.env.WHATSAPP_REDIRECT_WA || "4598161551"
  );
}

function truncarTextoWa(texto, max = 1200) {
  const t = String(texto || "");
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 24)).trimEnd()}\n… (lista cortada)`;
}

function montarTextoParaEquipe(dados) {
  const linhas = [
    "Pedido catálogo WhatsApp:",
    `Produto: ${dados.nomeProduto}`,
    `Código: ${dados.codigo}`,
  ];
  if (dados.nomeCliente) linhas.push(`Cliente: ${dados.nomeCliente}`);
  if (dados.peso) linhas.push(`Peso: ${dados.peso}`);
  if (dados.retirada) linhas.push(`Retirada: ${dados.retirada}`);
  if (dados.telefoneContato) linhas.push(`Contato: ${dados.telefoneContato}`);
  if (dados.vendaPorKg && dados.preco != null) {
    linhas.push(`Preço ref.: ${moedaBr(dados.preco)}/kg (final na balança)`);
  }
  linhas.push(`Catálogo: ${linkPadariaProduto(dados.codigo)}`);
  return truncarTextoWa(linhas.join("\n"));
}

function montarTextoParaEquipeMultiplo(dados) {
  const linhas = [
    "Pedido catálogo WhatsApp (vários itens):",
  ];
  if (dados.nomeCliente) linhas.push(`Cliente: ${dados.nomeCliente}`);
  linhas.push(`WhatsApp: ${dados.telefoneContato || "—"}`);
  linhas.push("Itens:");
  for (const it of dados.itens || []) {
    const qtd = it.quantidade > 1 ? ` · qtd carrinho: ${it.quantidade}` : "";
    linhas.push(`• ${it.codigo} — ${it.nome}${qtd}`);
  }
  linhas.push("—");
  linhas.push("Equipe: confirmar quantidade/peso de cada código.");
  linhas.push("Catálogo: https://clube.mercadosuperama.com.br/#/padaria");
  return truncarTextoWa(linhas.join("\n"));
}

async function enriquecerItensPedido(itensBrutos) {
  const out = [];
  for (const raw of itensBrutos || []) {
    const produto = await buscarProduto(raw.codigo);
    const codigo = produto?.codigo || String(raw.codigo || "").trim();
    if (!codigo) continue;
    out.push({
      codigo,
      nome: produto?.nome || `Produto ${codigo}`,
      quantidade: Number(raw.quantidade) > 0 ? Number(raw.quantidade) : 1,
      preco:
        raw.preco != null
          ? Number(raw.preco)
          : produto?.preco != null
            ? produto.preco
            : null,
      vendaPorKg: Boolean(produto?.vendaPorKg),
    });
  }
  return out;
}

function montarCorpoClienteMultiplo(itens, { fora = false } = {}) {
  const maxLinhas = 12;
  const lista = itens.slice(0, maxLinhas).map((it) => {
    const qtd = it.quantidade > 1 ? ` (x${it.quantidade})` : "";
    return `• ${it.nome}${qtd}\n  Cód. ${it.codigo}`;
  });
  const resto = itens.length - maxLinhas;
  if (resto > 0) lista.push(`• … e mais ${resto} item(ns)`);

  return (
    `*Pedido com ${itens.length} itens*\n\n` +
    `${lista.join("\n")}\n\n` +
    `A padaria confirma *quanto de cada* código.\n` +
    (fora ? `Fora do horário — respondem depois.\n` : "") +
    `\nToque para enviar o pedido à equipe.`
  ).slice(0, 1024);
}

async function enviarPedidoMultiploCta(telefone, dados) {
  const url = linkWaEquipe(montarTextoParaEquipeMultiplo(dados));
  const fora = !statusExpedientePadaria().aberto;
  const corpo = montarCorpoClienteMultiplo(dados.itens || [], { fora });

  const r = await enviarCta({
    telefone,
    corpo,
    url,
    displayText: "Confirmar pedido",
  });

  // Purchase = pedido confirmado p/ retirada (pagamento no físico)
  trackCatalogoMetaFireAndForget({
    eventName: "Purchase",
    items: dados.itens || [],
    actionSource: "business_messaging",
    messagingChannel: "whatsapp",
    telefone,
    nome: dados.nomeCliente || null,
    userAgent: "WhatsApp/CatalogOrder",
    eventSourceUrl: "https://clube.mercadosuperama.com.br/#/padaria",
    orderId: `wa-multi-${Date.now()}`,
  });

  await limparSessaoCatalogoPedido(telefone);
  return {
    ...r,
    metricaAcao: "catalog_pedido_multiplo",
    catalogCodigo: (dados.itens || []).map((i) => i.codigo).join(","),
  };
}

function linkWaEquipe(texto) {
  const num = equipeWaNumero();
  const base = num ? `https://wa.me/${num}` : "https://wa.me/554598161551";
  return `${base}?text=${encodeURIComponent(texto)}`;
}

async function enviarCta({ telefone, corpo, url, displayText }) {
  const cta = await enviarMensagemCtaUrlWhatsapp({
    telefone,
    corpo,
    url,
    displayText,
  });
  if (cta.ok) return cta;
  // Fallback: texto + link só se a Meta recusar o botão CTA
  return enviarMensagemTextoWhatsapp({
    telefone,
    texto: `${corpo}\n\n${url}`,
  });
}

function extrairPeso(texto) {
  const t = String(texto || "").trim();
  if (!t) return null;
  const m = t.replace(",", ".").match(/(\d+(?:\.\d+)?)\s*(kg|kilos?|quilo)?/i);
  if (!m) {
    if (t.length >= 2 && t.length <= 40) return t;
    return null;
  }
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0 || n > 50) {
    if (t.length >= 2 && t.length <= 40) return t;
    return null;
  }
  return `${String(n).replace(".", ",")} kg`;
}

function extrairTelefoneContato(texto, telefoneConversa) {
  const t = String(texto || "").trim().toLowerCase();
  if (
    t.includes("mesmo") ||
    t.includes("este") ||
    t === "sim" ||
    t === "ok"
  ) {
    return formatarTelBr(telefoneConversa);
  }
  const digits = t.replace(/\D/g, "");
  if (digits.length >= 10 && digits.length <= 13) {
    return formatarTelBr(normalizarTelefoneWa(digits) || digits);
  }
  return null;
}

async function cancelarFluxo(telefone) {
  await limparSessaoCatalogoPedido(telefone);
  return {
    ok: true,
    messageId: null,
    cancelou: true,
    metricaAcao: "catalog_cancelou",
    _reabrirMenu: true,
  };
}

export async function iniciarPedidoCatalogo(
  telefone,
  intent,
  { wamid, nomeWa } = {}
) {
  await pausaDigitando(wamid);

  await getPool().query(
    `UPDATE whatsapp_auto_reply_estado
     SET sessao_modo = NULL, sessao_atividade_em = NULL, sessao_dados = NULL,
         sessao_usuario_id = NULL, atualizado_em = NOW()
     WHERE telefone = $1`,
    [telefone]
  );

  const itens = await enriquecerItensPedido(intent.itens || []);
  if (!itens.length) {
    return enviarMensagemTextoWhatsapp({
      telefone,
      texto:
        "Não consegui ler os itens do catálogo. Tente enviar o pedido de novo ou fale com a padaria.",
    });
  }

  // 2+ itens: sem perguntas — resumo + CTA direto para a equipe
  if (itens.length >= 2) {
    trackCatalogoMetaFireAndForget({
      eventName: "AddToCart",
      items: itens,
      actionSource: "business_messaging",
      messagingChannel: "whatsapp",
      telefone,
      nome: nomeWa || null,
      userAgent: "WhatsApp/CatalogOrder",
      eventSourceUrl: "https://clube.mercadosuperama.com.br/#/padaria",
    });
    const dadosMulti = {
      tipo: intent.tipo || "order",
      nomeCliente: nomeWa || null,
      telefoneContato: formatarTelBr(telefone),
      itens,
    };
    const r = await enviarPedidoMultiploCta(telefone, dadosMulti);
    return {
      ...r,
      metricaAcao:
        intent.tipo === "order" ? "catalog_order_multi" : "catalog_inquiry_multi",
      keepSession: false,
    };
  }

  const principal = itens[0];
  const codigo = principal.codigo;
  const nomeProduto = principal.nome;
  const preco = principal.preco;
  const vendaPorKg = principal.vendaPorKg;
  const fora = !statusExpedientePadaria().aberto;

  trackCatalogoMetaFireAndForget({
    eventName: "AddToCart",
    items: [principal],
    actionSource: "business_messaging",
    messagingChannel: "whatsapp",
    telefone,
    nome: nomeWa || null,
    userAgent: "WhatsApp/CatalogOrder",
    eventSourceUrl: linkPadariaProduto(codigo),
  });

  const dados = {
    passo: "peso",
    tipo: intent.tipo || "inquiry",
    codigo,
    nomeProduto,
    preco,
    vendaPorKg,
    nomeCliente: nomeWa || null,
    qtdPedido: principal.quantidade || 1,
    peso: null,
    retirada: null,
    telefoneContato: null,
  };
  await salvarSessao(telefone, dados);

  const linhaPreco =
    preco != null
      ? vendaPorKg
        ? `${moedaBr(preco)}/kg · final na balança`
        : moedaBr(preco)
      : null;

  const corpo =
    `*${nomeProduto}*\n` +
    `Cód. ${codigo}` +
    (linhaPreco ? `\n${linhaPreco}` : "") +
    (fora ? `\nFora do horário — a padaria confirma depois.` : "") +
    `\n\nPedido só fecha com *confirmação da padaria*.` +
    `\n\nQual o *peso aproximado*? (ex.: 2 kg)`;

  const r = await enviarMensagemBotoesWhatsapp({
    telefone,
    cabecalho: "PADARIA",
    corpo,
    botoes: [{ id: BTN_CAT_CANCELAR, title: "Cancelar" }],
  });

  return {
    ...r,
    metricaAcao: intent.tipo === "order" ? "catalog_order" : "catalog_inquiry",
    catalogCodigo: codigo,
    keepSession: true,
  };
}

async function pedirRetirada(telefone, dados) {
  return enviarMensagemBotoesWhatsapp({
    telefone,
    corpo:
      `Peso: *${dados.peso}*\n\n` +
      `Data e horário da retirada?\n` +
      `(ex.: amanhã 15h)`,
    botoes: [{ id: BTN_CAT_CANCELAR, title: "Cancelar" }],
  });
}

async function pedirTelefone(telefone, dados) {
  return enviarMensagemBotoesWhatsapp({
    telefone,
    corpo:
      `Retirada: *${dados.retirada}*\n\n` +
      `Telefone para contato?`,
    botoes: [
      { id: BTN_CAT_TEL_MESMO, title: "Este mesmo" },
      { id: BTN_CAT_TEL_OUTRO, title: "Outro número" },
      { id: BTN_CAT_CANCELAR, title: "Cancelar" },
    ],
  });
}

async function enviarResumoCta(telefone, dados) {
  const url = linkWaEquipe(montarTextoParaEquipe(dados));
  const fora = !statusExpedientePadaria().aberto;

  const corpo =
    `*${dados.nomeProduto}*\n` +
    `${dados.peso} · ${dados.retirada}\n` +
    `Contato: ${dados.telefoneContato}\n` +
    (dados.vendaPorKg ? `Valor final na balança.\n` : "") +
    (fora ? `Fora do horário — respondem depois.\n` : "") +
    `\nSó conclui com *confirmação da padaria*.`;

  const r = await enviarCta({
    telefone,
    corpo,
    url,
    displayText: "Falar com a padaria",
  });

  trackCatalogoMetaFireAndForget({
    eventName: "Purchase",
    items: [
      {
        codigo: dados.codigo,
        nome: dados.nomeProduto,
        preco: dados.preco,
        quantidade: dados.qtdPedido || 1,
      },
    ],
    actionSource: "business_messaging",
    messagingChannel: "whatsapp",
    telefone,
    nome: dados.nomeCliente || null,
    userAgent: "WhatsApp/CatalogOrder",
    eventSourceUrl: linkPadariaProduto(dados.codigo),
    orderId: `wa-${dados.codigo}-${Date.now()}`,
  });

  await limparSessaoCatalogoPedido(telefone);
  return {
    ...r,
    metricaAcao: "catalog_pedido_pronto",
    catalogCodigo: dados.codigo,
  };
}

/**
 * Continua o fluxo (texto ou botão da sessão).
 */
export async function continuarPedidoCatalogo(
  telefone,
  texto,
  { wamid, dados: dadosIn, buttonId = null } = {}
) {
  if (buttonId === BTN_CAT_CANCELAR) {
    return cancelarFluxo(telefone);
  }
  if (/^(cancelar|menu|sair|parar)$/i.test(String(texto || "").trim())) {
    return cancelarFluxo(telefone);
  }

  await pausaDigitando(wamid);
  let dados = { ...(dadosIn || {}) };
  const passo = dados.passo || "peso";

  if (passo === "peso") {
    const peso = extrairPeso(texto);
    if (!peso) {
      return enviarMensagemBotoesWhatsapp({
        telefone,
        corpo: `Envie o peso (ex.: *2 kg*).`,
        botoes: [{ id: BTN_CAT_CANCELAR, title: "Cancelar" }],
      });
    }
    dados = { ...dados, peso, passo: "retirada" };
    await salvarSessao(telefone, dados);
    return pedirRetirada(telefone, dados);
  }

  if (passo === "retirada") {
    const raw = String(texto || "").trim();
    if (raw.length < 3 || raw.length > 80) {
      return enviarMensagemBotoesWhatsapp({
        telefone,
        corpo: `Envie data e horário (ex.: *amanhã 15h*).`,
        botoes: [{ id: BTN_CAT_CANCELAR, title: "Cancelar" }],
      });
    }
    dados = { ...dados, retirada: raw, passo: "telefone" };
    await salvarSessao(telefone, dados);
    return pedirTelefone(telefone, dados);
  }

  if (passo === "telefone") {
    if (buttonId === BTN_CAT_TEL_OUTRO) {
      dados = { ...dados, passo: "telefone_digitar" };
      await salvarSessao(telefone, dados);
      return enviarMensagemBotoesWhatsapp({
        telefone,
        corpo: `Digite o número com DDD.`,
        botoes: [{ id: BTN_CAT_CANCELAR, title: "Cancelar" }],
      });
    }

    let tel = null;
    if (buttonId === BTN_CAT_TEL_MESMO) {
      tel = formatarTelBr(telefone);
    } else {
      tel = extrairTelefoneContato(texto, telefone);
    }
    if (!tel) {
      return pedirTelefone(telefone, dados);
    }
    dados = { ...dados, telefoneContato: tel, passo: "feito" };
    await salvarSessao(telefone, dados);
    return enviarResumoCta(telefone, dados);
  }

  if (passo === "telefone_digitar") {
    const digits = String(texto || "").replace(/\D/g, "");
    if (digits.length < 10 || digits.length > 13) {
      return enviarMensagemBotoesWhatsapp({
        telefone,
        corpo: `Número inválido. Envie com DDD.`,
        botoes: [{ id: BTN_CAT_CANCELAR, title: "Cancelar" }],
      });
    }
    const telOk = formatarTelBr(normalizarTelefoneWa(texto) || digits);
    dados = { ...dados, telefoneContato: telOk, passo: "feito" };
    await salvarSessao(telefone, dados);
    return enviarResumoCta(telefone, dados);
  }

  dados = { ...dados, passo: "peso" };
  await salvarSessao(telefone, dados);
  return enviarMensagemBotoesWhatsapp({
    telefone,
    corpo: `Qual o peso aproximado? (ex.: 2 kg)`,
    botoes: [{ id: BTN_CAT_CANCELAR, title: "Cancelar" }],
  });
}
