import { Router } from "express";
import multer from "multer";
import os from "node:os";
import { normalizarAnimacaoEncarte } from "../../shared/animacaoEncarte.js";
import { enviarVideoEncarte, removerVideoTemporario } from "../services/marketing/videoEncarteService.js";
import { formatosCampanhaValidos, obterFormatoCampanhaEncarte, obterModeloEncarte } from "../../shared/modelosEncarte.js";
import { precoAnteriorEncarte, precoAtualEncarte, precoManualValido, unidadeExibidaEncarte, validadePrecoEncarte } from "../../shared/precosEncarte.js";
import { getPool } from "../db.js";
import { buscarProdutoUnidadePorCodigo } from "../services/apiClient.js";
import { codigosEsgotadosHoje } from "../services/clubeOfertaEsgotadaService.js";
import { diaSpIso, estadoSincronizacaoOfertasClube, sincronizarOfertasClube, unidadePadrao } from "../services/produtosClubeDescontosService.js";
import { codigoEncarte, invalidarCatalogoEncarte, montarItemEncarte, pesquisarCatalogoEncarte } from "../services/marketing/catalogoEncarteService.js";
import {
  conferirImagensEncarte,
  idImagemEncarte,
  imagensAtuaisEncarte,
  listarImagensEncarte,
  salvarImagemEncarte,
  tipoImagemEncarte,
} from "../services/marketing/imagensEncarteService.js";

import { listarPublicacoesEncarte, publicarPaginaEncarte } from "../services/marketing/publicacaoEncarteService.js";
import { obterImagemAoAdicionarEncarte } from "../services/marketing/imagemAutomaticaEncarteService.js";

const router = Router();
const CAMPOS = "id, dados, versao, atualizado_em, finalizado_em";
const LIMITE_ITENS = 24;
const uploadImagem = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0 },
}).single("imagem");

const uploadPagina = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024, files: 1, fields: 0 },
}).single("imagem");

const uploadVideo = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 48 * 1024 * 1024, files: 1, fields: 0 },
}).single("video");

function exigir(condicao, mensagem, status = 400) {
  if (!condicao) throw Object.assign(new Error(mensagem), { status });
}

function tratar(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (erro) {
      if (erro.status) return res.status(erro.status).json({ error: erro.message });
      console.error("[marketing/encartes]", erro.message);
      return res.status(500).json({ error: "Não foi possível concluir a operação do encarte." });
    }
  };
}

function texto(valor, maximo) {
  return typeof valor === "string" ? valor.trim().slice(0, maximo) : "";
}

function loja(valor) {
  const unidade = valor ?? unidadePadrao();
  exigir(typeof unidade === "string" && /^\d{1,6}$/.test(unidade), "Informe o código da loja.");
  return unidade;
}

function dataValida(valor) {
  if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const data = new Date(valor);
  return Number.isFinite(data.getTime()) && data.toISOString().slice(0, 10) === valor;
}

async function obterEsgotados() {
  return new Set([...(await codigosEsgotadosHoje())].map(codigoEncarte));
}

async function consultarItem(codigo, unidade, esgotados) {
  if (esgotados.has(codigo)) return null;
  const resultado = await buscarProdutoUnidadePorCodigo(codigo, unidade);
  exigir(resultado.ok, `Não foi possível confirmar o produto ${codigo} no sistema de preços.`, 502);
  const item = montarItemEncarte(resultado.produto, unidade);
  return item?.codigo === codigo ? item : null;
}

async function comImagens(itens) {
  const imagens = await imagensAtuaisEncarte(itens.map((item) => item.codigo));
  return itens.map((item) => ({ ...item, imagemId: imagens.get(item.codigo) ?? null }));
}

function paginaDe(valor) {
  return Math.max(1, Math.min(3000, parseInt(valor, 10) || 1));
}

