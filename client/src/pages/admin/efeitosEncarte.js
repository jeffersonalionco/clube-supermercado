export function pintarElementoEncarte(ctx, imagem, { x, y, w, h }, {
  efeito, progresso, revelado, opacidade, escala, xEntrada, yEntrada,
}) {
  const instante = Math.min(1, progresso);
  const restante = 1 - revelado;
  let fator = 1;
  if (efeito === "pulso") fator += Math.sin(instante * Math.PI) * .12;
  if (efeito === "elastico") fator = 1 - .34 * (1 - instante) ** 2 * Math.cos(instante * 9);
  const largura = w * fator;
  const altura = h * fator;
  const desvioX = efeito === "deslizar" ? -restante * 26 * escala : 0;
  const desvioY = efeito === "subir" ? restante * 14 * escala : 0;
  const meioX = x + xEntrada + w / 2 + desvioX;
  const meioY = y + yEntrada + h / 2 + desvioY;

  ctx.save();
  ctx.translate(meioX, meioY);
  ctx.globalAlpha = opacidade * (efeito === "varrer" ? 1 : revelado);
  if (efeito === "giro") ctx.rotate(-restante * Math.PI / 8);
  if (efeito === "varrer") {
    ctx.beginPath();
    ctx.rect(-w / 2, -h / 2, w * revelado, h);
    ctx.clip();
  }
  ctx.drawImage(imagem, x, y, w, h, -largura / 2, -altura / 2, largura, altura);

  if (efeito === "brilho" && instante < 1) {
    const centro = (-.7 + instante * 1.4) * w;
    const faixa = w * .19;
    const brilho = ctx.createLinearGradient(centro - faixa, 0, centro + faixa, 0);
    brilho.addColorStop(0, "transparent");
    brilho.addColorStop(.5, "rgba(255, 255, 255, .62)");
    brilho.addColorStop(1, "transparent");
    ctx.globalAlpha = opacidade * Math.sin(instante * Math.PI);
    ctx.fillStyle = brilho;
    ctx.fillRect(-w / 2, -h / 2, w, h);
  }
  ctx.restore();
}

function recortarTransicao(ctx, largura, altura, efeito, progresso) {
  ctx.beginPath();
  switch (efeito) {
    case "cortina":
      ctx.rect(0, 0, largura * progresso, altura);
      break;
    case "circular":
      ctx.arc(largura / 2, altura / 2, Math.hypot(largura, altura) * progresso / 2, 0, 2 * Math.PI);
      break;
    case "diagonal": {
      const alcance = (largura + altura) * progresso;
      ctx.moveTo(0, 0);
      ctx.lineTo(alcance, 0);
      ctx.lineTo(0, alcance);
      ctx.closePath();
      break;
    }
    case "persianas": {
      const faixa = altura / 7;
      for (let i = 0; i < 7; i += 1) ctx.rect(0, faixa * i, largura, faixa * progresso);
      break;
    }
    case "mosaico": {
      const celulaLargura = largura / 6;
      const celulaAltura = altura / 4;
      for (let linha = 0; linha < 4; linha += 1) {
        for (let coluna = 0; coluna < 6; coluna += 1) {
          const avanco = Math.max(0, Math.min(1, (progresso - (linha + coluna) * .055) * 2));
          const margem = (1 - avanco) / 2;
          ctx.rect((coluna + margem) * celulaLargura, (linha + margem) * celulaAltura,
            celulaLargura * avanco, celulaAltura * avanco);
        }
      }
      break;
    }
  }
  ctx.clip();
}

export function pintarTransicaoEncarte(ctx, atual, seguinte, efeito, progresso) {
  const { width: largura, height: altura } = atual;
  if (progresso <= 0) {
    ctx.drawImage(atual, 0, 0);
    return;
  }
  if (progresso >= 1) {
    ctx.drawImage(seguinte, 0, 0);
    return;
  }
  if (efeito === "deslizar" || efeito === "subir") {
    const x = efeito === "deslizar" ? Math.round(largura * progresso) : 0;
    const y = efeito === "subir" ? Math.round(altura * progresso) : 0;
    ctx.drawImage(atual, -x, -y);
    ctx.drawImage(seguinte, efeito === "deslizar" ? largura - x : 0, efeito === "subir" ? altura - y : 0);
    return;
  }
  if (efeito === "divisao") {
    const metade = largura / 2;
    const deslocamento = metade * progresso;
    ctx.drawImage(seguinte, 0, 0);
    ctx.drawImage(atual, 0, 0, metade, altura, -deslocamento, 0, metade, altura);
    ctx.drawImage(atual, metade, 0, metade, altura, metade + deslocamento, 0, metade, altura);
    return;
  }

  ctx.drawImage(atual, 0, 0);
  ctx.save();
  if (efeito === "dissolver" || efeito === "zoom") {
    const escala = efeito === "zoom" ? 1.25 - .25 * progresso : 1;
    ctx.globalAlpha = progresso;
    ctx.drawImage(seguinte, largura * (1 - escala) / 2, altura * (1 - escala) / 2, largura * escala, altura * escala);
  } else {
    recortarTransicao(ctx, largura, altura, efeito, progresso);
    ctx.drawImage(seguinte, 0, 0);
  }
  ctx.restore();
}


export function pintarProdutoEmPerspectiva(ctx, cartao, x, y, efeito, entrada) {
  const { width: w, height: h } = cartao;
  if (entrada >= 1) {
    ctx.drawImage(cartao, x, y);
    return;
  }

  // A malha em faixas aproxima a projeção do cartão sem depender de WebGL na gravação.
  const vertical = efeito === "inclinacao3d";
  const avancar = efeito === "profundidade3d";
  const eixo = vertical ? h : w;
  const transversal = vertical ? w : h;
  const restante = 1 - entrada;
  const angulo = restante * (avancar ? .66 : 1.38);
  const profundidade = avancar ? .62 + .38 * entrada : 1;
  const distancia = eixo * 1.45;
  const projetar = (posicao) => {
    const local = posicao - eixo / 2;
    const perspectiva = distancia / (distancia + local * Math.sin(angulo));
    return {
      posicao: eixo / 2 + local * Math.cos(angulo) * perspectiva * profundidade,
      escala: perspectiva * profundidade,
    };
  };

  const faixas = Math.min(24, eixo);
  for (let i = 0; i < faixas; i += 1) {
    const inicio = Math.round(i * eixo / faixas);
    const fim = Math.round((i + 1) * eixo / faixas);
    const a = projetar(inicio);
    const b = projetar(fim);
    const comprimento = transversal * (a.escala + b.escala) / 2;
    const origem = (transversal - comprimento) / 2;
    const span = b.posicao - a.posicao;
    if (vertical) ctx.drawImage(cartao, 0, inicio, w, fim - inicio, x + origem, y + a.posicao, comprimento, span);
    else ctx.drawImage(cartao, inicio, 0, fim - inicio, h, x + a.posicao, y + origem, span, comprimento);
  }
}
