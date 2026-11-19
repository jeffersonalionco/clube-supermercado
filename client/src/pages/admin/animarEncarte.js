import {
  EFEITOS_ELEMENTOS_ENCARTE, embaralharEfeitosEncarte, ENTRADAS_3D_ENCARTE, ENTRADAS_ENCARTE,
  TRANSICOES_ENCARTE, VELOCIDADES_ENCARTE,
} from "../../../../shared/animacaoEncarte.js";
import { pintarElementoEncarte, pintarProdutoEmPerspectiva, pintarTransicaoEncarte } from "./efeitosEncarte.js";
import { capturarFolhaEncarte } from "./EncarteFolha.jsx";

const FPS = 30;
const DURACAO_TRANSICAO = .6;
const FIM_ENTRADA = 1.6;
const MIME_MP4 = ["video/mp4;codecs=avc1.420034", "video/mp4;codecs=avc1", "video/mp4"];
const MIME_WEBM = ["video/webm;codecs=vp8", "video/webm;codecs=vp9", "video/webm"];

function retangulo(elemento, origem, escala) {
  const r = elemento.getBoundingClientRect();
  const x = Math.round((r.left - origem.left) * escala);
  const y = Math.round((r.top - origem.top) * escala);
  return {
    x, y,
    w: Math.round((r.right - origem.left) * escala) - x,
    h: Math.round((r.bottom - origem.top) * escala) - y,
  };
}

export async function prepararCenasEncarte(folhas, modelo, config, escala, sinal, progresso) {
  const cenas = [];
  for (const [indice, folha] of folhas.entries()) {
    sinal.throwIfAborted();
    progresso?.(indice + 1, folhas.length);
    const origem = folha.getBoundingClientRect();
    const seletor = config.elementos.map((nome) => `[data-encarte-animar="${nome}"]`).join(", ");
    const ordemEntradas = config.entrada === "aleatorio"
      ? embaralharEfeitosEncarte(ENTRADAS_ENCARTE, config.semente ^ Math.imul(indice + 1, 2654435761), "nenhuma")
      : [config.entrada];
    const ordemElementos = config.efeitoElementos === "aleatorio"
      ? embaralharEfeitosEncarte(EFEITOS_ELEMENTOS_ENCARTE, config.semente ^ Math.imul(indice + 1, 1597334677))
      : [config.efeitoElementos];
    let elementoAtual = 0;
    const produtos = [...folha.querySelectorAll(".encarte-arte-produto")].map((produto, posicao) => {
      const area = retangulo(produto, origem, escala);
      const efeito = ordemEntradas[posicao % ordemEntradas.length];
      const perspectiva = ENTRADAS_3D_ENCARTE.includes(efeito) ? document.createElement("canvas") : null;
      if (perspectiva) {
        perspectiva.width = area.w;
        perspectiva.height = area.h;
      }
      const elementos = seletor ? [...produto.querySelectorAll(seletor)]
        .map((elemento) => retangulo(elemento, origem, escala))
        .filter(({ w, h }) => w > 0 && h > 0)
        .map((regiao) => ({ ...regiao, efeito: ordemElementos[elementoAtual++ % ordemElementos.length] })) : [];
      return { area, efeito, perspectiva, elementos };
    });

    const completa = await capturarFolhaEncarte(folha, modelo, { escala });
    sinal.throwIfAborted();
    const semElementos = seletor && produtos.some((produto) => produto.elementos.length)
      ? await capturarFolhaEncarte(folha, modelo, { escala, ocultar: seletor }) : completa;
    sinal.throwIfAborted();
    const fundo = config.entrada !== "nenhuma"
      ? await capturarFolhaEncarte(folha, modelo, { escala, ocultar: ".encarte-arte-produto" })
      : semElementos;
    cenas.push({ completa, semElementos, fundo, produtos, escala });
  }
  sinal.throwIfAborted();
  return cenas;
}

function suavizar(n) {
  const t = Math.max(0, Math.min(1, n));
  return 1 - (1 - t) ** 3;
}