function lerDados(body) {
  const { titulo, unidade, inicio, fim, itens, modelo, formatos, animacao } = body ?? {};
  exigir(dataValida(inicio) && dataValida(fim) && inicio <= fim, "Informe um período válido.");
  exigir(texto(titulo, 70), "Informe o título do encarte.");
  exigir(Array.isArray(itens) && itens.length <= LIMITE_ITENS, "Selecione até 24 produtos.");
  exigir(formatosCampanhaValidos(modelo, formatos), "Selecione até quatro formatos do mesmo modelo.");
  const modeloEncarte = obterModeloEncarte(modelo);
  const permiteLimite = modeloEncarte.permiteLimite;
  const permitePrecoAnterior = modeloEncarte.permitePrecoAnterior;
  const codigos = new Set();
  const produtos = itens.map((item) => {
    const codigo = codigoEncarte(item?.codigo);
    exigir(codigo && !codigos.has(codigo), "Confira os códigos dos produtos selecionados.");
    codigos.add(codigo);
    exigir(Number.isFinite(item.preco) && item.preco > 0, "Confira o preço dos produtos selecionados.");
    exigir(["clube", "loja", "normal"].includes(item.tipo), "Confira o tipo de oferta.");
    const limitado = Boolean(permiteLimite && item.limitado === true);
    const limite = limitado ? item.limite ?? null : null;
    exigir(limite === null || (Number.isFinite(limite) && limite >= .001 && limite <= 9999 &&
      Number(limite.toFixed(3)) === limite), "Informe um limite válido por cliente.");
    const precoAtualEditado = item.precoAtualEditado ?? null;
    exigir(precoAtualEditado === null || precoManualValido(precoAtualEditado),
      "Informe um preço atual válido, com até duas casas decimais.");
    const precoAnteriorEditado = permitePrecoAnterior ? item.precoAnteriorEditado ?? null : null;
    exigir(precoAnteriorEditado === null || precoManualValido(precoAnteriorEditado),
      "Informe um preço anterior válido, com até duas casas decimais.");
    return {
      ...(permiteLimite ? { limitado, limite } : {}),
      ...(modeloEncarte.id === "a4-black-friday-dobro" ? { descricaoEtiqueta: texto(item.descricaoEtiqueta, 60) } : {}),
      ...(modeloEncarte.tema === "black-friday" ? { unidadeMedidaEditada: texto(item.unidadeMedidaEditada, 12) } : {}),
      ...(permitePrecoAnterior ? {
        mostrarPrecoAnterior: item.mostrarPrecoAnterior !== false,
        precoAnterior: Number.isFinite(item.precoAnterior) && item.precoAnterior > item.preco ? item.precoAnterior : null,
        precoAnteriorEditado,
      } : {}),
      codigo,
      descricao: texto(item.descricao, 120),
      preco: item.preco,
      precoAtualEditado,
      tipo: item.tipo,
      unidadeMedida: texto(item.unidadeMedida, 12),
      validade: dataValida(item.validade) ? item.validade : null,
      nome: texto(item.nome, 90),
      destaque: item.destaque === true,
      imagemId: idImagemEncarte(item.imagemId),
    };
  });
  return {
    titulo: texto(titulo, 70), unidade: loja(unidade), inicio, fim, modelo: modeloEncarte.id, itens: produtos,
    ...(formatos?.length > 1 ? { formatos } : {}),
    ...(modeloEncarte.tema !== "etiquetas" && animacao ? { animacao: normalizarAnimacaoEncarte(animacao) } : {}),
  };
}

function idEncarte(valor) {
  const id = Number(valor);
  exigir(Number.isInteger(id) && id > 0 && id <= 2147483647, "Encarte inválido.");
  return id;
}

router.get("/", tratar(async (_req, res) => {
  const { rows } = await getPool().query(`
    SELECT id, dados->>'titulo' AS titulo, atualizado_em, finalizado_em
    FROM marketing_encarte ORDER BY atualizado_em DESC, id DESC LIMIT 100
  `);
  res.json({ encartes: rows, unidade: unidadePadrao(), hoje: diaSpIso() });
}));

router.get("/produtos", tratar(async (req, res) => {
  const unidade = loja(req.query.unidade);
  const esgotados = await obterEsgotados();
  if (req.query.codigo !== undefined) {
    const codigo = codigoEncarte(req.query.codigo);
    exigir(codigo, "Informe um código de produto válido.");
    const item = await consultarItem(codigo, unidade, esgotados);
    exigir(item, "Produto indisponível ou sem preço e unidade de venda cadastrados.", 404);
    const [comImagem] = await comImagens([item]);
    return res.json({ item: comImagem });
  }

  const busca = texto(req.query.busca, 100);
  const tipo = ["clube", "loja"].includes(req.query.tipo) ? req.query.tipo : "";
  const pagina = paginaDe(req.query.pagina);
  const codigo = codigoEncarte(busca);
  if (codigo && pagina === 1 && req.query.continuar !== "1") {
    const resultado = await buscarProdutoUnidadePorCodigo(codigo, unidade);
    const bruto = resultado.produto;
    if (resultado.ok && codigoEncarte(bruto.Codigo ?? bruto.SKU) === codigo) {
      const item = esgotados.has(codigo) ? null : montarItemEncarte(bruto, unidade);
      const itens = item && (!tipo || item.tipo === tipo) ? await comImagens([item]) : [];
      const aviso = item ? null : "Produto localizado no ERP, mas indisponível para o encarte nesta loja.";
      return res.json({ itens, totalPaginas: 1, sincronizando: false, erroSync: false, aviso });
    }
  }

  const dados = pesquisarCatalogoEncarte({ unidade, esgotados, busca, tipo, pagina });
  res.json({ ...dados, itens: await comImagens(dados.itens) });
}));

