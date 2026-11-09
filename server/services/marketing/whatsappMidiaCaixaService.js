import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getPool } from "../../db.js";
import { obterConfigWhatsappCloud } from "./whatsappCloudService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PASTA = path.join(__dirname, "../../private/whatsapp-caixa");

const LIMITES = {
  image: 5 * 1024 * 1024,
  sticker: 500 * 1024,
  audio: 16 * 1024 * 1024,
  video: 16 * 1024 * 1024,
  document: 16 * 1024 * 1024,
};

const MIME_DOCUMENTO = {
  txt: "text/plain",
  csv: "text/plain",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

export const MIMES_MIDIA = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "audio/ogg",
  "audio/webm",
  "audio/mpeg",
  "audio/mp4",
  "video/mp4",
  "video/3gpp",
  ...Object.values(MIME_DOCUMENTO),
]);

function blocoMidia(msg) {
  const raw = msg?.raw || {};
  const tipo = String(msg?.type || "");
  const bloco = raw[tipo];
  if (!bloco || typeof bloco !== "object") return null;
  const id = String(bloco.id || "").trim();
  if (!/^\d{6,}$/.test(id)) return null;
  return { tipo, id, bloco };
}

function reconhecerArquivo(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { ext: "jpg", mime: "image/jpeg" };
  }
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { ext: "png", mime: "image/png" };
  }
  if (buf.length >= 6 && buf.toString("ascii", 0, 6) === "GIF87a") {
    return { ext: "gif", mime: "image/gif" };
  }
  if (buf.length >= 6 && buf.toString("ascii", 0, 6) === "GIF89a") {
    return { ext: "gif", mime: "image/gif" };
  }
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    return { ext: "webp", mime: "image/webp" };
  }
  if (buf.length >= 4 && buf.toString("ascii", 0, 4) === "OggS") {
    return { ext: "ogg", mime: "audio/ogg" };
  }
  if (buf.length >= 3 && buf.toString("ascii", 0, 3) === "ID3") {
    return { ext: "mp3", mime: "audio/mpeg" };
  }
  if (buf.length >= 2 && buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) {
    return { ext: "mp3", mime: "audio/mpeg" };
  }
  if (buf.length >= 5 && buf.toString("ascii", 0, 5) === "%PDF-") {
    return { ext: "pdf", mime: "application/pdf" };
  }
  if (buf.length >= 12 && buf.toString("ascii", 4, 8) === "ftyp") {
    const marca = buf.toString("ascii", 8, 12);
    if (marca.startsWith("3gp")) return { ext: "3gp", mime: "video/3gpp" };
    if (marca === "M4A " || marca === "M4A") return { ext: "m4a", mime: "audio/mp4" };
    return { ext: "mp4", mime: "video/mp4" };
  }
  return null;
}

function extensaoNome(nome) {
  const ext = String(nome || "").split(".").pop().toLowerCase();
  return ext && ext.length <= 5 && ext !== String(nome || "").toLowerCase() ? ext : "";
}

function pareceTexto(buf) {
  const amostra = buf.subarray(0, Math.min(buf.length, 8192));
  return amostra.length > 0 && !amostra.includes(0);
}

function ehOle(buf) {
  return buf.length >= 8 && buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0;
}

function ehWebm(buf) {
  return buf.length >= 4 && buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3;
}

function ehZip(buf) {
  return buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
}

function documentoPeloNome(buf, nome) {
  const ext = extensaoNome(nome);
  const mime = MIME_DOCUMENTO[ext];
  if (!mime || ext === "pdf") return null;
  if ((ext === "txt" || ext === "csv") && !pareceTexto(buf)) return null;
  if ((ext === "doc" || ext === "xls" || ext === "ppt") && !ehOle(buf)) return null;
  if ((ext === "docx" || ext === "xlsx" || ext === "pptx") && !ehZip(buf)) return null;
  return { ext, mime };
}

function nomeDocumento(bloco) {
  const bruto = String(bloco?.filename || "").split(/[/\\]/).pop() || "";
  const limpo = bruto.replace(/[^\w.\- ()]/g, "").slice(0, 80);
  return limpo || null;
}

