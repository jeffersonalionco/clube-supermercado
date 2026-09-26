import {
  fetchPadaria,
  fetchPadariaAdmin,
  loadPadariaSession,
} from "./padariaSession.js";

const STORAGE_LARGURA = "padaria.impressora.largura.v1";

/** Largura do cupom em mm (58 ou 80). */
export function obterLarguraCupomMm() {
  try {
    const v = Number(localStorage.getItem(STORAGE_LARGURA));
    if (v === 58 || v === 80) return v;
  } catch {
    /* ignore */
  }
  return 80;
}

export function definirLarguraCupomMm(mm) {
  const v = Number(mm) === 58 ? 58 : 80;
  try {
    localStorage.setItem(STORAGE_LARGURA, String(v));
  } catch {
    /* ignore */
  }
  return v;
}

function postImpressao(pathPadaria, pathAdmin, body) {
  if (loadPadariaSession()?.token) {
    return fetchPadaria(pathPadaria, { method: "POST", body });
  }
  return fetchPadariaAdmin(pathAdmin, { method: "POST", body });
}

/**
 * Manda o cupom em ESC/POS para o print-server do PDV13 (TCP 9100).
 * Não usa o diálogo do Windows nem a máquina do notebook.
 */
export async function imprimirPedidoPadaria(pedido, { larguraMm } = {}) {
  if (!pedido?.id) throw new Error("Pedido indisponível");
  const mm = Number(larguraMm) === 58 ? 58 : obterLarguraCupomMm();
  return postImpressao(
    `/pedidos/${pedido.id}/imprimir`,
    `/admin/pedidos/${pedido.id}/imprimir`,
    { larguraMm: mm }
  );
}

export async function imprimirTestePadaria({ larguraMm } = {}) {
  const mm = Number(larguraMm) === 58 ? 58 : obterLarguraCupomMm();
  return postImpressao("/impressora/teste", "/admin/impressora/teste", {
    larguraMm: mm,
  });
}
