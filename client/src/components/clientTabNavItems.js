import {
  IconCart,
  IconGift,
  IconHome,
  IconNews,
  IconOffers,
  IconStar,
} from "./icons/ClientIcons.jsx";

export const CLIENT_TAB_ITEMS = [
  { id: "home", label: "Início", Icon: IconHome },
  { id: "ofertas", label: "Ofertas", Icon: IconOffers },
  { id: "compras", label: "Compras", Icon: IconCart },
  { id: "pontos", label: "Pontos", Icon: IconStar },
  { id: "premios", label: "Prêmios", Icon: IconGift },
  { id: "novidades", label: "Novidades", Icon: IconNews },
];

export function filtrarTabItems(pontosAtivo) {
  if (pontosAtivo) return CLIENT_TAB_ITEMS;
  return CLIENT_TAB_ITEMS.filter(
    (item) =>
      item.id === "home" ||
      item.id === "ofertas" ||
      item.id === "compras" ||
      item.id === "novidades"
  );
}
