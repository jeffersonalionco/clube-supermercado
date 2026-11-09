import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getPool } from "../../db.js";
import { buscarMembroClubePorTelefoneWa } from "../usuarioService.js";
import {
  enviarMensagemBotoesWhatsapp,
  enviarMensagemTextoWhatsapp,
} from "./whatsappCloudService.js";
import { baixarMidiaWebhook } from "./whatsappMidiaCaixaService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PASTA = path.join(__dirname, "../../private/ouvidoria");

export const SESSAO_OUVIDORIA = "ouvidoria";
export const BTN_OUVIDORIA = "btn_conversar";
export const TITULO_BOTAO_OUVIDORIA = "Sugestão/reclamação";

const BTN_ELOGIO = "btn_ouv_elogio";
const BTN_RECLAMACAO = "btn_ouv_reclamacao";
const BTN_SUGESTAO = "btn_ouv_sugestao";
const BTN_CONCLUIR = "btn_ouv_concluir";
const BTN_MENU = "btn_ouv_menu";

const TIPOS = {
  [BTN_ELOGIO]: "elogio",
  [BTN_RECLAMACAO]: "reclamacao",
  [BTN_SUGESTAO]: "sugestao",
};

const ROTULOS = {
  elogio: "Elogio",
  reclamacao: "Reclamação",
  sugestao: "Sugestão",
};

const MAX_ITENS = 20;

function sessaoMin() {
  return Math.max(5, Number(process.env.OUVIDORIA_SESSAO_MIN || 15));
}

export function rotuloTipoOuvidoria(tipo) {
  return ROTULOS[tipo] || "Registro";
}

function legendaMensagem(msg) {
  const raw = msg?.raw || {};
  const bloco = raw[msg?.type] || {};
  return String(bloco.caption || msg?.text || "").trim();
}

async function garantirEstado(telefone) {
  await getPool().query(
    `INSERT INTO whatsapp_auto_reply_estado (telefone, atualizado_em)
     VALUES ($1, NOW())
     ON CONFLICT (telefone) DO NOTHING`,
    [telefone]
  );
}

async function salvarSessao(telefone, dados) {
  await garantirEstado(telefone);
  await getPool().query(
    `UPDATE whatsapp_auto_reply_estado
     SET sessao_modo = $2,
         sessao_atividade_em = NOW(),
         sessao_dados = $3::jsonb,
         atualizado_em = NOW()
     WHERE telefone = $1`,
    [telefone, SESSAO_OUVIDORIA, JSON.stringify(dados || {})]
  );
}

export async function limparSessaoOuvidoria(telefone) {
  await getPool().query(
    `UPDATE whatsapp_auto_reply_estado
     SET sessao_modo = NULL,
         sessao_atividade_em = NULL,
         sessao_dados = NULL,
         atualizado_em = NOW()
     WHERE telefone = $1 AND sessao_modo = $2`,
    [telefone, SESSAO_OUVIDORIA]
  );
}

async function contarMensagens(ticketId) {
  const { rows } = await getPool().query(
    `SELECT COUNT(*)::int AS n FROM ouvidoria_mensagem WHERE ticket_id = $1`,
    [ticketId]
  );
  return rows[0]?.n || 0;
}

async function descartarTicketVazio(ticketId) {
  if (!ticketId) return;
  const n = await contarMensagens(ticketId);
  if (n > 0) return;
  await getPool().query(`DELETE FROM ouvidoria_ticket WHERE id = $1`, [ticketId]);
}

function textoConfirmacao(tipo) {
  if (tipo === "elogio") return "Seu *elogio* foi salvo com sucesso. Obrigado.";
  if (tipo === "sugestao") return "Sua *sugestão* foi salva com sucesso. Obrigado.";
  return "Sua *reclamação* foi salva com sucesso. Obrigado.";
}

async function encerrarColeta(ticketId) {
  if (!ticketId) return false;
  const n = await contarMensagens(ticketId);
  if (!n) {
    await descartarTicketVazio(ticketId);
    return false;
  }
  await getPool().query(
    `UPDATE ouvidoria_ticket
     SET concluido_em = COALESCE(concluido_em, NOW()),
         atualizado_em = NOW()
     WHERE id = $1`,
    [ticketId]
  );
  return true;
}

