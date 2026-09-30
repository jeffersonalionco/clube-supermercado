import { getPool } from "../../db.js";
import { mascararCpfParcial } from "../usuarioService.js";
import {
  exigirAtendimento,
  nomeExibicaoAtendente,
  renovarAtendimento,
  textoMensagemAtendente,
} from "./whatsappAtendimentoService.js";
import { MIMES_MIDIA } from "./whatsappMidiaCaixaService.js";

const TIPOS_CATALOGO = new Set(["order", "catalogo"]);
const COLUNAS_MSG =
  "id, direcao, origem, tipo, texto, detalhe, criado_em, apagada_em, reacao_loja, reacao_cliente, wamid";
export const REACOES_LOJA = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
export const HORAS_APAGAR_TODOS = 48;

export function podeApagarParaTodos({
  direcao,
  wamid,
  criadoEm,
  apagadaEm,
  agora = Date.now(),
} = {}) {
  if (apagadaEm || direcao !== "out" || !wamid) return false;
  const enviada = new Date(criadoEm).getTime();
  if (!Number.isFinite(enviada)) return false;
  return agora - enviada <= HORAS_APAGAR_TODOS * 60 * 60 * 1000;
}

export function reacaoLojaValida(emoji) {
  return REACOES_LOJA.includes(emoji);
}

export function emojiRecebido(valor) {
  const marca = String(valor || "").trim();
  if (!marca) return "";
  if (marca.length > 32 || /[\u0000-\u001f]/.test(marca)) return null;
  return marca;
}

function cortar(valor, max) {
  const texto = String(valor || "").trim();
  if (!texto) return null;
  return texto.length > max ? texto.slice(0, max) : texto;
}

export function cpfMascaradoDaFicha(temClube, cpf) {
  if (!temClube) return null;
  return mascararCpfParcial(cpf);
}

export function formatarTelefoneExibicao(telefone) {
  const d = String(telefone || "").replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("55")) {
    return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  }
  if (d.length === 12 && d.startsWith("55")) {
    return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
  }
  return d || "—";
}

function resumirEntrada(msg) {
  const tipoBruto = String(msg?.type || "text");
  const buttonTitle = cortar(msg?.buttonTitle, 200);
  const textoLivre = cortar(msg?.text, 4000);
  const referred =
    msg?.raw?.context?.referred_product ||
    msg?.raw?.context?.whatsapp_referred_product ||
    null;

  if (tipoBruto === "order" || msg?.raw?.order) {
    const itens = (msg.raw?.order?.product_items || [])
      .slice(0, 20)
      .map((it) => ({
        codigo: cortar(it.product_retailer_id, 40),
        quantidade: Number(it.quantity) || 1,
      }))
      .filter((it) => it.codigo);
    const linhas = itens.map((it) => `${it.quantidade}× ${it.codigo}`).join(", ");
    return {
      tipo: "order",
      texto: linhas ? `Pedido: ${linhas}` : "Pedido do catálogo",
      detalhe: itens.length ? { itens } : null,
    };
  }

  if (referred?.product_retailer_id) {
    const codigo = cortar(referred.product_retailer_id, 40);
    return {
      tipo: "catalogo",
      texto: textoLivre || `Pergunta sobre o produto ${codigo}`,
      detalhe: { codigo },
    };
  }

  if (buttonTitle || msg?.buttonId) {
    return {
      tipo: "button",
      texto: buttonTitle || textoLivre || "Botão",
      detalhe: msg?.buttonId ? { buttonId: cortar(msg.buttonId, 80) } : null,
    };
  }

  const legendas = {
    image: "Imagem",
    audio: "Áudio",
    video: "Vídeo",
    sticker: "Figurinha",
    document: "Documento",
    location: "Localização",
    contacts: "Contato",
  };
  const caption =
    msg?.raw?.image?.caption ||
    msg?.raw?.video?.caption ||
    msg?.raw?.document?.caption ||
    null;

  if (legendas[tipoBruto]) {
    return {
      tipo: tipoBruto,
      texto: cortar(caption, 4000) || legendas[tipoBruto],
      detalhe: null,
    };
  }

  return {
    tipo: tipoBruto.slice(0, 40) || "text",
    texto: textoLivre || "Mensagem",
    detalhe: null,
  };
}

export function textoDePayloadSaida(payload) {
  if (!payload) return null;
  if (payload.type === "text") return cortar(payload.text?.body, 4000);
  if (payload.type === "interactive") {
    return cortar(payload.interactive?.body?.text, 4000);
  }
  if (payload.type === "template") {
    const nome = payload.template?.name;
    return cortar(nome ? `Campanha: ${nome}` : "Campanha", 200);
  }
  return cortar(payload.type, 40);
}

