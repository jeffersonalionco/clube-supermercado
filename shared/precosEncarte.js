export function precoManualValido(preco) {
  return Number.isFinite(preco) && preco >= .01 && Number(preco.toFixed(2)) === preco;
}

export function precoAtualEncarte(item) {
  return item.precoAtualEditado ?? item.preco;
}

export function unidadeExibidaEncarte(item) {
  return item.unidadeMedidaEditada?.trim() || item.unidadeMedida;
}

export function precoAnteriorEncarte(item) {
  if (item.mostrarPrecoAnterior === false) return null;
  if (precoManualValido(item.precoAnteriorEditado)) return item.precoAnteriorEditado;
  return Number.isFinite(item.precoAnterior) && item.precoAnterior > precoAtualEncarte(item)
    ? item.precoAnterior
    : null;
}

export function validadePrecoEncarte(item) {
  return item.precoAtualEditado == null ? item.validade : null;
}
