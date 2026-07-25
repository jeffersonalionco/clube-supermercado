export const REAIS_POR_PONTO = 50;
export const VALOR_REFERENCIA_PONTO = 0.5;

export function sugerirPontosPorValor(valorReais) {
  const valor = Number(String(valorReais).replace(",", "."));
  if (!Number.isFinite(valor) || valor <= 0) return null;
  return Math.max(1, Math.ceil(valor / VALOR_REFERENCIA_PONTO));
}

export function formatarValorReferenciaPonto() {
  return VALOR_REFERENCIA_PONTO.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}
