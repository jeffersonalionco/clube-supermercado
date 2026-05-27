export function formatarDataBR(date) {
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${d}/${m}/${date.getFullYear()}`;
}

export function periodoMesAtual() {
  const agora = new Date();
  const inicio = new Date(agora.getFullYear(), agora.getMonth(), 1);
  return { dataini: formatarDataBR(inicio), datafim: formatarDataBR(agora) };
}

export function periodoUltimosDias(dias) {
  const fim = new Date();
  const inicio = new Date(fim);
  inicio.setDate(inicio.getDate() - (dias - 1));
  return { dataini: formatarDataBR(inicio), datafim: formatarDataBR(fim) };
}

export function formatarDataNascimentoInput(valor) {
  const d = valor.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

export function parseDataBR(str) {
  const m = String(str || "").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const date = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  if (
    date.getFullYear() !== Number(m[3]) ||
    date.getMonth() !== Number(m[2]) - 1 ||
    date.getDate() !== Number(m[1])
  ) {
    return null;
  }
  return date;
}

export function diasEntre(inicio, fim) {
  return Math.floor(
    Math.abs(fim.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24)
  );
}

export const MAX_DIAS_VENDAS = 90;