export function classificarMidiaEnvio(buf, nomeOriginal = "") {
  let reconhecido = reconhecerArquivo(buf);
  if (reconhecido?.mime === "image/gif") {
    return { ok: false, error: "GIF não entra. Envie JPG, PNG ou WEBP." };
  }
  if (!reconhecido && ehWebm(buf)) reconhecido = { ext: "webm", mime: "audio/webm" };
  if (reconhecido?.mime === "video/mp4" && /^voz\./i.test(String(nomeOriginal || "").split(/[/\\]/).pop())) {
    reconhecido = { ext: "m4a", mime: "audio/mp4" };
  }
  if (!reconhecido) reconhecido = documentoPeloNome(buf, nomeOriginal);
  if (!reconhecido) {
    return {
      ok: false,
      error: "Envie foto, vídeo, áudio, PDF, TXT, CSV ou documento do Office.",
    };
  }
  let tipo = null;
  if (reconhecido.mime.startsWith("image/")) tipo = "image";
  else if (reconhecido.mime.startsWith("audio/")) tipo = "audio";
  else if (reconhecido.mime.startsWith("video/")) tipo = "video";
  else if (Object.values(MIME_DOCUMENTO).includes(reconhecido.mime)) tipo = "document";
  if (!tipo) return { ok: false, error: "Esse formato não entra no WhatsApp." };
  if (buf.length > LIMITES[tipo]) {
    const mb = Math.round(LIMITES[tipo] / (1024 * 1024));
    return { ok: false, error: `Esse arquivo passa de ${mb} MB.` };
  }
  return { ok: true, tipo, ext: reconhecido.ext, mime: reconhecido.mime };
}

export async function salvarMidiaCaixa(buf, reconhecido) {
  await fs.promises.mkdir(PASTA, { recursive: true });
  const arquivo = `${crypto.randomUUID()}.${reconhecido.ext}`;
  const destino = caminhoMidiaCaixa(arquivo);
  if (!destino) return null;
  await fs.promises.writeFile(destino, buf);
  return { arquivo, mime: reconhecido.mime, caminho: destino };
}

export async function apagarMidiaCaixa(nome) {
  const destino = caminhoMidiaCaixa(nome);
  if (!destino) return;
  await fs.promises.unlink(destino).catch(() => {});
}

export function caminhoMidiaCaixa(nome) {
  const base = path.basename(String(nome || ""));
  if (!base || base !== nome || !/^[\w.-]+$/.test(base)) return null;
  const raiz = path.resolve(PASTA);
  const full = path.resolve(raiz, base);
  if (!full.startsWith(`${raiz}${path.sep}`)) return null;
  return full;
}

async function baixarBinario(url, limite, token) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(25000),
    redirect: "error",
  });
  if (!res.ok) throw new Error(`mídia HTTP ${res.status}`);
  const declarado = Number(res.headers.get("content-length") || 0);
  if (declarado > limite) throw new Error("mídia fora do tamanho permitido");
  const reader = res.body?.getReader?.();
  if (!reader) throw new Error("mídia sem corpo");
  const partes = [];
  let total = 0;
  while (total <= limite) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limite) {
      await reader.cancel().catch(() => {});
      throw new Error("mídia fora do tamanho permitido");
    }
    partes.push(Buffer.from(value));
  }
  await reader.cancel().catch(() => {});
  const buf = Buffer.concat(partes);
  if (!buf.length) throw new Error("mídia vazia");
  return buf;
}