export function detalheDePayloadSaida(payload) {
  if (!payload) return null;
  if (payload.type === "interactive") {
    const botoes = (payload.interactive?.action?.buttons || [])
      .map((b) => String(b.reply?.title || "").trim())
      .filter(Boolean)
      .slice(0, 3);
    if (botoes.length) return { botoes };
    const url = String(payload.interactive?.action?.parameters?.url || "");
    const textoBotao = String(
      payload.interactive?.action?.parameters?.display_text || ""
    ).trim();
    if (/^https:\/\//i.test(url)) {
      return {
        cta: {
          texto: (textoBotao || "Abrir").slice(0, 40),
          url: url.slice(0, 500),
        },
      };
    }
  }
  if (payload.type === "template" && payload.template?.name) {
    return { template: String(payload.template.name).slice(0, 80) };
  }
  return null;
}


export function detalhePublico(detalhe) {
  if (!detalhe || typeof detalhe !== "object") return null;
  const out = {};
  if (Array.isArray(detalhe.botoes)) {
    out.botoes = detalhe.botoes
      .map((b) => String(b || "").trim())
      .filter(Boolean)
      .slice(0, 3);
  }
  if (detalhe.cta && /^https:\/\//i.test(String(detalhe.cta.url || ""))) {
    out.cta = {
      texto: String(detalhe.cta.texto || "Abrir").slice(0, 40),
      url: String(detalhe.cta.url).slice(0, 500),
    };
  }
  if (Array.isArray(detalhe.itens)) {
    out.itens = detalhe.itens.slice(0, 20).map((it) => ({
      codigo: String(it.codigo || "").slice(0, 40),
      quantidade: Number(it.quantidade) || 1,
    }));
  }
  if (detalhe.arquivo && MIMES_MIDIA.has(detalhe.mime)) {
    out.temMidia = true;
    out.mime = detalhe.mime;
    if (detalhe.voice) out.voice = true;
    if (detalhe.nomeArquivo) {
      out.nomeArquivo = String(detalhe.nomeArquivo).slice(0, 80);
    }
  }
  if (detalhe.template) out.template = String(detalhe.template).slice(0, 80);
  if (detalhe.autorNome) {
    out.autorNome = String(detalhe.autorNome).replace(/[\r\n]/g, " ").trim().slice(0, 80);
  }
  if (detalhe.encaminhada === true) out.encaminhada = true;
  return Object.keys(out).length ? out : null;
}

export async function registrarMensagemWhatsapp({
  telefone,
  direcao,
  origem,
  tipo,
  texto,
  detalhe = null,
  wamid = null,
}) {
  const tel = String(telefone || "").replace(/\D/g, "");
  if (!tel) return;
  const dir = direcao === "out" ? "out" : "in";
  const ori = ["cliente", "sistema", "campanha", "atendimento"].includes(origem)
    ? origem
    : dir === "out"
      ? "sistema"
      : "cliente";

  const { rows } = await getPool().query(
    `INSERT INTO whatsapp_mensagem
       (telefone, direcao, origem, tipo, texto, detalhe, wamid)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
     ON CONFLICT (wamid) WHERE wamid IS NOT NULL DO NOTHING
     RETURNING id`,
    [
      tel.slice(0, 32),
      dir,
      ori,
      String(tipo || "text").slice(0, 40),
      cortar(texto, 4000),
      detalhe ? JSON.stringify(detalhe) : null,
      wamid ? String(wamid).slice(0, 128) : null,
    ]
  );
  return rows[0]?.id ? Number(rows[0].id) : null;
}

const TIPOS_MIDIA = new Set([
  "image",
  "audio",
  "video",
  "sticker",
  "document",
]);

export async function registrarEntradaWhatsapp(msg, telefone) {
  const resumo = resumirEntrada(msg);
  const id = await registrarMensagemWhatsapp({
    telefone,
    direcao: "in",
    origem: "cliente",
    tipo: resumo.tipo,
    texto: resumo.texto,
    detalhe: resumo.detalhe,
    wamid: msg?.wamid || null,
  });
  if (!id || !TIPOS_MIDIA.has(resumo.tipo)) return id;
  try {
    const { anexarMidiaEntrada } = await import("./whatsappMidiaCaixaService.js");
    await anexarMidiaEntrada({ msg, mensagemId: id });
  } catch (err) {
    console.warn("[whatsapp/conversa] mídia:", err.message);
  }
  return id;
}

