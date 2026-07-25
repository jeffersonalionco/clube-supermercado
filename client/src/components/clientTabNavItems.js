import { IconCart, IconGift, IconHome, IconStar } from "./icons/ClientIcons.jsx";

export const CLIENT_TAB_ITEMS = [
  { id: "home", label: "Início", Icon: IconHome },
  { id: "compras", label: "Compras", Icon: IconCart },
  { id: "pontos", label: "Pontos", Icon: IconStar },
  { id: "premios", label: "Prêmios", Icon: IconGift },
];

export function filtrarTabItems(pontosAtivo) {
  if (pontosAtivo) return CLIENT_TAB_ITEMS;
  return CLIENT_TAB_ITEMS.filter((item) => item.id === "home" || item.id === "compras");
}
