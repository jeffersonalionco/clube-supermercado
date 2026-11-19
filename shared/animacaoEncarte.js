export const ENTRADAS_3D_ENCARTE = ["virada3d", "inclinacao3d", "profundidade3d"];

export const ENTRADAS_ENCARTE = [
  ["aleatorio", "Aleatória"],
  ["sequencia", "Um produto por vez"],
  ["deslizar", "Deslizar de baixo"],
  ["esquerda", "Deslizar da esquerda"],
  ["zoom", "Aproximar"],
  ["salto", "Entrar com salto"],
  ["suave", "Surgir suavemente"],
  [ENTRADAS_3D_ENCARTE[0], "Virada 3D"],
  [ENTRADAS_3D_ENCARTE[1], "Inclinação 3D"],
  [ENTRADAS_3D_ENCARTE[2], "Zoom em profundidade 3D"],
  ["nenhuma", "Sem animação de entrada"],
];

export const TRANSICOES_ENCARTE = [
  ["aleatorio", "Aleatória"],
  ["dissolver", "Dissolver"],
  ["deslizar", "Deslizar para o lado"],
  ["subir", "Deslizar para cima"],
  ["cortina", "Cortina lateral"],
  ["zoom", "Zoom suave"],
  ["persianas", "Persianas"],
  ["circular", "Abertura circular"],
  ["divisao", "Divisão ao centro"],
  ["diagonal", "Varredura diagonal"],
  ["mosaico", "Mosaico"],
  ["direta", "Troca direta"],
];

export const EFEITOS_ELEMENTOS_ENCARTE = [
  ["aleatorio", "Aleatório"],
  ["revelar", "Surgir suavemente"],
  ["subir", "Subir suavemente"],
  ["pulso", "Pulso de destaque"],
  ["elastico", "Entrada elástica"],
  ["giro", "Giro suave"],
  ["varrer", "Revelar em faixa"],
  ["brilho", "Brilho deslizante"],
  ["deslizar", "Deslizar para dentro"],
];

export const VELOCIDADES_ENCARTE = [
  ["rapida", "Rápida", .65],
  ["normal", "Normal", 1],
  ["lenta", "Lenta", 1.45],
];

export const ELEMENTOS_ENCARTE = [
  ["foto", "Fotos"], ["nome", "Nomes"], ["preco", "Preços"], ["selo", "Selos de oferta"],
];

export const MIN_SEGUNDOS_ENCARTE = 3;
export const MAX_SEGUNDOS_ENCARTE = 12;

export const ANIMACAO_ENCARTE_PADRAO = {
  ativa: false,
  entrada: "sequencia",
  transicao: "dissolver",
  segundos: 6,
  velocidade: "normal",
  velocidadeTransicao: "normal",
  efeitoElementos: "revelar",
  elementos: ["preco"],
  repetir: true,
  semente: 0,
};

export function normalizarAnimacaoEncarte(valor) {
  const entrada = ENTRADAS_ENCARTE.some(([id]) => id === valor?.entrada)
    ? valor.entrada : ANIMACAO_ENCARTE_PADRAO.entrada;
  const transicao = TRANSICOES_ENCARTE.some(([id]) => id === valor?.transicao)
    ? valor.transicao : ANIMACAO_ENCARTE_PADRAO.transicao;
  const elementos = Array.isArray(valor?.elementos)
    ? ELEMENTOS_ENCARTE.filter(([id]) => valor.elementos.includes(id)).map(([id]) => id)
    : ANIMACAO_ENCARTE_PADRAO.elementos;
  const segundos = Number.isInteger(valor?.segundos)
    ? Math.max(MIN_SEGUNDOS_ENCARTE, Math.min(MAX_SEGUNDOS_ENCARTE, valor.segundos))
    : ANIMACAO_ENCARTE_PADRAO.segundos;
  return {
    ativa: valor?.ativa === true, entrada, transicao, segundos, elementos,
    velocidade: VELOCIDADES_ENCARTE.some(([id]) => id === valor?.velocidade) ? valor.velocidade : "normal",
    velocidadeTransicao: VELOCIDADES_ENCARTE.some(([id]) => id === valor?.velocidadeTransicao)
      ? valor.velocidadeTransicao : "normal",
    efeitoElementos: EFEITOS_ELEMENTOS_ENCARTE.some(([id]) => id === valor?.efeitoElementos)
      ? valor.efeitoElementos : "revelar",
    repetir: valor?.repetir !== false,
    semente: Number.isInteger(valor?.semente) && valor.semente >= 0 && valor.semente <= 0xffffffff ? valor.semente : 0,
  };
}

export function embaralharEfeitosEncarte(opcoes, semente, excluir) {
  const ids = opcoes.map(([id]) => id).filter((id) => id !== "aleatorio" && id !== excluir);
  let estado = semente >>> 0;
  for (let i = ids.length - 1; i > 0; i -= 1) {
    estado = (Math.imul(1664525, estado) + 1013904223) >>> 0;
    const j = Math.floor((estado / 0x100000000) * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids;
}