function mapearConversa(row) {
  const nome = row.nome_clube || row.nome_wa || null;
  return {
    telefone: row.telefone,
    telefoneFormatado: formatarTelefoneExibicao(row.telefone),
    nome,
    nomeWa: row.nome_wa || null,
    temClube: Boolean(row.tem_clube),
    infoLiberada: Boolean(row.info_liberada),
    ultimaMensagem: row.ultima_mensagem || "",
    ultimaDirecao: row.ultima_direcao,
    ultimaOrigem: row.ultima_origem,
    ultimoTipo: row.ultimo_tipo,
    ultimaEm: row.ultima_em,
  };
}

export async function listarConversasWhatsapp({ busca = "", filtro = "todos", limite = 80 } = {}) {
  const q = String(busca || "").trim().slice(0, 80);
  const digitos = q.replace(/\D/g, "");
  const filtroOk = ["todos", "clube", "catalogo"].includes(filtro) ? filtro : "todos";
  const lim = Math.min(120, Math.max(1, Number(limite) || 80));

  const { rows } = await getPool().query(
    `WITH ultima AS (
       SELECT DISTINCT ON (telefone)
         telefone, texto AS ultima_mensagem, direcao AS ultima_direcao,
         origem AS ultima_origem, tipo AS ultimo_tipo, criado_em AS ultima_em
       FROM whatsapp_mensagem
       WHERE oculto_em IS NULL
       ORDER BY telefone, criado_em DESC
     )
     SELECT u.telefone, u.ultima_mensagem, u.ultima_direcao, u.ultima_origem,
            u.ultimo_tipo, u.ultima_em,
            c.nome_wa, c.tem_clube, c.info_liberada,
            usr.nome AS nome_clube
     FROM ultima u
     LEFT JOIN whatsapp_contato c ON c.telefone = u.telefone
     LEFT JOIN usuario usr ON usr.id = c.usuario_id
     WHERE (
       $1 = ''
       OR c.nome_wa ILIKE '%' || $1 || '%'
       OR usr.nome ILIKE '%' || $1 || '%'
       OR ($2 <> '' AND u.telefone LIKE '%' || $2 || '%')
     )
     AND (
       $3 = 'todos'
       OR ($3 = 'clube' AND c.tem_clube IS TRUE)
       OR (
         $3 = 'catalogo'
         AND EXISTS (
           SELECT 1 FROM whatsapp_mensagem x
           WHERE x.telefone = u.telefone
             AND x.tipo = ANY($4::text[])
         )
       )
     )
     ORDER BY u.ultima_em DESC
     LIMIT $5`,
    [q, digitos, filtroOk, [...TIPOS_CATALOGO], lim]
  );

  return rows.map(mapearConversa);
}

export async function consultarJanelaWhatsapp(telefone) {
  const tel = String(telefone || "").replace(/\D/g, "");
  if (!tel) return { aberta: false, ate: null };
  const { rows } = await getPool().query(
    `SELECT criado_em
     FROM whatsapp_mensagem
     WHERE telefone = $1 AND direcao = 'in'
     ORDER BY criado_em DESC
     LIMIT 1`,
    [tel]
  );
  const ultima = rows[0]?.criado_em ? new Date(rows[0].criado_em) : null;
  if (!ultima || Number.isNaN(ultima.getTime())) return { aberta: false, ate: null };
  const ate = new Date(ultima.getTime() + 24 * 60 * 60 * 1000);
  return { aberta: ate.getTime() > Date.now(), ate: ate.toISOString() };
}

