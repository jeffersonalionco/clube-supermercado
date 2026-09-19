/** Número da equipe da padaria (mesmo WHATSAPP_REDIRECT_WA do servidor). */
export const WHATSAPP_PADARIA_E164 = "554598161551";

export function montarMensagemPedidoPadaria({
  nome,
  codigo,
  precoLabel,
  decoracaoNome,
  decoracaoCodigo,
} = {}) {
  const linhas = [
    "Olá! Quero encomendar na padaria:",
    `*${String(nome || "Produto").trim()}*`,
  ];
  if (codigo) linhas.push(`Código: ${codigo}`);
  if (precoLabel) linhas.push(`Preço: ${precoLabel}`);
  if (decoracaoNome) {
    const decoCod = decoracaoCodigo ? ` (${decoracaoCodigo})` : "";
    linhas.push(`Decoração: ${decoracaoNome}${decoCod}`);
  } else if (codigo) {
    linhas.push("Decoração: sem decoração");
  }
  linhas.push("");
  linhas.push("Pedido só fecha com confirmação da padaria.");
  return linhas.join("\n");
}

export function linkWhatsAppPadaria(mensagem, numero = WHATSAPP_PADARIA_E164) {
  const n =
    String(numero || "").replace(/\D/g, "") || WHATSAPP_PADARIA_E164;
  const texto = encodeURIComponent(String(mensagem || "").trim());
  const base = `https://wa.me/${n}`;
  return texto ? `${base}?text=${texto}` : base;
}

export function abrirWhatsAppPadaria(mensagem, numero) {
  const url = linkWhatsAppPadaria(mensagem, numero);
  window.open(url, "_blank", "noopener,noreferrer");
  return url;
}
