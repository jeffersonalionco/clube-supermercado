/** Renderização simples de texto legal (## títulos, - listas, parágrafos). */
export function renderizarConteudoLegal(texto) {
  const linhas = String(texto || "").split("\n");
  const blocos = [];
  let listaAtual = null;
  let paragrafoAtual = [];

  function flushParagrafo() {
    if (!paragrafoAtual.length) return;
    blocos.push({ tipo: "p", texto: paragrafoAtual.join(" ").trim() });
    paragrafoAtual = [];
  }

  function flushLista() {
    if (!listaAtual?.itens.length) return;
    blocos.push(listaAtual);
    listaAtual = null;
  }

  for (const linha of linhas) {
    const t = linha.trim();

    if (!t) {
      flushParagrafo();
      flushLista();
      continue;
    }

    if (t.startsWith("## ")) {
      flushParagrafo();
      flushLista();
      blocos.push({ tipo: "h2", texto: t.slice(3).trim() });
      continue;
    }

    if (t.startsWith("- ")) {
      flushParagrafo();
      if (!listaAtual) listaAtual = { tipo: "ul", itens: [] };
      listaAtual.itens.push(formatarInline(t.slice(2).trim()));
      continue;
    }

    flushLista();
    paragrafoAtual.push(formatarInline(t));
  }

  flushParagrafo();
  flushLista();
  return blocos;
}

function escapeHtml(texto) {
  return String(texto)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatarInline(texto) {
  const escapado = escapeHtml(texto);
  return escapado.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}