/** Fecha quem passou do prazo. Sem conteúdo, o ticket some. Com conteúdo, avisa no WhatsApp. */
export async function limparSessoesOuvidoriaExpiradas() {
  const { rows } = await getPool().query(
    `WITH alvo AS (
       SELECT telefone, sessao_dados
       FROM whatsapp_auto_reply_estado
       WHERE sessao_modo = $1
         AND (
           sessao_atividade_em IS NULL
           OR sessao_atividade_em < NOW() - ($2::text || ' minutes')::interval
         )
       FOR UPDATE
     )
     UPDATE whatsapp_auto_reply_estado e
     SET sessao_modo = NULL,
         sessao_atividade_em = NULL,
         sessao_dados = NULL,
         atualizado_em = NOW()
     FROM alvo
     WHERE e.telefone = alvo.telefone
     RETURNING e.telefone, alvo.sessao_dados AS sessao_dados`,
    [SESSAO_OUVIDORIA, String(sessaoMin())]
  );

  for (const row of rows) {
    const dados = row.sessao_dados || {};
    try {
      const salvou = await encerrarColeta(dados.ticketId);
      if (!salvou) continue;
      await enviarMensagemTextoWhatsapp({
        telefone: row.telefone,
        texto: textoConfirmacao(dados.tipo),
      });
    } catch (err) {
      console.warn("[ouvidoria] prazo:", row.telefone, err.message);
    }
  }
}

let jobLimpezaOuvidoria = null;

export function iniciarJobLimpezaOuvidoria() {
  if (jobLimpezaOuvidoria) return;
  const tick = () => {
    limparSessoesOuvidoriaExpiradas().catch((err) =>
      console.warn("[ouvidoria] limpeza:", err.message)
    );
  };
  jobLimpezaOuvidoria = setInterval(tick, 60 * 1000);
  setTimeout(tick, 20_000);
}

export async function obterSessaoOuvidoria(telefone) {
  await limparSessoesOuvidoriaExpiradas();
  const { rows } = await getPool().query(
    `SELECT sessao_modo, sessao_dados
     FROM whatsapp_auto_reply_estado WHERE telefone = $1`,
    [telefone]
  );
  const estado = rows[0];
  if (!estado || estado.sessao_modo !== SESSAO_OUVIDORIA) {
    return { ativa: false, dados: null };
  }
  return { ativa: true, dados: estado.sessao_dados || {} };
}

async function pedirTipo(telefone) {
  return enviarMensagemBotoesWhatsapp({
    telefone,
    cabecalho: "SUA OPINIÃO",
    corpo:
      `O que você quer registrar?\n\n` +
      `Depois pode mandar *texto*, *áudio* ou *foto* por cerca de *${sessaoMin()} min*. ` +
      `Tudo fica anônimo, e asseguramos que suas informações ficarão seguras conosco.`,
    rodape: "Escolha um tipo",
    botoes: [
      { id: BTN_ELOGIO, title: "Elogio" },
      { id: BTN_RECLAMACAO, title: "Reclamação" },
      { id: BTN_SUGESTAO, title: "Sugestão" },
    ],
  });
}

export async function iniciarOuvidoria(telefone) {
  await salvarSessao(telefone, { passo: "tipo" });
  const r = await pedirTipo(telefone);
  return { ...r, metricaAcao: "conversar" };
}