router.post("/produtos/:codigo/adicionar", tratar(async (req, res) => {
  const codigo = codigoEncarte(req.params.codigo);
  exigir(codigo, "Informe um código de produto válido.");
  const item = await consultarItem(codigo, loja(req.body?.unidade), await obterEsgotados());
  exigir(item, "Produto indisponível ou sem preço e unidade de venda cadastrados.", 404);
  const imagemId = await obterImagemAoAdicionarEncarte(item);
  res.json({ item: { ...item, imagemId } });
}));

router.get("/sincronizacao", tratar(async (req, res) => {
  res.json(estadoSincronizacaoOfertasClube(loja(req.query.unidade)));
}));

router.post("/sincronizacao", tratar(async (req, res) => {
  const unidade = loja(req.body?.unidade);
  invalidarCatalogoEncarte(unidade);
  res.status(202).json(sincronizarOfertasClube(unidade));
}));

router.get("/imagens", tratar(async (req, res) => {
  res.json(await listarImagensEncarte(texto(req.query.busca, 100), paginaDe(req.query.pagina)));
}));

router.post("/imagens/:codigo", (req, res) => {
  uploadImagem(req, res, (erro) => {
    if (erro) return res.status(400).json({ error: "Envie um arquivo JPG, PNG ou WebP de até 5 MB." });
    return tratar(async (pedido, resposta) => {
      const tipo = tipoImagemEncarte(pedido.file?.buffer);
      const codigo = codigoEncarte(pedido.params.codigo);
      const unidade = loja(pedido.query.unidade);
      exigir(tipo && codigo, "Selecione um produto e uma imagem JPG, PNG ou WebP válida.");
      const resultado = await buscarProdutoUnidadePorCodigo(codigo, unidade);
      const produto = resultado.produto;
      const descricao = texto(produto?.Descricao ?? produto?.descricao, 120);
      exigir(resultado.ok && descricao && codigoEncarte(produto.Codigo ?? produto.SKU) === codigo,
        "Não foi possível confirmar o código interno no ERP.", 404);
      const imagem = await salvarImagemEncarte(codigo, descricao, tipo, pedido.file.buffer);
      resposta.status(201).json({ imagem });
    })(req, res);
  });
});

router.post("/:id/video", (req, res) => {
  uploadVideo(req, res, (erro) => {
    if (erro) return res.status(400).json({ error: "Envie um vídeo de até 48 MB." });
    return tratar(async (pedido, resposta) => {
      const arquivo = pedido.file?.path;
      exigir(arquivo, "Nenhum vídeo foi recebido.");
      try {
        const id = idEncarte(pedido.params.id);
        const { rows } = await getPool().query(
          "SELECT dados FROM marketing_encarte WHERE id = $1 AND finalizado_em IS NOT NULL", [id]
        );
        const dados = rows[0]?.dados;
        exigir(dados?.animacao?.ativa, "Encarte animado finalizado não encontrado.", 404);
        const modelo = obterFormatoCampanhaEncarte(dados, pedido.query.formato);
        exigir(modelo, "Formato indisponível neste encarte.");
        exigir(modelo.tema !== "etiquetas", "Este modelo é destinado a impressão.");
        const total = Math.ceil(dados.itens.length / (modelo.colunas * modelo.linhas));
        const { segundos } = normalizarAnimacaoEncarte(dados.animacao);
        await enviarVideoEncarte(arquivo, modelo, total * segundos, resposta);
      } finally {
        await removerVideoTemporario(arquivo);
      }
    })(req, res);
  });
});

router.post("/:id/publicacoes/:pagina", (req, res) => {
  uploadPagina(req, res, (erro) => {
    if (erro) return res.status(400).json({ error: "Não foi possível enviar o PNG da página." });
    return tratar(async (pedido, resposta) => {
      const resultado = await publicarPaginaEncarte(
        idEncarte(pedido.params.id), idEncarte(pedido.params.pagina), pedido.file?.buffer, pedido.query.formato
      );
      if (resultado.error) return resposta.status(resultado.status).json({ error: resultado.error });
      return resposta.json({ publicacao: resultado.publicacao });
    })(req, res);
  });
});