function pintarCena(ctx, cena, segundos, config, velocidade) {
  const tempo = segundos / velocidade;
  if (tempo >= FIM_ENTRADA) {
    ctx.drawImage(cena.completa, 0, 0);
    return;
  }

  ctx.drawImage(cena.fundo, 0, 0);
  cena.produtos.forEach(({ area: { x, y, w, h }, efeito, perspectiva, elementos }, indice) => {
    if (w <= 0 || h <= 0) return;
    const atraso = efeito === "sequencia" ? indice * .09 : config.entrada === "aleatorio" ? indice * .06 : 0;
    const entrada = efeito === "nenhuma" ? 1 : suavizar((tempo - atraso) / .55);
    if (entrada <= 0) return;
    const restante = 1 - entrada;
    const xEntrada = efeito === "esquerda" ? -restante * 65 * cena.escala : 0;
    let yEntrada = 0;
    if (efeito === "deslizar") yEntrada = restante * 30 * cena.escala;
    if (efeito === "salto") {
      const progresso = Math.max(0, Math.min(1, (tempo - atraso) / .55));
      yEntrada = (restante * 36 - Math.sin(progresso * Math.PI) * 19) * cena.escala;
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    if (efeito === "zoom") {
      const escala = .78 + entrada * .22;
      ctx.translate(x + w / 2, y + h / 2);
      ctx.scale(escala, escala);
      ctx.translate(-x - w / 2, -y - h / 2);
    }
    const projetar = perspectiva && entrada < 1;
    const destino = projetar ? perspectiva.getContext("2d") : ctx;
    const opacidade = projetar ? 1 : entrada;
    if (projetar) {
      destino.clearRect(0, 0, w, h);
      destino.save();
      destino.translate(-x, -y);
    }
    if (efeito !== "nenhuma") {
      destino.globalAlpha = opacidade;
      destino.drawImage(cena.semElementos, x, y, w, h, x + xEntrada, y + yEntrada, w, h);
    }
    elementos.forEach((area, ordem) => {
      const progresso = (tempo - atraso - .18 - ordem * .07) / .5;
      const revelado = suavizar(progresso);
      if (revelado <= 0) return;
      pintarElementoEncarte(destino, cena.completa, area, {
        efeito: area.efeito, progresso, revelado,
        opacidade, escala: cena.escala, xEntrada, yEntrada,
      });
    });
    if (projetar) {
      destino.restore();
      ctx.globalAlpha = entrada;
      pintarProdutoEmPerspectiva(ctx, perspectiva, x, y, efeito, entrada);
    }
    ctx.restore();
  });
}

export function criarReprodutorEncarte(canvas, cenas, config) {
  const ctx = canvas.getContext("2d", { alpha: false });
  canvas.width = cenas[0].completa.width;
  canvas.height = cenas[0].completa.height;
  const duracao = config.segundos * cenas.length;
  const transicao = document.createElement("canvas");
  transicao.width = canvas.width;
  transicao.height = canvas.height;
  const ctxTransicao = transicao.getContext("2d", { alpha: false });

  const fator = (valor) => VELOCIDADES_ENCARTE.find(([id]) => id === valor)?.[2] ?? 1;
  const temTransicao = cenas.length > 1 && config.transicao !== "direta";
  const duracaoTransicao = temTransicao ? DURACAO_TRANSICAO * fator(config.velocidadeTransicao) : 0;
  const velocidade = Math.min(fator(config.velocidade), (config.segundos - duracaoTransicao - .4) / FIM_ENTRADA);

  const ordemTransicoes = config.transicao === "aleatorio"
    ? embaralharEfeitosEncarte(TRANSICOES_ENCARTE, config.semente ^ 1457918069, "direta")
    : [config.transicao];

  function desenhar(segundo) {
    const tempoTotal = Math.max(0, Math.min(duracao, segundo));
    const pagina = Math.min(cenas.length - 1, Math.floor(tempoTotal / config.segundos));
    const tempo = tempoTotal - pagina * config.segundos;
    const seguinte = cenas[pagina + 1];
    const inicioTransicao = config.segundos - duracaoTransicao;
    if (!seguinte || config.transicao === "direta" || tempo <= inicioTransicao) {
      pintarCena(ctx, cenas[pagina], tempo, config, velocidade);
      return;
    }

    pintarCena(ctxTransicao, seguinte, 0, config, velocidade);
    const avancado = suavizar((tempo - inicioTransicao) / duracaoTransicao);
    const efeito = ordemTransicoes[pagina % ordemTransicoes.length];
    pintarTransicaoEncarte(ctx, cenas[pagina].completa, transicao, efeito, avancado);
  }

  return { desenhar, duracao };
}

function criarGravador(stream) {
  for (const mimeType of [...MIME_MP4, ...MIME_WEBM]) {
    if (!MediaRecorder.isTypeSupported(mimeType)) continue;
    try {
      return new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 4_000_000 });
    } catch {
      // Alguns navegadores anunciam tipos que não suportam para captura de canvas.
    }
  }
  throw new Error("O navegador não oferece gravação de vídeo. Tente usar o Chrome ou Edge.");
}

