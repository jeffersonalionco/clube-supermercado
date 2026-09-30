import {
  calcularDescontoClube,
  listarProdutosClubeDescontos,
} from "../produtosClubeDescontosService.js";

function limiteOfertas() {
  return Math.min(
    40,
    Math.max(5, Number(process.env.WHATSAPP_OFERTAS_LIMITE || 18))
  );
}

export function formatarMoedaBr(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n)) return "R$ —";
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function dataHojeBr() {
  const raw = new Date().toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  // "quinta-feira, 10 de setembro de 2026" → "Quinta-feira, 10 de setembro de 2026"
  return raw.replace(/^\p{L}/u, (c) => c.toUpperCase());
}

function tituloProduto(p) {
  let nome = String(p.descricao || "")
    .replace(/\s+/g, " ")
    .trim();
  if (p.marca && !nome.toLowerCase().includes(String(p.marca).toLowerCase())) {
    nome = `${nome} · ${p.marca}`;
  }
  // WhatsApp: linhas curtas ficam mais legíveis
  if (nome.length > 48) nome = `${nome.slice(0, 45).trim()}…`;
  return nome;
}

/**
 * Base do "de/por" no WhatsApp.
 * Sem oferta: preço 1. Em oferta, o preço anterior quando ele ainda é maior que o clube.
 */
export function calcularDescontoWhatsapp(p) {
  return calcularDescontoClube(p);
}

function linhaOferta(p) {
  const { base, preco2, economia, percentual } = calcularDescontoWhatsapp(p);
  const por = formatarMoedaBr(preco2);

  if (base > preco2 && economia > 0) {
    const de = formatarMoedaBr(base);
    const pctTxt = percentual > 0 ? ` (−${percentual}%)` : "";
    const ecoTxt = ` · economize ${formatarMoedaBr(economia)}`;
    return `*${tituloProduto(p)}*\nDe ~${de}~ por *${por}*${pctTxt}${ecoTxt}`;
  }
  return `*${tituloProduto(p)}*\nPreço do Clube: *${por}*`;
}

function avisoPreviaOfertas(itensLength, totalClube) {
  const contagem =
    totalClube > itensLength
      ? `_Mostrando ${itensLength} destaques de ${totalClube} itens com preço clube._`
      : `_${itensLength} ofertas com preço do clube._`;
  return (
    `⚠️ *Atenção:* estes valores são só uma *prévia informativa* das promoções.\n` +
    `Podem mudar e a confirmação é sempre *no caixa*, informando seu CPF.\n\n` +
    `_Ofertas sujeitas a estoque e alteração sem aviso._\n` +
    `${contagem}\n\n`
  );
}

function cabecalhoOfertas(hoje, { itensLength = 0, totalClube = 0 } = {}) {
  return (
    `*SUPERAMA*\n` +
    `*Ofertas do Clube Superama+*\n\n` +
    `📅 ${hoje}\n\n` +
    avisoPreviaOfertas(itensLength, totalClube) +
    `Confira os preços exclusivos para clientes do Clube Superama+.\n\n` +
    `━━━━━━━━━━━━━━\n\n`
  );
}

/**
 * Monta 1..N textos WhatsApp com as melhores ofertas (preço 2 do ERP).
 */
export function montarMensagensOfertas(itens, { totalClube = 0 } = {}) {
  const hoje = dataHojeBr();
  const cabecalho = cabecalhoOfertas(hoje, {
    itensLength: itens.length,
    totalClube,
  });

  const rodapeBase =
    `\n━━━━━━━━━━━━━━\n\n` +
    `Quer ver tudo? Abra o Clube Superama+.`;

  if (!itens.length) {
    return [
      `*SUPERAMA*\n*Ofertas do Clube Superama+*\n\n📅 ${hoje}\n\n` +
        `Neste momento não há itens com preço do Clube disponíveis.\n` +
        `Tente novamente em instantes ou confira no app do Clube.`,
    ];
  }

  const blocos = itens.map(linhaOferta);
  const MAX = 3500;
  const mensagens = [];
  let atual = cabecalho;

  for (let i = 0; i < blocos.length; i++) {
    const pedaco = blocos[i] + (i < blocos.length - 1 ? "\n\n" : "");
    if (atual.length + pedaco.length > MAX && atual !== cabecalho) {
      mensagens.push(atual.trimEnd());
      atual = `*Mais ofertas do Clube*\n\n`;
    }
    atual += pedaco;
  }

  const ultima = atual.trimEnd() + rodapeBase;
  if (ultima.length > 4090) {
    mensagens.push(atual.trimEnd());
    mensagens.push(rodapeBase.trim());
  } else {
    mensagens.push(ultima);
  }

  return mensagens.filter(Boolean);
}
/**
 * Busca no cache/ERP os produtos com preço 2 e prioriza maiores descontos.
 * @param {{ forcarAtualizar?: boolean }} [opts]
 */
export async function obterOfertasParaWhatsapp(opts = {}) {
  const limite = limiteOfertas();
  const forcar = Boolean(opts.forcarAtualizar);
  const dados = await listarProdutosClubeDescontos({
    pagina: 1,
    limite: 200,
    atualizar: forcar,
  });

  const sincronizando = Boolean(dados.sincronizando);
  const aguardandoDiaAtual = Boolean(dados.aguardandoDiaAtual);
  let itens = Array.isArray(dados.itens) ? [...dados.itens] : [];

  // Preço 2 ativo no ERP (mesmo se economia ainda não estiver batendo no preço 1)
  itens = itens.filter((p) => Number(p.preco2) > 0);

  itens.sort((a, b) => {
    const ao = a.oferta ? 1 : 0;
    const bo = b.oferta ? 1 : 0;
    if (bo !== ao) return bo - ao;
    const da = calcularDescontoWhatsapp(a);
    const db = calcularDescontoWhatsapp(b);
    if (db.percentual !== da.percentual) return db.percentual - da.percentual;
    return db.economia - da.economia;
  });

  const destaque = itens.slice(0, limite);

  return {
    ok: true,
    sincronizando,
    aguardandoDiaAtual,
    erroSync: dados.erroSync || null,
    sincronizadoEm: dados.sincronizadoEm || null,
    totalClube: Number(dados.totalClube) || itens.length,
    itens: destaque,
    mensagens: montarMensagensOfertas(destaque, {
      totalClube: Number(dados.totalClube) || itens.length,
    }),
  };
}
