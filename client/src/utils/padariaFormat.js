/** Formatação e labels compartilhados do módulo Padaria */

export const STATUS_PEDIDO = {
  novo: "Novo",
  em_producao: "Em produção",
  pronto: "Pronto",
  entregue: "Entregue",
  cancelado: "Cancelado",
};

export function formatCurrency(valor, { porKg = false } = {}) {
  const n = Number(valor);
  const safe = Number.isFinite(n) ? n : 0;
  const txt = safe.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
  return porKg ? `${txt}/kg` : txt;
}

/** @deprecated Use formatCurrency — mantido para compatibilidade */
export function formatarPrecoPadaria(valor, vendaPorKg = false) {
  return formatCurrency(valor, { porKg: Boolean(vendaPorKg) });
}

/**
 * Subtotal da linha: bolo × qtd + decoração.
 * Decoração é valor fixo (não multiplica por kg). Em UN, multiplica pela quantidade.
 */
export function calcularSubtotalItemPadaria({
  precoUnitario,
  quantidade,
  decoracaoPreco = 0,
  vendaPorKg = false,
  unidade = "",
} = {}) {
  const qtd = Number(quantidade) || 0;
  const preco = Number(precoUnitario) || 0;
  const deco = Number(decoracaoPreco) || 0;
  const porKg = Boolean(vendaPorKg) || String(unidade).toUpperCase() === "KG";
  const bolo = preco * qtd;
  const decoTotal = porKg ? deco : deco * qtd;
  return Math.round((bolo + decoTotal) * 100) / 100;
}

/** Unidades de estoque a baixar da decoração nesta linha. */
export function unidadesEstoqueDecoracao({ quantidade, vendaPorKg = false, unidade = "" } = {}) {
  const porKg = Boolean(vendaPorKg) || String(unidade).toUpperCase() === "KG";
  if (porKg) return 1;
  return Math.max(1, Math.round(Number(quantidade) || 1));
}

/** Fuso oficial da loja (sempre Brasília, independente do SO/browser). */
export const FUSO_BRASILIA = "America/Sao_Paulo";

/** Data civil em Brasília YYYY-MM-DD (evita bug de UTC do toISOString). */
export function dataLocalISO(date = new Date()) {
  const d = date instanceof Date ? date : new Date();
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO_BRASILIA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** YYYY-MM-DD → DD-MM-YYYY */
export function isoParaBr(iso) {
  const s = String(iso || "").slice(0, 10);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** DD-MM-YYYY | DD/MM/YYYY | YYYY-MM-DD → YYYY-MM-DD */
export function brParaIso(valor) {
  const s = String(valor || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (!m) return null;
  const dia = String(m[1]).padStart(2, "0");
  const mes = String(m[2]).padStart(2, "0");
  const ano = m[3];
  const d = Number(dia);
  const mo = Number(mes);
  const a = Number(ano);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || a < 2000) return null;
  return `${ano}-${mes}-${dia}`;
}

/** Normaliza hora 24h para HH:MM */
export function normalizarHora24(valor) {
  const s = String(valor || "").trim();
  let m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) {
    const digits = s.replace(/\D/g, "");
    if (digits.length === 3 || digits.length === 4) {
      const padded = digits.padStart(4, "0");
      m = [null, padded.slice(0, 2), padded.slice(2)];
    }
  }
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** ISO date (YYYY-MM-DD) ou Date → 28-08-2026 */
export function formatDate(valor) {
  if (!valor) return "—";
  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) return "—";
    return isoParaBr(dataLocalISO(valor)) || "—";
  }
  const iso = brParaIso(valor) || String(valor).slice(0, 10);
  return isoParaBr(iso) || "—";
}

/** data + hora 24h → 28-08-2026 às 16:30 */
export function formatDateTime(data, hora) {
  const d = formatDate(data);
  const h = normalizarHora24(hora) || String(hora || "").slice(0, 5);
  if (d === "—" && !h) return "—";
  if (!h) return d;
  return `${d} às ${h}`;
}

export function formatPhone(telefone) {
  const digitos = String(telefone || "").replace(/\D/g, "");
  if (!digitos) return "";
  if (digitos.length === 11) {
    return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7)}`;
  }
  if (digitos.length === 10) {
    return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 6)}-${digitos.slice(6)}`;
  }
  return String(telefone).trim();
}

export function formatOrderCode(codigo) {
  return String(codigo || "").trim().toUpperCase();
}

export function labelStatusPedido(status) {
  return STATUS_PEDIDO[status] || status || "—";
}