/** Baixa foto, áudio ou vídeo recebidos no webhook, sem gravar na conversa. */
export async function baixarMidiaWebhook(msg) {
  const info = blocoMidia(msg);
  if (!info) return { ok: false, error: "sem mídia" };
  const cfg = obterConfigWhatsappCloud();
  if (!cfg.ok) return { ok: false, error: "WhatsApp sem configuração" };
  const limite = LIMITES[info.tipo] || LIMITES.image;

  const meta = await fetch(
    `https://graph.facebook.com/${cfg.apiVersion}/${info.id}`,
    {
      headers: { Authorization: `Bearer ${cfg.token}` },
      signal: AbortSignal.timeout(12000),
    }
  );
  const corpo = await meta.json().catch(() => ({}));
  if (!meta.ok || !corpo.url) return { ok: false, error: "mídia indisponível" };
  if (corpo.file_size && Number(corpo.file_size) > limite) {
    return { ok: false, error: "arquivo grande demais" };
  }

  const buf = await baixarBinario(corpo.url, limite, cfg.token);
  let reconhecido = reconhecerArquivo(buf);
  if (!reconhecido && info.tipo === "document") {
    reconhecido = documentoPeloNome(buf, nomeDocumento(info.bloco));
  }
  if (!reconhecido) return { ok: false, error: "formato não aceito" };
  if ((info.tipo === "image" || info.tipo === "sticker") && !reconhecido.mime.startsWith("image/")) {
    return { ok: false, error: "formato não aceito" };
  }
  if (info.tipo === "audio" && !reconhecido.mime.startsWith("audio/")) {
    return { ok: false, error: "formato não aceito" };
  }
  if (info.tipo === "video" && !reconhecido.mime.startsWith("video/")) {
    return { ok: false, error: "formato não aceito" };
  }

  const tipo = info.tipo === "sticker" ? "image" : info.tipo;
  return {
    ok: true,
    tipo,
    mime: reconhecido.mime,
    ext: reconhecido.ext,
    buf,
    voice: Boolean(info.bloco.voice),
  };
}

export async function anexarMidiaEntrada({ msg, mensagemId }) {
  const info = blocoMidia(msg);
  if (!info) return;
  const cfg = obterConfigWhatsappCloud();
  if (!cfg.ok) return;
  const limite = LIMITES[info.tipo] || LIMITES.image;

  const meta = await fetch(
    `https://graph.facebook.com/${cfg.apiVersion}/${info.id}`,
    {
      headers: { Authorization: `Bearer ${cfg.token}` },
      signal: AbortSignal.timeout(12000),
    }
  );
  const corpo = await meta.json().catch(() => ({}));
  if (!meta.ok || !corpo.url) return;
  if (corpo.file_size && Number(corpo.file_size) > limite) return;

  const buf = await baixarBinario(corpo.url, limite, cfg.token);
  let reconhecido = reconhecerArquivo(buf);
  if (!reconhecido && info.tipo === "document") {
    reconhecido = documentoPeloNome(buf, nomeDocumento(info.bloco));
  }
  if (!reconhecido) return;
  if (info.tipo === "document" && !Object.values(MIME_DOCUMENTO).includes(reconhecido.mime)) return;
  if ((info.tipo === "image" || info.tipo === "sticker") && !reconhecido.mime.startsWith("image/")) {
    return;
  }
  if (info.tipo === "audio" && !reconhecido.mime.startsWith("audio/")) return;
  if (info.tipo === "video" && !reconhecido.mime.startsWith("video/")) return;

  await fs.promises.mkdir(PASTA, { recursive: true });
  const arquivo = `${crypto.randomUUID()}.${reconhecido.ext}`;
  const destino = caminhoMidiaCaixa(arquivo);
  if (!destino) return;
  await fs.promises.writeFile(destino, buf);

  const extra = {
    arquivo,
    mime: reconhecido.mime,
  };
  if (info.bloco.voice) extra.voice = true;
  const nome = nomeDocumento(info.bloco);
  if (nome) extra.nomeArquivo = nome;

  await getPool().query(
    `UPDATE whatsapp_mensagem
     SET detalhe = COALESCE(detalhe, '{}'::jsonb) || $2::jsonb
     WHERE id = $1`,
    [mensagemId, JSON.stringify(extra)]
  );
}

export async function lerMidiaMensagem(mensagemId) {
  const id = Number(mensagemId);
  if (!Number.isInteger(id) || id <= 0) return null;
  const { rows } = await getPool().query(
    `SELECT detalhe FROM whatsapp_mensagem WHERE id = $1`,
    [id]
  );
  const detalhe = rows[0]?.detalhe;
  const caminho = caminhoMidiaCaixa(detalhe?.arquivo);
  if (!caminho || !MIMES_MIDIA.has(detalhe?.mime)) return null;
  try {
    await fs.promises.access(caminho);
  } catch {
    return null;
  }
  return {
    caminho,
    mime: detalhe.mime,
    nomeArquivo: detalhe.nomeArquivo || null,
  };
}
