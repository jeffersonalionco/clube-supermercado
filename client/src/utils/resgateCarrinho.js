export function quantidadeBrinde(quantidades, brindeId) {
  return Number(quantidades[String(brindeId)]) || 0;
}

export function totalUnidadesCarrinho(quantidades) {
  return Object.values(quantidades).reduce((acc, q) => acc + (Number(q) || 0), 0);
}

export function pontosNoCarrinho(brindes, quantidades) {
  return (brindes || []).reduce((acc, brinde) => {
    const qtd = quantidadeBrinde(quantidades, brinde.id);
    return acc + qtd * (Number(brinde.pontos) || 0);
  }, 0);
}

export function maxQuantidadeBrinde(brinde, saldoCliente, quantidades, catalogo) {
  const pontosUnit = Number(brinde.pontos) || 0;
  if (pontosUnit <= 0) return 0;

  const estoque = Number(brinde.estoque) || 0;
  if (estoque <= 0) return 0;

  const carrinhoSemEste = { ...quantidades };
  delete carrinhoSemEste[String(brinde.id)];
  const pontosOutros = pontosNoCarrinho(catalogo, carrinhoSemEste);
  const saldoRestante = Math.max(0, saldoCliente - pontosOutros);
  const maxPorSaldo = Math.floor(saldoRestante / pontosUnit);

  return Math.max(0, Math.min(estoque, maxPorSaldo));
}

export function itensCarrinhoParaApi(quantidades) {
  return Object.entries(quantidades)
    .map(([brindeId, quantidade]) => ({
      brindeId: Number(brindeId),
      quantidade: Number(quantidade),
    }))
    .filter((item) => item.brindeId >= 1 && item.quantidade >= 1);
}

export function agruparItensComprovante(itens) {
  const map = new Map();
  for (const item of itens || []) {
    const key = item.brindeId ?? item.brindeNome;
    const atual = map.get(key);
    if (atual) {
      atual.quantidade += 1;
      atual.pontos += Number(item.pontos) || 0;
    } else {
      map.set(key, {
        ...item,
        quantidade: 1,
        pontos: Number(item.pontos) || 0,
      });
    }
  }
  return [...map.values()];
}