async function abrirTicket(telefone, tipo) {
  let membro = null;
  try {
    membro = await buscarMembroClubePorTelefoneWa(telefone);
  } catch (err) {
    console.warn("[ouvidoria] membro:", err.message);
  }
  const { rows } = await getPool().query(
    `INSERT INTO ouvidoria_ticket (telefone, usuario_id, nome, cpf, tipo)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [
      telefone,
      membro?.id || null,
      membro?.nome || null,
      membro?.cpf || null,
      tipo,
    ]
  );
  return rows[0].id;
}

async function pedirConteudo(telefone, tipo) {
  return enviarMensagemBotoesWhatsapp({
    telefone,
    cabecalho: rotuloTipoOuvidoria(tipo).toUpperCase(),
    corpo:
      `Pode escrever, mandar *áudio* ou *foto* agora.\n` +
      `Você tem cerca de *${sessaoMin()} min*. Pode enviar mais de uma mensagem.\n\n` +
      `Quando terminar, toque em *Concluir*.`,
    rodape: "A loja vai ler este registro",
    botoes: [
      { id: BTN_CONCLUIR, title: "Concluir" },
      { id: BTN_MENU, title: "Voltar ao menu" },
    ],
  });
}

async function gravarArquivo(buf, ext) {
  await fs.promises.mkdir(PASTA, { recursive: true });
  const arquivo = `${crypto.randomUUID()}.${ext}`;
  const destino = caminhoArquivoOuvidoria(arquivo);
  if (!destino) return null;
  await fs.promises.writeFile(destino, buf);
  return arquivo;
}

export function caminhoArquivoOuvidoria(nome) {
  const base = path.basename(String(nome || ""));
  if (!base || base !== nome || !/^[\w.-]+$/.test(base)) return null;
  const raiz = path.resolve(PASTA);
  const full = path.resolve(raiz, base);
  if (!full.startsWith(`${raiz}${path.sep}`)) return null;
  return full;
}

async function anexarEntrada(ticketId, msg) {
  const tipoMsg = String(msg?.type || "");
  if (tipoMsg === "text") {
    const texto = String(msg.text || "").trim();
    if (!texto) return { ok: false, vazio: true };
    await getPool().query(
      `INSERT INTO ouvidoria_mensagem (ticket_id, tipo, texto) VALUES ($1, 'text', $2)`,
      [ticketId, texto.slice(0, 4000)]
    );
    return { ok: true };
  }

  if (!["image", "audio", "video", "sticker"].includes(tipoMsg)) {
    return { ok: false, invalido: true };
  }

  const baixado = await baixarMidiaWebhook(msg);
  if (!baixado.ok) return { ok: false, invalido: true };
  const arquivo = await gravarArquivo(baixado.buf, baixado.ext);
  if (!arquivo) return { ok: false, invalido: true };
  const texto = legendaMensagem(msg).slice(0, 1000) || null;
  await getPool().query(
    `INSERT INTO ouvidoria_mensagem (ticket_id, tipo, texto, arquivo, mime)
     VALUES ($1, $2, $3, $4, $5)`,
    [ticketId, baixado.tipo, texto, arquivo, baixado.mime]
  );
  return { ok: true };
}

function botaoDeMenu(buttonId) {
  if (!buttonId) return false;
  if (buttonId === BTN_OUVIDORIA) return false;
  if (TIPOS[buttonId] || buttonId === BTN_CONCLUIR || buttonId === BTN_MENU) return false;
  return true;
}

export async function continuarOuvidoria(telefone, msg) {
  const sess = await obterSessaoOuvidoria(telefone);
  if (!sess.ativa) return { seguir: true };

  const dados = { ...sess.dados };
  const buttonId = msg.buttonId || null;

  if (buttonId === BTN_OUVIDORIA) {
    await encerrarColeta(dados.ticketId);
    return iniciarOuvidoria(telefone);
  }

  if (botaoDeMenu(buttonId)) {
    await encerrarColeta(dados.ticketId);
    await limparSessaoOuvidoria(telefone);
    return { seguir: true };
  }

  if (buttonId === BTN_MENU) {
    await encerrarColeta(dados.ticketId);
    await limparSessaoOuvidoria(telefone);
    return { reabrirMenu: true, metricaAcao: "ouvidoria_menu" };
  }

  if (dados.passo === "tipo") {
    const tipo = TIPOS[buttonId];
    if (!tipo) {
      const r = await pedirTipo(telefone);
      return { ...r, metricaAcao: "ouvidoria_tipo" };
    }
    const ticketId = await abrirTicket(telefone, tipo);
    await salvarSessao(telefone, { passo: "coleta", tipo, ticketId, recebidos: 0 });
    const r = await pedirConteudo(telefone, tipo);
    return { ...r, metricaAcao: `ouvidoria_${tipo}` };
  }

  if (buttonId === BTN_CONCLUIR) {
    const n = await contarMensagens(dados.ticketId);
    if (!n) {
      const r = await enviarMensagemTextoWhatsapp({
        telefone,
        texto: "Ainda não recebi texto, áudio ou foto. Pode mandar agora e depois tocar em *Concluir*.",
      });
      await salvarSessao(telefone, dados);
      return { ...r, metricaAcao: "ouvidoria_vazio" };
    }
    await encerrarColeta(dados.ticketId);
    await limparSessaoOuvidoria(telefone);
    const r = await enviarMensagemTextoWhatsapp({
      telefone,
      texto: textoConfirmacao(dados.tipo),
    });
    return { ...r, metricaAcao: "ouvidoria_concluida" };
  }

  if (buttonId && TIPOS[buttonId]) {
    const r = await pedirConteudo(telefone, dados.tipo);
    await salvarSessao(telefone, dados);
    return { ...r, metricaAcao: "ouvidoria_coleta" };
  }

  const jaTem = await contarMensagens(dados.ticketId);
  if (jaTem >= MAX_ITENS) {
    const r = await enviarMensagemTextoWhatsapp({
      telefone,
      texto: "Este registro já está cheio. Toque em *Concluir* para a loja ler.",
    });
    await salvarSessao(telefone, dados);
    return { ...r, metricaAcao: "ouvidoria_limite" };
  }

  const anexo = await anexarEntrada(dados.ticketId, msg);
  if (anexo.vazio) {
    await salvarSessao(telefone, dados);
    return { ok: true, skipMetric: true };
  }
  if (!anexo.ok) {
    const r = await enviarMensagemTextoWhatsapp({
      telefone,
      texto: "Consigo guardar *texto*, *áudio* ou *foto*. Manda de novo nesse formato.",
    });
    await salvarSessao(telefone, dados);
    return { ...r, metricaAcao: "ouvidoria_formato" };
  }

  dados.recebidos = (dados.recebidos || 0) + 1;
  await getPool().query(
    `UPDATE ouvidoria_ticket SET atualizado_em = NOW() WHERE id = $1`,
    [dados.ticketId]
  );
  await salvarSessao(telefone, dados);

  if (dados.recebidos === 1) {
    const r = await enviarMensagemTextoWhatsapp({
      telefone,
      texto: "Anotado. Pode mandar mais, ou toque em *Concluir* quando terminar.",
    });
    return { ...r, metricaAcao: "ouvidoria_item" };
  }
  return { ok: true, metricaAcao: "ouvidoria_item", skipMetric: true };
}

export async function listarTicketsOuvidoria({ tipo, status, limite = 40 } = {}) {
  const filtros = [];
  const params = [];
  if (tipo && ROTULOS[tipo]) {
    params.push(tipo);
    filtros.push(`t.tipo = $${params.length}`);
  }
  if (status && ["aberto", "lido", "resolvido"].includes(status)) {
    params.push(status);
    filtros.push(`t.status = $${params.length}`);
  }
  params.push(Math.min(100, Math.max(1, Number(limite) || 40)));
  const where = filtros.length ? `WHERE ${filtros.join(" AND ")}` : "";
  const { rows } = await getPool().query(
    `SELECT t.id, t.telefone, t.usuario_id, t.nome, t.cpf, t.tipo, t.status,
            t.criado_em, t.atualizado_em, t.concluido_em,
            COUNT(m.id)::int AS mensagens,
            LEFT(STRING_AGG(m.texto, ' ' ORDER BY m.criado_em), 180) AS previa
     FROM ouvidoria_ticket t
     LEFT JOIN ouvidoria_mensagem m ON m.ticket_id = t.id
     ${where}
     GROUP BY t.id
     HAVING COUNT(m.id) > 0
     ORDER BY t.atualizado_em DESC
     LIMIT $${params.length}`,
    params
  );
  const { rows: totais } = await getPool().query(
    `SELECT t.tipo, t.status, COUNT(*)::int AS n
     FROM ouvidoria_ticket t
     WHERE EXISTS (
       SELECT 1 FROM ouvidoria_mensagem m WHERE m.ticket_id = t.id
     )
     GROUP BY t.tipo, t.status`
  );
  return { itens: rows, totais };
}

export async function obterTicketOuvidoria(id) {
  const ticketId = Number(id);
  if (!Number.isInteger(ticketId) || ticketId <= 0) return null;
  const { rows } = await getPool().query(
    `SELECT id, telefone, usuario_id, nome, cpf, tipo, status,
            criado_em, atualizado_em, concluido_em
     FROM ouvidoria_ticket WHERE id = $1`,
    [ticketId]
  );
  const ticket = rows[0];
  if (!ticket) return null;
  const { rows: mensagens } = await getPool().query(
    `SELECT id, tipo, texto, arquivo, mime, criado_em
     FROM ouvidoria_mensagem
     WHERE ticket_id = $1
     ORDER BY criado_em, id`,
    [ticketId]
  );
  return { ...ticket, mensagens };
}

export async function atualizarStatusOuvidoria(id, status) {
  if (!["aberto", "lido", "resolvido"].includes(status)) {
    return { ok: false, error: "Status inválido" };
  }
  const { rows } = await getPool().query(
    `UPDATE ouvidoria_ticket
     SET status = $2, atualizado_em = NOW()
     WHERE id = $1
     RETURNING id, status`,
    [Number(id), status]
  );
  if (!rows[0]) return { ok: false, error: "Registro não encontrado" };
  return { ok: true, ticket: rows[0] };
}

export async function lerArquivoOuvidoria(ticketId, mensagemId) {
  const { rows } = await getPool().query(
    `SELECT m.arquivo, m.mime
     FROM ouvidoria_mensagem m
     WHERE m.id = $1 AND m.ticket_id = $2`,
    [Number(mensagemId), Number(ticketId)]
  );
  const row = rows[0];
  const caminho = caminhoArquivoOuvidoria(row?.arquivo);
  if (!caminho || !row?.mime) return null;
  try {
    await fs.promises.access(caminho);
  } catch {
    return null;
  }
  return { caminho, mime: row.mime };
}
