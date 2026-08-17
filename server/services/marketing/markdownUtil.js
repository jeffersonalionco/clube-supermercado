/** Conversor Markdown leve → HTML (sem dependência externa). */

function escaparHtml(valor) {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatarInline(texto) {
  let s = escaparHtml(texto);
  s = s.replace(
    /!\[([^\]]*)\]\((https?:\/\/[^)\s]+|\/uploads\/[^)\s]+)\)/g,
    '<img src="$2" alt="$1" style="max-width:100%;height:auto;display:block;border:0;margin:12px 0;" />'
  );
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>');
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  return s;
}

/**
 * Converte Markdown simples (títulos, listas, negrito, links, parágrafos) em HTML.
 */
export function markdownParaHtml(markdown) {
  const linhas = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
  const blocos = [];
  let i = 0;

  while (i < linhas.length) {
    const linha = linhas[i];
    const trim = linha.trim();

    if (!trim) {
      i += 1;
      continue;
    }

    const h = trim.match(/^(#{1,3})\s+(.+)$/);
    if (h) {
      const nivel = h[1].length;
      blocos.push(`<h${nivel}>${formatarInline(h[2])}</h${nivel}>`);
      i += 1;
      continue;
    }

    const yt = trim.match(/^youtube:\s*(.+)$/i);
    if (yt) {
      const raw = yt[1].trim();
      const idMatch = raw.match(
        /(?:youtube\.com\/watch\?[^#]*v=|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtu\.be\/)([A-Za-z0-9_-]{6,})/i
      ) || raw.match(/^([A-Za-z0-9_-]{11})$/);
      if (idMatch?.[1]) {
        const id = idMatch[1];
        const watch = `https://www.youtube.com/watch?v=${id}`;
        const thumb = `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
        blocos.push(
          `<p><a href="${watch}" target="_blank" rel="noopener noreferrer"><img src="${thumb}" alt="YouTube" style="max-width:100%;height:auto;display:block;border:0;" /></a></p>`
        );
      }
      i += 1;
      continue;
    }

    if (/^[-*]\s+/.test(trim)) {
      const itens = [];
      while (i < linhas.length && /^[-*]\s+/.test(linhas[i].trim())) {
        itens.push(
          `<li>${formatarInline(linhas[i].trim().replace(/^[-*]\s+/, ""))}</li>`
        );
        i += 1;
      }
      blocos.push(`<ul>${itens.join("")}</ul>`);
      continue;
    }

    if (/^\d+\.\s+/.test(trim)) {
      const itens = [];
      while (i < linhas.length && /^\d+\.\s+/.test(linhas[i].trim())) {
        itens.push(
          `<li>${formatarInline(linhas[i].trim().replace(/^\d+\.\s+/, ""))}</li>`
        );
        i += 1;
      }
      blocos.push(`<ol>${itens.join("")}</ol>`);
      continue;
    }

    const paragrafos = [trim];
    i += 1;
    while (i < linhas.length && linhas[i].trim() && !/^(#{1,3}\s+|[-*]\s+|\d+\.\s+)/.test(linhas[i].trim())) {
      paragrafos.push(linhas[i].trim());
      i += 1;
    }
    blocos.push(`<p>${formatarInline(paragrafos.join(" "))}</p>`);
  }

  return blocos.join("\n");
}

export function markdownParaTexto(markdown) {
  return String(markdown || "")
    .replace(/\r\n/g, "\n")
    .replace(/^#{1,3}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1 ($2)")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}
