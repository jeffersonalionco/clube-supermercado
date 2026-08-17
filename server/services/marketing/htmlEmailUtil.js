import { appPublicUrl } from "../mailService.js";

/**
 * Converte HTML do editor em texto puro para a versão plaintext do e-mail.
 */
export function htmlParaTexto(html) {
  return String(html || "")
    .replace(/\r\n/g, "\n")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*p\s*>/gi, "\n\n")
    .replace(/<\/\s*h[1-6]\s*>/gi, "\n\n")
    .replace(/<\/\s*li\s*>/gi, "\n")
    .replace(/<\s*hr\b[^>]*>/gi, "\n---\n")
    .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, txt) => {
      const t = String(txt).replace(/<[^>]+>/g, "").trim();
      return t ? `${t} (${href})` : href;
    })
    .replace(/<img\b[^>]*alt=["']([^"']*)["'][^>]*>/gi, (_, alt) => (alt ? `[${alt}]` : "[imagem]"))
    .replace(/<img\b[^>]*>/gi, "[imagem]")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Torna URLs relativas de /uploads absolutas (necessário em clientes de e-mail).
 */
export function absolutizarUrlsHtml(html, baseUrl = appPublicUrl()) {
  const base = String(baseUrl || "").replace(/\/$/, "");
  if (!base) return String(html || "");

  let out = String(html || "").replace(
    /\b(src|href)=(["'])(\/uploads\/[^"']+)\2/gi,
    (_m, attr, quote, path) => `${attr}=${quote}${base}${path}${quote}`
  );

  // Links da página pública de vídeo (hash SPA)
  out = out.replace(
    /\bhref=(["'])(#\/assistir-video\?[^"']+)\1/gi,
    (_m, quote, hash) => `href=${quote}${base}/${hash}${quote}`
  );

  return out;
}

/**
 * Ajusta HTML do corpo para compatibilidade com clientes de e-mail.
 */
export function prepararCorpoHtmlEmail(html, baseUrl = appPublicUrl()) {
  let corpo = absolutizarUrlsHtml(html, baseUrl);

  corpo = corpo.replace(/<img\b([^>]*)>/gi, (_m, attrs) => {
    let a = String(attrs || "");
    if (!/\bstyle=/i.test(a)) {
      a += ' style="max-width:100%;height:auto;display:block;border:0;margin:12px 0;"';
    } else if (!/max-width/i.test(a)) {
      a = a.replace(
        /\bstyle=(["'])([\s\S]*?)\1/i,
        (_s, q, style) =>
          `style=${q}${style};max-width:100%;height:auto;display:block;border:0;${q}`
      );
    }
    if (!/\balt=/i.test(a)) {
      a += ' alt=""';
    }
    return `<img${a}>`;
  });

  corpo = corpo.replace(/<a\b([^>]*)>/gi, (_m, attrs) => {
    let a = String(attrs || "");
    if (!/\btarget=/i.test(a)) {
      a += ' target="_blank"';
    }
    if (!/\brel=/i.test(a)) {
      a += ' rel="noopener noreferrer"';
    }
    if (!/\bstyle=/i.test(a)) {
      a += ' style="color:#1b4fa0;"';
    }
    return `<a${a}>`;
  });

  return corpo;
}

/**
 * Enrichment só para preview no admin: mostra <video> e iframe YouTube.
 * O e-mail real continua com capa/botão (compatível com clientes de e-mail).
 */
export function enriquecerPreviewMidia(html, baseUrl = appPublicUrl()) {
  const base = String(baseUrl || "").replace(/\/$/, "");
  let corpo = String(html || "");

  function absUpload(pathOrUrl) {
    const s = String(pathOrUrl || "").trim();
    if (!s) return s;
    if (/^https?:\/\//i.test(s)) return s;
    if (s.startsWith("/")) return `${base}${s}`;
    return `${base}/${s}`;
  }

  corpo = corpo.replace(
    /<table\b[^>]*class="[^"]*\bmkt-video\b[^"]*"[^>]*>[\s\S]*?<\/table>/gi,
    (table) => {
      const m = table.match(/assistir-video\?src=([^"'&\s]+)/i);
      if (!m?.[1]) return table;
      let path = m[1];
      try {
        path = decodeURIComponent(path);
      } catch {
        /* keep raw */
      }
      const src = absUpload(path);
      return `<div style="margin:16px 0;text-align:center;">
  <video controls playsinline preload="metadata" src="${src}" style="max-width:100%;width:560px;border-radius:12px;background:#000;display:block;margin:0 auto;"></video>
  <p style="margin:8px 0 0;font-size:12px;color:#5b6b7c;">Pré-visualização do vídeo · no e-mail enviado aparece como botão “Assistir”</p>
</div>`;
    }
  );

  corpo = corpo.replace(
    /<table\b[^>]*class="[^"]*\bmkt-yt\b[^"]*"[^>]*>[\s\S]*?<\/table>/gi,
    (table) => {
      const href = table.match(/href=(["'])(https?:\/\/[^"']+)\1/i)?.[2] || "";
      const id = extrairYoutubeId(href);
      if (!id) return table;
      return `<div style="margin:16px 0;text-align:center;">
  <div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:12px;max-width:560px;margin:0 auto;">
    <iframe src="https://www.youtube.com/embed/${encodeURIComponent(id)}" title="YouTube" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;"></iframe>
  </div>
  <p style="margin:8px 0 0;font-size:12px;color:#5b6b7c;">Pré-visualização YouTube · no e-mail enviado aparece a capa clicável</p>
</div>`;
    }
  );

  return corpo;
}

export function extrairYoutubeId(url) {
  const s = String(url || "").trim();
  if (!s) return null;
  const patterns = [
    /(?:youtube\.com\/watch\?[^#]*v=|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtu\.be\/)([A-Za-z0-9_-]{6,})/i,
    /^([A-Za-z0-9_-]{11})$/,
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m?.[1]) return m[1];
  }
  try {
    const u = new URL(s);
    const v = u.searchParams.get("v");
    if (v) return v;
  } catch {
    /* ignore */
  }
  return null;
}

export function blocoYoutubeHtml(videoId, { titulo = "Assistir no YouTube" } = {}) {
  const id = String(videoId || "").trim();
  const watch = `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
  const thumb = `https://img.youtube.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`;
  return `
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" class="mkt-yt" style="margin:16px 0;">
  <tr>
    <td align="center">
      <a href="${watch}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;display:inline-block;">
        <img src="${thumb}" alt="${titulo.replace(/"/g, "")}" width="560" style="max-width:100%;height:auto;display:block;border:0;border-radius:8px;" />
      </a>
      <p style="margin:10px 0 0;text-align:center;">
        <a href="${watch}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:#e31c23;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:10px 18px;border-radius:8px;">
          ▶ ${titulo.replace(/</g, "")}
        </a>
      </p>
    </td>
  </tr>
</table>`.trim();
}

export function blocoBotaoHtml({ label, url }) {
  const texto = String(label || "Saiba mais").trim() || "Saiba mais";
  const href = String(url || "").trim();
  return `
<table role="presentation" cellspacing="0" cellpadding="0" style="margin:18px 0;">
  <tr>
    <td align="center" style="border-radius:8px;background:#1b4fa0;">
      <a href="${href}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">
        ${texto.replace(/</g, "")}
      </a>
    </td>
  </tr>
</table>`.trim();
}