function idPositivo(valor) {
  const n = Number(valor);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

export function mapearMensagem(m) {
  const apagada = Boolean(m.apagada_em);
  return {
    id: Number(m.id),
    direcao: m.direcao,
    origem: m.origem,
    tipo: m.tipo,
    texto: apagada ? "Mensagem apagada" : m.texto || "",
    detalhe: apagada ? null : detalhePublico(m.detalhe),
    criadoEm: m.criado_em,
    apagada,
    reacaoLoja: m.reacao_loja || "",
    reacaoCliente: m.reacao_cliente || "",
    podeApagarTodos: false,
    podeReagir: Boolean(m.wamid) && !apagada,
    podeCompartilhar: !apagada,
  };
}

export async function obterConversaWhatsapp(telefone, opcoes = {}) {
  const tel = String(telefone || "").replace(/\D/g, "");
  if (!tel || tel.length < 10 || tel.length > 15) return null;

  const db = getPool();
  const contato = await db.query(
    `SELECT c.telefone, c.nome_wa, c.tem_clube, c.info_liberada, c.ultima_acao,
            usr.nome AS nome_clube, usr.cpf AS cpf_clube
     FROM whatsapp_contato c
     LEFT JOIN usuario usr ON usr.id = c.usuario_id
     WHERE c.telefone = $1`,
    [tel]
  );
  const existe = await db.query(
    `SELECT 1 FROM whatsapp_mensagem WHERE telefone = $1 LIMIT 1`,
    [tel]
  );
  if (!contato.rows[0] && !existe.rowCount) return null;

  const janela = await consultarJanelaWhatsapp(tel);

  const busca = String(opcoes.busca || "").trim().slice(0, 80);
  const buscaLike = busca.replace(/[\\%_]/g, (ch) => `\\${ch}`);
  const antes = idPositivo(opcoes.antes);
  const depois = idPositivo(opcoes.depois);
  const limite = 40;
  let rows = [];
  let temMais = false;

  const desde = instanteConsulta(opcoes.desde);
  let ocultos = [];

  if (busca) {
    const r = await db.query(
      `SELECT ${COLUNAS_MSG}
       FROM whatsapp_mensagem
       WHERE telefone = $1
         AND oculto_em IS NULL
         AND COALESCE(texto, '') ILIKE '%' || $2 || '%' ESCAPE '\\'
       ORDER BY id DESC
       LIMIT 60`,
      [tel, buscaLike]
    );
    rows = r.rows.reverse();
  } else if (depois) {
    const r = await db.query(
      `SELECT ${COLUNAS_MSG}, oculto_em
       FROM whatsapp_mensagem
       WHERE telefone = $1 AND (
         (id > $2 AND oculto_em IS NULL)
         OR ($3::timestamptz IS NOT NULL AND atualizado_em > $3::timestamptz AND id <= $2)
       )
       ORDER BY id ASC
       LIMIT 80`,
      [tel, depois, desde]
    );
    const visiveis = [];
    for (const row of r.rows) {
      if (row.oculto_em) ocultos.push(Number(row.id));
      else visiveis.push(row);
    }
    rows = visiveis;
  } else if (antes) {
    const r = await db.query(
      `SELECT ${COLUNAS_MSG}
       FROM whatsapp_mensagem
       WHERE telefone = $1 AND id < $2 AND oculto_em IS NULL
       ORDER BY id DESC
       LIMIT $3`,
      [tel, antes, limite + 1]
    );
    temMais = r.rows.length > limite;
    rows = r.rows.slice(0, limite).reverse();
  } else {
    const r = await db.query(
      `SELECT ${COLUNAS_MSG}
       FROM whatsapp_mensagem
       WHERE telefone = $1 AND oculto_em IS NULL
       ORDER BY id DESC
       LIMIT $2`,
      [tel, limite + 1]
    );
    temMais = r.rows.length > limite;
    rows = r.rows.slice(0, limite).reverse();
  }

  const base = contato.rows[0] || { telefone: tel };
  const ultima = rows.at(-1);
  const ficha = mapearConversa({
    telefone: tel,
    nome_wa: base.nome_wa,
    nome_clube: base.nome_clube,
    tem_clube: base.tem_clube,
    info_liberada: base.info_liberada,
    ultima_mensagem: ultima?.texto || "",
    ultima_direcao: ultima?.direcao || null,
    ultima_origem: ultima?.origem || null,
    ultimo_tipo: ultima?.tipo || null,
    ultima_em: ultima?.criado_em || null,
  });

  return {
    ...ficha,
    ultimaAcao: base.ultima_acao || null,
    janelaAberta: janela.aberta,
    janelaAte: janela.ate,
    cpfMascarado: cpfMascaradoDaFicha(base.tem_clube, base.cpf_clube),
    atendimento: await (
      await import("./whatsappAtendimentoService.js")
    ).resumirAtendimento(tel, opcoes.adminUsuario),
    temMais,
    agora: new Date().toISOString(),
    ocultos,
    mensagens: rows.map(mapearMensagem),
  };
}

function instanteConsulta(valor) {
  if (!valor) return null;
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return null;
  return data.toISOString();
}

export async function responderConversaWhatsapp({ telefone, texto, adminUsuario }) {
  const tel = String(telefone || "").replace(/\D/g, "");
  if (!tel || tel.length < 12 || tel.length > 15) {
    return { ok: false, error: "Telefone inválido." };
  }
  const corpo = String(texto || "")
    .replace(/\u0000/g, "")
    .trim();
  if (!corpo) return { ok: false, error: "Escreva uma mensagem." };
  if (corpo.length > 3800) {
    return { ok: false, error: "A mensagem passou do limite." };
  }

  const sessao = await exigirAtendimento({ telefone: tel, adminUsuario });
  if (!sessao.ok) return sessao;

  const janela = await consultarJanelaWhatsapp(tel);
  if (!janela.aberta) {
    return {
      ok: false,
      codigo: "janela",
      error:
        "A janela de 24 horas desta conversa fechou. Uma resposta livre volta quando o cliente escrever de novo.",
      atendimento: sessao.atendimento,
    };
  }

  const nome = nomeExibicaoAtendente(sessao.nome, adminUsuario);
  const { enviarMensagemTextoWhatsapp } = await import("./whatsappCloudService.js");
  const envio = await enviarMensagemTextoWhatsapp({
    telefone: tel,
    texto: textoMensagemAtendente(nome, corpo),
    textoGravado: corpo,
    detalheExtra: { autorNome: nome },
    origem: "atendimento",
  });
  if (!envio.ok) {
    const bruto = String(envio.error || "");
    if (/131047|24 hours|re-engagement|janela/i.test(bruto)) {
      return {
        ok: false,
        codigo: "janela",
        error:
          "A janela de 24 horas desta conversa fechou. Uma resposta livre volta quando o cliente escrever de novo.",
      };
    }
    console.warn("[whatsapp/caixa] resposta:", bruto);
    return { ok: false, error: "Não foi possível enviar agora. Tente de novo em instantes." };
  }

  const renovado = await renovarAtendimento({ telefone: tel, adminUsuario });

  const { rows } = await getPool().query(
    `SELECT ${COLUNAS_MSG}
     FROM whatsapp_mensagem
     WHERE wamid = $1
     LIMIT 1`,
    [envio.messageId]
  );
  return {
    ok: true,
    janelaAberta: janela.aberta,
    janelaAte: janela.ate,
    atendimento: renovado.atendimento || sessao.atendimento,
    mensagem: rows[0] ? mapearMensagem(rows[0]) : null,
  };
}

function nomeArquivoEnvio(original, ext) {
  const base = String(original || "")
    .split(/[/\\]/)
    .pop()
    .replace(/[^\w.\- ()]/g, "")
    .slice(0, 70);
  if (base && base.toLowerCase().endsWith(`.${ext}`)) return base;
  return `arquivo.${ext}`;
}

async function mensagemPorWamid(wamid) {
  if (!wamid) return null;
  const { rows } = await getPool().query(
    `SELECT ${COLUNAS_MSG}
     FROM whatsapp_mensagem
     WHERE wamid = $1
     LIMIT 1`,
    [wamid]
  );
  return rows[0] ? mapearMensagem(rows[0]) : null;
}

function falhaEnvioCaixa(envio) {
  const bruto = String(envio?.error || "");
  if (/131047|24 hours|re-engagement|janela/i.test(bruto)) {
    return {
      ok: false,
      codigo: "janela",
      error:
        "A janela de 24 horas desta conversa fechou. Uma resposta livre volta quando o cliente escrever de novo.",
    };
  }
  console.warn("[whatsapp/caixa] mídia:", bruto);
  return { ok: false, error: "Não foi possível enviar agora. Tente de novo em instantes." };
}

async function prepararVideoParaCelular(salvo) {
  const path = await import("path");
  const fs = await import("fs");
  const { prepararVideoWhatsapp } = await import("./whatsappVideoPrepare.js");
  const prep = await prepararVideoWhatsapp(salvo.caminho, { forcar: true });
  if (!prep.ok) {
    const extra =
      prep.caminho && path.resolve(prep.caminho) !== path.resolve(salvo.caminho)
        ? path.basename(prep.caminho)
        : "";
    return {
      ok: false,
      error: prep.error || "Não foi possível preparar o vídeo para o celular.",
      arquivoExtra: extra,
    };
  }
  const buffer = await fs.promises.readFile(prep.caminho);
  const arquivo = path.basename(prep.caminho);
  if (path.resolve(prep.caminho) !== path.resolve(salvo.caminho)) {
    const { apagarMidiaCaixa } = await import("./whatsappMidiaCaixaService.js");
    await apagarMidiaCaixa(salvo.arquivo);
  }
  return { ok: true, buffer, arquivo };
}

async function prepararAudioParaCelular(salvo) {
  const path = await import("path");
  const fs = await import("fs");
  const { prepararAudioWhatsapp } = await import("./whatsappVideoPrepare.js");
  const prep = await prepararAudioWhatsapp(salvo.caminho);
  if (!prep.ok || !prep.convertido) {
    return prep.ok ? { ok: true, buffer: null, arquivo: salvo.arquivo } : {
      ok: false,
      error: prep.error || "Não foi possível preparar o áudio para o celular.",
      arquivoExtra: prep.caminho ? path.basename(prep.caminho) : "",
    };
  }
  const buffer = await fs.promises.readFile(prep.caminho);
  const arquivo = path.basename(prep.caminho);
  if (path.resolve(prep.caminho) !== path.resolve(salvo.caminho)) {
    const { apagarMidiaCaixa } = await import("./whatsappMidiaCaixaService.js");
    await apagarMidiaCaixa(salvo.arquivo);
  }
  return { ok: true, buffer, arquivo, convertido: true };
}

export async function responderMidiaWhatsapp({
  telefone,
  buffer,
  nomeOriginal,
  legenda,
  adminUsuario,
  voz = false,
}) {
  const tel = String(telefone || "").replace(/\D/g, "");
  if (!tel || tel.length < 12 || tel.length > 15) {
    return { ok: false, error: "Telefone inválido." };
  }
  if (!buffer?.length) return { ok: false, error: "Escolha um arquivo." };
  const corpo = String(legenda || "")
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, 900);

  const sessao = await exigirAtendimento({ telefone: tel, adminUsuario });
  if (!sessao.ok) return sessao;

  const janela = await consultarJanelaWhatsapp(tel);
  if (!janela.aberta) {
    return {
      ok: false,
      codigo: "janela",
      error:
        "A janela de 24 horas desta conversa fechou. Uma resposta livre volta quando o cliente escrever de novo.",
      atendimento: sessao.atendimento,
    };
  }

  const { classificarMidiaEnvio, salvarMidiaCaixa, apagarMidiaCaixa } = await import(
    "./whatsappMidiaCaixaService.js"
  );
  const classe = classificarMidiaEnvio(buffer, nomeOriginal);
  if (!classe.ok) return classe;

  const salvo = await salvarMidiaCaixa(buffer, classe);
  if (!salvo) return { ok: false, error: "Não foi possível guardar o arquivo." };

  let bufferEnvio = buffer;
  let arquivoGuardado = salvo.arquivo;
  let mimeEnvio = classe.mime;
  let extEnvio = classe.ext;
  if (classe.tipo === "video") {
    const preparado = await prepararVideoParaCelular(salvo);
    if (!preparado.ok) {
      await apagarMidiaCaixa(salvo.arquivo);
      if (preparado.arquivoExtra) await apagarMidiaCaixa(preparado.arquivoExtra);
      return { ok: false, error: preparado.error };
    }
    bufferEnvio = preparado.buffer;
    arquivoGuardado = preparado.arquivo;
    mimeEnvio = "video/mp4";
    extEnvio = "mp4";
  }
  if (classe.tipo === "audio" && classe.ext === "webm") {
    const preparado = await prepararAudioParaCelular(salvo);
    if (!preparado.ok) {
      await apagarMidiaCaixa(salvo.arquivo);
      if (preparado.arquivoExtra) await apagarMidiaCaixa(preparado.arquivoExtra);
      return { ok: false, error: preparado.error };
    }
    if (preparado.buffer) {
      bufferEnvio = preparado.buffer;
      arquivoGuardado = preparado.arquivo;
      mimeEnvio = "audio/ogg";
      extEnvio = "ogg";
    }
  }

  const nome = nomeExibicaoAtendente(sessao.nome, adminUsuario);
  const nomeArquivo = nomeArquivoEnvio(nomeOriginal, extEnvio);
  const caption =
    classe.tipo === "audio" ? "" : corpo ? textoMensagemAtendente(nome, corpo) : `*${nome}*`;

  const { enviarMensagemMidiaWhatsapp, enviarMensagemTextoWhatsapp } = await import(
    "./whatsappCloudService.js"
  );
  const envio = await enviarMensagemMidiaWhatsapp({
    telefone: tel,
    tipo: classe.tipo,
    buffer: bufferEnvio,
    mime: mimeEnvio,
    filename: nomeArquivo,
    caption,
    voz: Boolean(voz) && classe.tipo === "audio",
    textoGravado: corpo,
    detalheExtra: {
      autorNome: nome,
      arquivo: arquivoGuardado,
      mime: mimeEnvio,
      ...(voz && classe.tipo === "audio" ? { voice: true } : {}),
      ...(classe.tipo === "document" ? { nomeArquivo } : {}),
    },
    origem: "atendimento",
  });
  if (!envio.ok) {
    await apagarMidiaCaixa(arquivoGuardado);
    return falhaEnvioCaixa(envio);
  }

  const mensagens = [];
  const midia = await mensagemPorWamid(envio.messageId);
  if (midia) mensagens.push(midia);

  let aviso = null;
  if (classe.tipo === "audio" && corpo) {
    const texto = await enviarMensagemTextoWhatsapp({
      telefone: tel,
      texto: textoMensagemAtendente(nome, corpo),
      textoGravado: corpo,
      detalheExtra: { autorNome: nome },
      origem: "atendimento",
    });
    if (texto.ok) {
      const bolha = await mensagemPorWamid(texto.messageId);
      if (bolha) mensagens.push(bolha);
    } else {
      aviso = "O áudio saiu. A legenda não entrou.";
    }
  }

  const renovado = await renovarAtendimento({ telefone: tel, adminUsuario });
  return {
    ok: true,
    aviso,
    janelaAberta: janela.aberta,
    janelaAte: janela.ate,
    atendimento: renovado.atendimento || sessao.atendimento,
    mensagem: mensagens[0] || null,
    mensagens,
  };
}