export async function gravarVideoEncarte(canvas, reprodutor, sinal, progresso) {
  if (!canvas.captureStream || typeof MediaRecorder === "undefined") {
    throw new Error("Este navegador não oferece gravação de vídeo. Tente usar o Chrome ou Edge.");
  }

  const stream = canvas.captureStream(FPS);
  const partes = [];
  let frame;
  let gravador;
  let cancelar;
  let verificarVisibilidade;
  let fim;
  try {
    gravador = criarGravador(stream);
    const arquivo = new Promise((resolve, reject) => {
      const falhar = (erro) => {
        reject(erro);
        if (gravador.state !== "inactive") gravador.stop();
      };
      cancelar = () => falhar(sinal.reason);
      verificarVisibilidade = () => {
        if (document.hidden) falhar(new Error("Mantenha a aba aberta durante a gravação e tente novamente."));
      };
      sinal.addEventListener("abort", cancelar, { once: true });
      document.addEventListener("visibilitychange", verificarVisibilidade);
      gravador.ondataavailable = ({ data }) => { if (data.size) partes.push(data); };
      gravador.onstop = () => resolve(new Blob(partes, { type: gravador.mimeType }));
      gravador.onerror = () => falhar(new Error("O navegador não conseguiu gravar o encarte."));
      sinal.throwIfAborted();
      gravador.onstart = () => {
        const inicio = performance.now();
        function encerrar() {
          if (gravador.state !== "recording") return;
          cancelAnimationFrame(frame);
          window.clearTimeout(fim);
          reprodutor.desenhar(reprodutor.duracao);
          progresso?.(reprodutor.duracao, reprodutor.duracao);
          fim = window.setTimeout(() => {
            if (gravador.state === "recording") gravador.stop();
          }, 180);
        }
        fim = window.setTimeout(encerrar, (reprodutor.duracao + .2) * 1000);
        function gravar(agora) {
          if (gravador.state !== "recording") return;
          const tempo = Math.max(0, (agora - inicio) / 1000);
          if (tempo >= reprodutor.duracao) {
            encerrar();
            return;
          }
          reprodutor.desenhar(tempo);
          progresso?.(tempo, reprodutor.duracao);
          frame = requestAnimationFrame(gravar);
        }
        frame = requestAnimationFrame(gravar);
      };
      gravador.start(500);
      reprodutor.desenhar(0);
    });
    const blob = await arquivo;
    if (!blob.size) throw new Error("O vídeo gerado está vazio. Tente novamente.");
    return blob;
  } finally {
    cancelAnimationFrame(frame);
    window.clearTimeout(fim);
    if (cancelar) sinal.removeEventListener("abort", cancelar);
    if (verificarVisibilidade) document.removeEventListener("visibilitychange", verificarVisibilidade);
    stream.getTracks().forEach((track) => track.stop());
  }
}
