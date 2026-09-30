import crypto from "crypto";
import dns from "dns/promises";
import fs from "fs";
import net from "net";
import path from "path";
import { fileURLToPath } from "url";
import { getPool } from "../../db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PASTA = path.join(__dirname, "../../private/whatsapp-previews");

function ipPrivado(ip) {
  const versao = net.isIP(ip);
  if (versao === 4) {
    const p = ip.split(".").map(Number);
    if (p[0] === 0 || p[0] === 10 || p[0] === 127) return true;
    if (p[0] === 169 && p[1] === 254) return true;
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
    if (p[0] === 192 && p[1] === 168) return true;
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true;
    if (p[0] >= 224) return true;
    return false;
  }
  if (versao === 6) {
    const n = ip.toLowerCase();
    if (n === "::1" || n === "::") return true;
    if (n.startsWith("fe80") || n.startsWith("fc") || n.startsWith("fd")) return true;
    if (n.startsWith("::ffff:")) return ipPrivado(n.slice(7));
    return false;
  }
  return true;
}

function hostBloqueado(hostname) {
  const host = String(hostname || "").replace(/\.$/, "").toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
    return true;
  }
  if (host === "metadata.google.internal" || host === "metadata") return true;
  return false;
}

export async function validarUrlPreview(urlString) {
  let url;
  try {
    url = new URL(String(urlString || "").trim());
  } catch {
    return { ok: false, motivo: "url" };
  }
  if (url.protocol !== "https:") return { ok: false, motivo: "protocolo" };
  if (url.username || url.password) return { ok: false, motivo: "credencial" };
  if (url.port && url.port !== "443") return { ok: false, motivo: "porta" };
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (hostBloqueado(host)) return { ok: false, motivo: "host" };
  if (net.isIP(host)) {
    if (ipPrivado(host)) return { ok: false, motivo: "rede" };
    return { ok: true, url };
  }
  let enderecos = [];
  try {
    enderecos = await dns.lookup(host, { all: true });
  } catch {
    return { ok: false, motivo: "dns" };
  }
  if (!enderecos.length || enderecos.some((item) => ipPrivado(item.address))) {
    return { ok: false, motivo: "rede" };
  }
  return { ok: true, url };
}

function hashUrl(url) {
  return crypto.createHash("sha256").update(url).digest("hex");
}

function textoMeta(valor, max) {
  const limpo = String(valor || "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  return limpo ? limpo.slice(0, max) : null;
}

function lerMeta(html, chave) {
  const seguro = chave.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const a = new RegExp(
    `<meta[^>]+(?:property|name)=["']${seguro}["'][^>]+content=["']([^"']+)["']`,
    "i"
  );
  const b = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${seguro}["']`,
    "i"
  );
  return html.match(a)?.[1] || html.match(b)?.[1] || null;
}

async function lerLimiteBuffer(res, max) {
  const reader = res.body?.getReader?.();
  if (!reader) return null;
  const partes = [];
  let total = 0;
  while (total <= max) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    partes.push(Buffer.from(value));
  }
  await reader.cancel().catch(() => {});
  return Buffer.concat(partes);
}

async function lerLimite(res, max) {
  const buf = await lerLimiteBuffer(res, max);
  return buf ? buf.toString("utf8") : null;
}

function reconhecerImagem(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { ext: "jpg", mime: "image/jpeg" };
  }
  if (buf.length >= 8 && buf[0] === 0x89 && buf.toString("ascii", 1, 4) === "PNG") {
    return { ext: "png", mime: "image/png" };
  }
  if (buf.length >= 6 && buf.toString("ascii", 0, 4) === "GIF8") {
    return { ext: "gif", mime: "image/gif" };
  }
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    return { ext: "webp", mime: "image/webp" };
  }
  return null;
}

async function baixarHtml(urlInicial) {
  let atual = urlInicial;
  for (let salto = 0; salto < 3; salto += 1) {
    const valido = await validarUrlPreview(atual);
    if (!valido.ok) return null;
    const res = await fetch(valido.url, {
      redirect: "manual",
      signal: AbortSignal.timeout(4000),
      headers: {
        Accept: "text/html",
        "User-Agent": "SuperamaClubePreview/1.0",
      },
    });
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const destino = res.headers.get("location");
      if (!destino) return null;
      atual = new URL(destino, valido.url).href;
      continue;
    }
    if (!res.ok) return null;
    const tipo = String(res.headers.get("content-type") || "");
    if (!/text\/html|application\/xhtml/i.test(tipo)) return null;
    const declarado = Number(res.headers.get("content-length") || 0);
    if (declarado > 1_000_000) return null;
    const html = await lerLimite(res, 200_000);
    if (!html) return null;
    return { html, finalUrl: valido.url.href };
  }
  return null;
}