router.get("/:id", tratar(async (req, res) => {
  const { rows } = await getPool().query(
    `SELECT ${CAMPOS} FROM marketing_encarte WHERE id = $1`, [idEncarte(req.params.id)]
  );
  exigir(rows[0], "Encarte não encontrado.", 404);
  const encarte = rows[0];
  const publicacoes = encarte.finalizado_em ? await listarPublicacoesEncarte(encarte.id) : [];
  res.json({ encarte: { ...encarte, publicacoes } });
}));

async function gravar(id, versao, dados, finalizar) {
  const { rows } = await getPool().query(
    id === null
      ? `INSERT INTO marketing_encarte (dados, finalizado_em)
         VALUES ($1, CASE WHEN $2::boolean THEN NOW() END) RETURNING ${CAMPOS}`
      : `UPDATE marketing_encarte SET dados = $1, atualizado_em = NOW(), versao = versao + 1,
           finalizado_em = CASE WHEN $2::boolean THEN NOW() END
         WHERE id = $3 AND versao = $4 AND finalizado_em IS NULL RETURNING ${CAMPOS}`,
    id === null ? [dados, finalizar] : [dados, finalizar, id, versao]
  );
  exigir(rows[0], "O rascunho foi alterado ou finalizado em outra sessão. Reabra pelo histórico.", 409);
  return rows[0];
}

async function conferirPrecos({ itens, unidade, inicio, modelo }) {
  const permitePrecoAnterior = obterModeloEncarte(modelo).permitePrecoAnterior;
  const esgotados = await obterEsgotados();
  const revisados = [];
  const indisponiveis = [];
  const alterados = [];
  const consultados = [];
  for (let i = 0; i < itens.length; i += 4) {
    const lote = itens.slice(i, i + 4);
    consultados.push(...await Promise.all(lote.map(
      (item) => consultarItem(item.codigo, unidade, esgotados)
    )));
  }
  for (const [indice, item] of itens.entries()) {
    const consultado = consultados[indice];
    if (!consultado || (item.precoAtualEditado === null && consultado.validade && consultado.validade < inicio)) {
      indisponiveis.push(item.codigo);
      revisados.push(item);
      continue;
    }
    const { codigosBarras, precoAnterior, ...precoAtual } = consultado;
    const atual = { ...item, ...precoAtual, ...(permitePrecoAnterior ? { precoAnterior: precoAnterior ?? null } : {}) };
    const mudouPrecoAnterior = permitePrecoAnterior && precoAnteriorEncarte(atual) !== precoAnteriorEncarte(item);
    if (mudouPrecoAnterior || precoAtualEncarte(atual) !== precoAtualEncarte(item) ||
      unidadeExibidaEncarte(atual) !== unidadeExibidaEncarte(item) ||
      validadePrecoEncarte(atual) !== validadePrecoEncarte(item) || ["tipo", "descricao"].some(
        (campo) => atual[campo] !== item[campo]
    )) {
      alterados.push({ anterior: item, atual });
    }
    revisados.push(atual);
  }
  return { itens: revisados, indisponiveis, alterados };
}

router.post("/revisar-precos", tratar(async (req, res) => {
  res.json({ revisao: await conferirPrecos(lerDados(req.body?.dados)) });
}));

router.post("/", tratar(async (req, res) => {
  const id = req.body?.id == null ? null : idEncarte(req.body.id);
  const versao = id === null ? null : idEncarte(req.body?.versao);
  const dados = lerDados(req.body?.dados);
  const finalizar = req.body?.finalizar === true;
  exigir(await conferirImagensEncarte(dados.itens), "Confira os vínculos das imagens com os produtos.");
  if (finalizar) {
    exigir(dados.itens.length, "Selecione pelo menos um produto.");
    const hoje = diaSpIso();
    exigir(dados.inicio >= hoje, "A data inicial do encarte precisa ser hoje ou uma data futura.");

    const revisao = await conferirPrecos(dados);
    if (revisao.indisponiveis.length || revisao.alterados.length) {
      return res.json({ revisao });
    }
    const revisados = revisao.itens;

    exigir(hoje === diaSpIso(), "O dia mudou durante a conferência. Revise o período do encarte.");
    exigir(dados.fim === hoje || revisados.every((item) =>
      item.tipo !== "clube" || item.validade || item.precoAtualEditado !== null
    ), "Para anunciar um preço Clube sem validade no ERP em outro dia, informe o preço atual manualmente no produto.");
    dados.itens = revisados;
  }
  res.json({ encarte: await gravar(id, versao, dados, finalizar) });
}));

export default router;
