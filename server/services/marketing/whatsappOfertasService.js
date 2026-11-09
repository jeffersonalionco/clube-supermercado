import {
  calcularDescontoClube,
  listarProdutosClubeDescontos,
  ordenarClubePorDesconto,
  selecionarOfertasLoja,
} from "../produtosClubeDescontosService.js";

function limiteSecao() {
  const n = Number(process.env.WHATSAPP_OFERTAS_LIMITE || 8);
  return Math.min(8, Math.max(4, Number.isFinite(n) ? n : 8));
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

function linhaClube(p) {
  const { base, preco2, economia, percentual } = calcularDescontoWhatsapp(p);
  const por = formatarMoedaBr(preco2);
  const esgotado = p.esgotado ? `\n*ESGOTADO*` : "";

  if (base > preco2 && economia > 0) {
    const de = formatarMoedaBr(base);
    const pctTxt = percentual > 0 ? ` (−${percentual}%)` : "";
    const ecoTxt = ` · economize ${formatarMoedaBr(economia)}`;
    return `*${tituloProduto(p)}*\nDe ~${de}~ por *${por}*${pctTxt}${ecoTxt}${esgotado}`;
  }
  return `*${tituloProduto(p)}*\nPreço do Clube: *${por}*${esgotado}`;
}

function linhaLoja(p) {
  const por = formatarMoedaBr(p.preco1);
  const de =
    Number(p.precoAnterior) > Number(p.preco1)
      ? `De ~${formatarMoedaBr(p.precoAnterior)}~ por *${por}*`
      : `*${por}*`;
  const ate = p.dataOfertaBr ? `\naté ${p.dataOfertaBr}` : "";
  return `*${tituloProduto(p)}*\n${de}${ate}`;
}

function juntarLinhas(linhas) {
  return linhas.filter(Boolean).join("\n\n");
}

/**
 * Monta 1 ou 2 textos. A loja vem primeiro; se não couber, o Clube vai na mensagem seguinte.
 * Aceita um array só de preços do Clube (testes e chamadas antigas).
 */
export function montarMensagensOfertas(entrada) {
  const loja = Array.isArray(entrada) ? [] : entrada?.loja || [];
  const clube = Array.isArray(entrada) ? entrada : entrada?.clube || [];
  const hoje = dataHojeBr();
  const rodape = `\n\n━━━━━━━━━━━━━━\n\nQuer ver o Clube completo? Abra o Clube Superama+.`;

  if (!loja.length && !clube.length) {
    return [
      `*SUPERAMA*\n*Ofertas de hoje*\n\n📅 ${hoje}\n\n` +
        `Neste momento não há ofertas da loja nem preços do Clube.\n` +
        `Tente novamente em instantes ou confira no app do Clube.`,
    ];
  }

  const cabecalho =
    `*SUPERAMA*\n` +
    `*Ofertas de hoje*\n` +
    `📅 ${hoje}\n\n` +
    `Prévia. O valor vale no caixa e pode mudar.\n` +
    `_Sujeitas a estoque._\n\n` +
    `━━━━━━━━━━━━━━\n\n`;

  const blocoLoja = loja.length
    ? `🛒 *OFERTAS DA LOJA*\n_Para todo mundo. Vale até a data._\n\n${juntarLinhas(loja.map(linhaLoja))}`
    : "";
  const blocoClube = clube.length
    ? `⭐ *PREÇOS DO CLUBE*\n_Só com CPF no caixa._\n\n${juntarLinhas(clube.map(linhaClube))}`
    : "";

  const miolo = [blocoLoja, blocoClube].filter(Boolean).join("\n\n━━━━━━━━━━━━━━\n\n");
  const junto = `${cabecalho}${miolo}${rodape}`;
  const MAX = 3500;

  if (junto.length <= MAX || !loja.length || !clube.length) {
    return [junto];
  }

  const primeira =
    `${cabecalho}${blocoLoja}\n\n` +
    `_Os preços do Clube vêm na mensagem seguinte._`;
  const segunda =
    `*SUPERAMA*\n⭐ *PREÇOS DO CLUBE*\n_Só com CPF no caixa._\n\n` +
    `${juntarLinhas(clube.map(linhaClube))}${rodape}`;

  return [primeira, segunda];
}
/**
 * Busca no cache/ERP os produtos com preço 2 e prioriza maiores descontos.
 * @param {{ forcarAtualizar?: boolean }} [opts]
 */
export async function obterOfertasParaWhatsapp(opts = {}) {
  const limite = limiteSecao();
  const forcar = Boolean(opts.forcarAtualizar);
  const dados = await listarProdutosClubeDescontos({
    pagina: 1,
    limite: 200,
    atualizar: forcar,
  });

  const sincronizando = Boolean(dados.sincronizando);
  const aguardandoDiaAtual = Boolean(dados.aguardandoDiaAtual);
  const clubeTodos = ordenarClubePorDesconto(
    (Array.isArray(dados.itens) ? dados.itens : []).filter((p) => Number(p.preco2) > 0)
  );
  const codigosClube = new Set(clubeTodos.map((p) => String(p.codigo)));
  const loja = selecionarOfertasLoja(dados.ofertasLoja, limite).filter(
    (p) => !codigosClube.has(String(p.codigo))
  );
  const clube = clubeTodos.slice(0, limite);
  const itens = [...loja, ...clube];

  return {
    ok: true,
    sincronizando,
    aguardandoDiaAtual,
    lojaPronta: Boolean(dados.ofertasLojaProntas),
    lojaColetando: Boolean(dados.lojaColetando),
    erroSync: dados.erroSync || null,
    sincronizadoEm: dados.sincronizadoEm || null,
    totalClube: Number(dados.totalClube) || clubeTodos.length,
    itens,
    mensagens: montarMensagensOfertas({ loja, clube }),
  };
}