const LEGENDAS_MIDIA = new Set([
  "Imagem",
  "Áudio",
  "Vídeo",
  "Figurinha",
  "Documento",
  "Localização",
  "Contato",
]);

function tipoEnvioMidia(tipo, mime) {
  if (tipo === "sticker") return "image";
  if (["image", "video", "audio", "document"].includes(tipo)) return tipo;
  const m = String(mime || "");
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  if (m) return "document";
  return null;
}

async function lerLinhaMensagem(mensagemId) {
  const id = idPositivo(mensagemId);
  if (!id) return null;
  const { rows } = await getPool().query(
    `SELECT ${COLUNAS_MSG}, telefone, oculto_em
     FROM whatsapp_mensagem
     WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function mensagemMapeada(id) {
  const row = await lerLinhaMensagem(id);
  return row && !row.oculto_em ? mapearMensagem(row) : null;
}

export async function aplicarReacaoRecebida({ wamidAlvo, emoji }) {
  const alvo = String(wamidAlvo || "").trim().slice(0, 128);
  if (!alvo) return;
  const marca = emojiRecebido(emoji);
  if (marca == null) return;
  await getPool().query(
    `UPDATE whatsapp_mensagem
     SET reacao_cliente = NULLIF($2, ''), atualizado_em = NOW()
     WHERE wamid = $1`,
    [alvo, marca]
  );
}

export async function apagarMensagemParaMim({ mensagemId }) {
  const id = idPositivo(mensagemId);
  if (!id) return { ok: false, error: "Mensagem inválida." };
  const { rowCount } = await getPool().query(
    `UPDATE whatsapp_mensagem
     SET oculto_em = COALESCE(oculto_em, NOW()), atualizado_em = NOW()
     WHERE id = $1`,
    [id]
  );
  if (!rowCount) return { ok: false, error: "Mensagem não encontrada." };
  return { ok: true, id };
}

export async function apagarMensagemParaTodos() {
  return {
    ok: false,
    error:
      "O WhatsApp oficial não permite apagar a mensagem no celular do cliente. Use apagar daqui para tirá-la só desta tela.",
  };
}

export async function reagirMensagemWhatsapp({ mensagemId, emoji, adminUsuario }) {
  const row = await lerLinhaMensagem(mensagemId);
  if (!row || row.oculto_em || row.apagada_em || !row.wamid) {
    return { ok: false, error: "Não dá para reagir nesta mensagem." };
  }
  const pedido = String(emoji || "");
  if (!reacaoLojaValida(pedido)) return { ok: false, error: "Escolha uma reação da lista." };
  const proxima = row.reacao_loja === pedido ? "" : pedido;

  const sessao = await exigirAtendimento({ telefone: row.telefone, adminUsuario });
  if (!sessao.ok) return sessao;
  const janela = await consultarJanelaWhatsapp(row.telefone);
  if (!janela.aberta) {
    return {
      ok: false,
      codigo: "janela",
      error: "A janela de 24 horas fechou. A reação volta quando o cliente escrever de novo.",
    };
  }

  const { enviarReacaoWhatsapp } = await import("./whatsappCloudService.js");
  const envio = await enviarReacaoWhatsapp({
    telefone: row.telefone,
    messageId: row.wamid,
    emoji: proxima,
  });
  if (!envio.ok) {
    console.warn("[whatsapp/caixa] reação:", envio.error);
    return { ok: false, error: "Não foi possível reagir agora. Tente de novo em instantes." };
  }
  await getPool().query(
    `UPDATE whatsapp_mensagem
     SET reacao_loja = NULLIF($2, ''), atualizado_em = NOW()
     WHERE id = $1`,
    [row.id, proxima]
  );
  return { ok: true, mensagem: await mensagemMapeada(row.id) };
}

export async function compartilharMensagemWhatsapp({
  mensagemId,
  telefoneDestino,
  adminUsuario,
}) {
  const row = await lerLinhaMensagem(mensagemId);
  if (!row || row.oculto_em || row.apagada_em) {
    return { ok: false, error: "Não dá para compartilhar esta mensagem." };
  }
  const { normalizarTelefoneWa } = await import("./whatsappCloudService.js");
  const destino = normalizarTelefoneWa(telefoneDestino);
  if (!destino) return { ok: false, error: "Escolha um contato da agenda." };
  if (destino === String(row.telefone || "").replace(/\D/g, "")) {
    return { ok: false, error: "Escolha outro contato." };
  }

  const sessao = await exigirAtendimento({ telefone: row.telefone, adminUsuario });
  if (!sessao.ok) return sessao;

  const destinoAt = await (
    await import("./whatsappAtendimentoService.js")
  ).resumirAtendimento(destino, adminUsuario);
  if (destinoAt && !destinoAt.meu) {
    return { ok: false, error: `Esse contato está com ${destinoAt.nome}.` };
  }

  const janela = await consultarJanelaWhatsapp(destino);
  if (!janela.aberta) {
    return {
      ok: false,
      codigo: "janela",
      error:
        "Esse contato está fora da janela de 24 horas. Ele precisa escrever no WhatsApp de novo para receber.",
    };
  }

  const nome = nomeExibicaoAtendente(sessao.nome, adminUsuario);
  const textoOriginal = LEGENDAS_MIDIA.has(row.texto) ? "" : String(row.texto || "").trim();
  const { enviarMensagemMidiaWhatsapp, enviarMensagemTextoWhatsapp } = await import(
    "./whatsappCloudService.js"
  );

  let messageId = null;
  if (row.detalhe?.arquivo) {
    const { lerMidiaMensagem } = await import("./whatsappMidiaCaixaService.js");
    const fs = await import("fs");
    const midia = await lerMidiaMensagem(row.id);
    const tipo = tipoEnvioMidia(row.tipo, midia?.mime || row.detalhe?.mime);
    if (!midia || !tipo) {
      return { ok: false, error: "O arquivo desta mensagem não está mais disponível para reenviar." };
    }
    const buffer = await fs.promises.readFile(midia.caminho);
    const legenda = textoOriginal
      ? textoMensagemAtendente(nome, `Encaminhada:\n${textoOriginal}`).slice(0, 1000)
      : `*${nome}*`;
    const envio = await enviarMensagemMidiaWhatsapp({
      telefone: destino,
      tipo,
      buffer,
      mime: midia.mime,
      filename: midia.nomeArquivo || `arquivo`,
      caption: tipo === "audio" ? "" : legenda,
      voz: Boolean(row.detalhe?.voice),
      origem: "atendimento",
      textoGravado: textoOriginal || row.texto || "Arquivo",
      detalheExtra: { autorNome: nome, encaminhada: true },
    });
    if (!envio.ok) return falhaEnvioCaixa(envio);
    messageId = envio.messageId;
  } else if (textoOriginal) {
    const envio = await enviarMensagemTextoWhatsapp({
      telefone: destino,
      texto: textoMensagemAtendente(nome, `Encaminhada:\n${textoOriginal}`).slice(0, 3800),
      textoGravado: textoOriginal,
      detalheExtra: { autorNome: nome, encaminhada: true },
      origem: "atendimento",
    });
    if (!envio.ok) return falhaEnvioCaixa(envio);
    messageId = envio.messageId;
  } else {
    return { ok: false, error: "Não há conteúdo para compartilhar." };
  }

  await renovarAtendimento({ telefone: row.telefone, adminUsuario });
  const mensagem = await mensagemPorWamid(messageId);
  return {
    ok: true,
    aviso: "Mensagem enviada para o contato.",
    telefone: destino,
    mensagem,
  };
}