async function baixarImagemPreview(urlImagem) {
  const valido = await validarUrlPreview(urlImagem);
  if (!valido.ok) return null;
  const res = await fetch(valido.url, {
    redirect: "manual",
    signal: AbortSignal.timeout(4000),
    headers: { Accept: "image/*", "User-Agent": "SuperamaClubePreview/1.0" },
  });
  if (!res.ok) return null;
  const declarado = Number(res.headers.get("content-length") || 0);
  if (declarado > 1_500_000) return null;
  const buf = await lerLimiteBuffer(res, 1_500_000);
  if (!buf || buf.length < 32) return null;
  const tipo = reconhecerImagem(buf);
  if (!tipo) return null;
  await fs.promises.mkdir(PASTA, { recursive: true });
  const nome = `${crypto.randomUUID()}.${tipo.ext}`;
  const destino = path.resolve(PASTA, nome);
  if (!destino.startsWith(`${path.resolve(PASTA)}${path.sep}`)) return null;
  await fs.promises.writeFile(destino, buf);
  return nome;
}

function siteDe(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").slice(0, 120);
  } catch {
    return null;
  }
}

async function montarPreview(url) {
  const pagina = await baixarHtml(url);
  if (!pagina) return { ok: false, titulo: null, descricao: null, imagem: null, site: siteDe(url) };
  const titulo =
    textoMeta(lerMeta(pagina.html, "og:title"), 180) ||
    textoMeta(pagina.html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1], 180);
  const descricao = textoMeta(
    lerMeta(pagina.html, "og:description") || lerMeta(pagina.html, "description"),
    300
  );
  let imagem = null;
  const ogImagem = lerMeta(pagina.html, "og:image");
  if (ogImagem) {
    try {
      const absoluta = new URL(ogImagem, pagina.finalUrl).href;
      imagem = await baixarImagemPreview(absoluta);
    } catch {
      imagem = null;
    }
  }
  return {
    ok: Boolean(titulo || descricao || imagem),
    titulo,
    descricao,
    imagem,
    site: siteDe(pagina.finalUrl),
  };
}

export async function obterPreviewLink(urlInformada) {
  const valido = await validarUrlPreview(urlInformada);
  if (!valido.ok) return { ok: false };
  const canonical = valido.url.href.slice(0, 2000);
  const urlHash = hashUrl(canonical);
  const db = getPool();
  const cache = await db.query(
    `SELECT * FROM whatsapp_link_preview
     WHERE url_hash = $1
       AND consultado_em > NOW() - INTERVAL '7 days'`,
    [urlHash]
  );
  let row = cache.rows[0];
  if (!row) {
    const previa = await montarPreview(canonical);
    const salvo = await db.query(
      `INSERT INTO whatsapp_link_preview
         (url_hash, url, titulo, descricao, imagem, site, ok, consultado_em)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (url_hash) DO UPDATE
         SET titulo = EXCLUDED.titulo,
             descricao = EXCLUDED.descricao,
             imagem = EXCLUDED.imagem,
             site = EXCLUDED.site,
             ok = EXCLUDED.ok,
             consultado_em = NOW()
       RETURNING *`,
      [
        urlHash,
        canonical,
        previa.titulo,
        previa.descricao,
        previa.imagem,
        previa.site,
        previa.ok,
      ]
    );
    row = salvo.rows[0];
  }
  if (!row?.ok) return { ok: false };
  return {
    ok: true,
    hash: row.url_hash,
    titulo: row.titulo,
    descricao: row.descricao,
    site: row.site,
    temImagem: Boolean(row.imagem),
  };
}

export function caminhoPreviewImagem(hash) {
  if (!/^[a-f0-9]{64}$/.test(String(hash || ""))) return null;
  return hash;
}

export async function lerImagemPreview(hash) {
  if (!caminhoPreviewImagem(hash)) return null;
  const { rows } = await getPool().query(
    `SELECT imagem FROM whatsapp_link_preview WHERE url_hash = $1 AND ok = TRUE`,
    [hash]
  );
  const nome = rows[0]?.imagem;
  if (!nome || !/^[\w.-]+$/.test(nome)) return null;
  const full = path.resolve(PASTA, path.basename(nome));
  if (!full.startsWith(`${path.resolve(PASTA)}${path.sep}`)) return null;
  const ext = path.extname(full).toLowerCase();
  const mime =
    ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : ext === ".gif" ? "image/gif" : "image/jpeg";
  try {
    await fs.promises.access(full);
  } catch {
    return null;
  }
  return { caminho: full, mime };
}
