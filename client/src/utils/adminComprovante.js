import { fetchAdmin } from "./adminSession.js";
import { baixarPdfHtmlComprovante, imprimirHtmlComprovante } from "./comprovanteResgate.js";

export function formatarCodigoResgate(codigo) {
  return String(codigo || "").trim();
}

export async function carregarComprovante(codigo) {
  return fetchAdmin(`/api/admin/comprovantes/${encodeURIComponent(codigo)}`);
}

export function imprimirComprovante(html) {
  imprimirHtmlComprovante(html);
}

export async function baixarPdfComprovante(html, codigo) {
  return baixarPdfHtmlComprovante(html, codigo);
}

export async function confirmarAssinaturaComprovante(codigo, observacao) {
  return fetchAdmin(`/api/admin/comprovantes/${encodeURIComponent(codigo)}/assinatura`, {
    method: "POST",
    body: JSON.stringify({ observacao: observacao || undefined }),
  });
}
