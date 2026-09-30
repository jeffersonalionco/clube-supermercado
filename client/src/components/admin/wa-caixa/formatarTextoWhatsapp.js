export function normalizarTelefoneWa(valor) {
  const d = String(valor || "").replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) return d;
  if (d.length === 10 || d.length === 11) return `55${d}`;
  return null;
}

function fronteiraDepois(char) {
  return !char || /[\s.,!?;:)\]}"']/.test(char);
}

function encontrarFecho(src, inicio, marca) {
  if (src[inicio + 1] === " " || src[inicio + 1] === "\n") return -1;
  for (let j = inicio + 2; j < src.length; j += 1) {
    if (src[j] === "\n") return -1;
    if (src[j] === marca && src[j - 1] !== " ") {
      if (fronteiraDepois(src[j + 1])) return j;
    }
  }
  return -1;
}

function lerUrl(src, i) {
  if (!src.startsWith("http://", i) && !src.startsWith("https://", i)) return null;
  let j = i;
  while (j < src.length && !/\s/.test(src[j])) j += 1;
  const bruto = src.slice(i, j).replace(/[),.;:!?]+$/g, "");
  try {
    const url = new URL(bruto);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    return bruto;
  } catch {
    return null;
  }
}

function lerTelefone(src, i) {
  if (i > 0 && /\d/.test(src[i - 1])) return null;
  const trecho = src.slice(i).match(/^\+?\d[\d\s().-]{8,20}\d/);
  if (!trecho) return null;
  const telefone = normalizarTelefoneWa(trecho[0]);
  if (!telefone) return null;
  return { bruto: trecho[0], telefone };
}

export function parseTextoWhatsapp(input, profundidade = 0) {
  const src = String(input ?? "");
  const nodes = [];
  let buffer = "";
  let i = 0;

  function flush() {
    if (!buffer) return;
    nodes.push({ kind: "text", value: buffer });
    buffer = "";
  }

  while (i < src.length) {
    if (src.startsWith("```", i)) {
      const fim = src.indexOf("```", i + 3);
      if (fim !== -1) {
        flush();
        nodes.push({ kind: "code", value: src.slice(i + 3, fim) });
        i = fim + 3;
        continue;
      }
    }

    const url = lerUrl(src, i);
    if (url) {
      flush();
      nodes.push({ kind: "link", href: url, value: url });
      i += url.length;
      continue;
    }

    const fone = lerTelefone(src, i);
    if (fone) {
      flush();
      nodes.push({ kind: "phone", telefone: fone.telefone, value: fone.bruto });
      i += fone.bruto.length;
      continue;
    }

    const marca = src[i];
    const antes = i === 0 ? "" : src[i - 1];
    const podeMarca =
      profundidade < 6 &&
      "*_~`".includes(marca) &&
      !/[\p{L}\p{N}]/u.test(antes);
    if (podeMarca) {
      const fim = encontrarFecho(src, i, marca);
      if (fim !== -1) {
        flush();
        const miolo = src.slice(i + 1, fim);
        if (marca === "`") nodes.push({ kind: "code", value: miolo });
        else {
          const kind = marca === "*" ? "bold" : marca === "_" ? "italic" : "strike";
          nodes.push({
            kind,
            children: parseTextoWhatsapp(miolo, profundidade + 1),
          });
        }
        i = fim + 1;
        continue;
      }
    }

    buffer += src[i];
    i += 1;
  }

  flush();
  return nodes;
}

function tituloDeSecao(linha) {
  const limpa = linha.trim().replace(/^[\s🛒💬📞👉👋✨*]*/u, "").replace(/\*+/g, "").trim();
  if (/^ATENDIMENTO$/i.test(limpa)) return true;
  if (/^Clube Superama\+?$/i.test(limpa)) return true;
  return false;
}

/** Separa o menu automático em blocos curtos. Mensagem comum continua inteira. */
export function partirBlocosMensagem(texto) {
  const src = String(texto || "")
    .replace(/\n*[━—_]{6,}\n*/g, "\n\n")
    .trim();
  if (!src) return [];
  const linhas = src.split("\n");
  const blocos = [];
  let atual = [];
  for (const linha of linhas) {
    if (atual.some((item) => item.trim()) && tituloDeSecao(linha)) {
      const pronto = atual.join("\n").trim();
      if (pronto) blocos.push(pronto);
      atual = [linha];
      continue;
    }
    atual.push(linha);
  }
  const ultimo = atual.join("\n").trim();
  if (ultimo) blocos.push(ultimo);
  return blocos.length > 1 ? blocos : [src];
}

export function primeiroLinkHttps(nodes) {
  for (const node of nodes || []) {
    if (node.kind === "link" && node.href.startsWith("https://")) return node.href;
    if (node.children) {
      const interno = primeiroLinkHttps(node.children);
      if (interno) return interno;
    }
  }
  return null;
}
