import { imagensAtuaisEncarte, salvarImagemEncarte, tipoImagemEncarte } from "./imagensEncarteService.js";
import { validarUrlPreview } from "./whatsappPreviewService.js";

const API_PRODUTO = "https://www.precomelhor.com.br/api/product/";
const LIMITE_IMAGEM = 5 * 1024 * 1024;
const consultasEmAndamento = new Map();

async function lerRespostaLimitada(resposta, limite) {
  if (!resposta.ok || Number(resposta.headers.get("content-length")) > limite) {
    await resposta.body?.cancel();
    return null;
  }
  if (!resposta.body) return null;
  const partes = [];
  let tamanho = 0;
  for await (const parte of resposta.body) {
    tamanho += parte.length;
    if (tamanho > limite) return null;
    partes.push(parte);
  }
  return Buffer.concat(partes);
}

async function buscarImagem(codigosBarras) {
  const signal = AbortSignal.timeout(6000);
  for (const codigoBarras of codigosBarras) {
    const resposta = await fetch(API_PRODUTO + codigoBarras, {
      signal, redirect: "manual", headers: { Accept: "application/json" },
    });
    const conteudo = await lerRespostaLimitada(resposta, 512 * 1024);
    if (!conteudo) continue;
    const dados = JSON.parse(conteudo.toString("utf8"));
    if (String(dados.product?.ean) !== codigoBarras) continue;
    const imagens = [...new Set([
      dados.details?.media_high_res_url, dados.details?.image_url_main, dados.product?.image_url,
    ].filter((url) => typeof url === "string" && url.trim()))];
    for (const url of imagens) {
      const validacao = await validarUrlPreview(url);
      if (!validacao.ok) continue;
      const respostaImagem = await fetch(validacao.url, {
        signal, redirect: "manual", headers: { Accept: "image/png,image/jpeg,image/webp" },
      });
      const buffer = await lerRespostaLimitada(respostaImagem, LIMITE_IMAGEM);
      const tipo = tipoImagemEncarte(buffer);
      if (tipo) return { tipo, buffer };
    }
  }
  return null;
}

export async function obterImagemAoAdicionarEncarte(item) {
  const existentes = await imagensAtuaisEncarte([item.codigo]);
  if (existentes.has(item.codigo)) return existentes.get(item.codigo);
  const codigosBarras = [...new Set((item.codigosBarras ?? [])
    .filter((codigo) => typeof codigo === "string" && /^(?:\d{8}|\d{12,14})$/.test(codigo)))];
  if (!codigosBarras.length) return null;
  if (consultasEmAndamento.has(item.codigo)) return consultasEmAndamento.get(item.codigo);

  const consulta = (async () => {
    try {
      const imagem = await buscarImagem(codigosBarras);
      if (!imagem) return null;
      const salva = await salvarImagemEncarte(item.codigo, item.descricao, imagem.tipo, imagem.buffer, { apenasSeAusente: true });
      return salva.id;
    } catch (erro) {
      console.warn("[encartes/imagem-automatica]", item.codigo, erro.name);
      return null;
    } finally {
      consultasEmAndamento.delete(item.codigo);
    }
  })();
  consultasEmAndamento.set(item.codigo, consulta);
  return consulta;
}
