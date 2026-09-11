/** Número oficial do canal de ofertas (API WhatsApp). */
export const WHATSAPP_OFERTAS_E164 = "554598003457";

export const WHATSAPP_OFERTAS_EXIBICAO = "(45) 9800-3457";

/** Mensagem pré-preenchida ao abrir o chat. */
export const WHATSAPP_OFERTAS_MENSAGEM =
  "Olá! Quero ver as ofertas e informações do Clube Superama+";

/**
 * Link wa.me com texto pronto.
 * @param {string} [mensagem]
 */
export function linkWhatsAppOfertas(mensagem = WHATSAPP_OFERTAS_MENSAGEM) {
  const texto = encodeURIComponent(String(mensagem || WHATSAPP_OFERTAS_MENSAGEM));
  return `https://wa.me/${WHATSAPP_OFERTAS_E164}?text=${texto}`;
}

export function abrirWhatsAppOfertas(mensagem) {
  const url = linkWhatsAppOfertas(mensagem);
  window.open(url, "_blank", "noopener,noreferrer");
}
