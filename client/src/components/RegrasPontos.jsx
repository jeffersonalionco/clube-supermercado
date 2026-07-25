import { IconEstorno, IconConvenio, IconPoints, IconShopping } from "./icons/ClientIcons.jsx";

const REGRAS = [
  {
    id: "valido",
    icon: <IconShopping size={20} />,
    titulo: "Dinheiro, cartão e PIX",
    descricao: "Geram pontos normalmente",
    status: "ok",
  },
  {
    id: "validade",
    icon: <IconPoints size={20} />,
    titulo: "Validade dos pontos",
    descricao: "Cada ponto vale por 12 meses a partir da compra que o gerou",
    status: "validade",
  },
  {
    id: "convenio",
    icon: <IconConvenio size={20} />,
    titulo: "Convênio",
    descricao: "Aparece nas compras, mas não pontua",
    status: "convenio",
  },
  {
    id: "cancelado",
    icon: <IconEstorno size={20} />,
    titulo: "Cupom cancelado",
    descricao: "Não conta e pode estornar pontos",
    status: "cancelado",
  },
];

export default function RegrasPontos({ compact = false }) {
  return (
    <section
      className={`regras-pontos${compact ? " regras-pontos--compact" : ""}`}
      aria-label="Regras de pontuação"
    >
      <h3 className="regras-pontos__titulo">O que vale para pontos?</h3>
      <ul className="regras-pontos__lista">
        {REGRAS.map((regra) => (
          <li
            key={regra.id}
            className={`regras-pontos__item regras-pontos__item--${regra.status}`}
          >
            <span className="regras-pontos__icone">{regra.icon}</span>
            <span className="regras-pontos__texto">
              <strong>{regra.titulo}</strong>
              <small>{regra.descricao}</small>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
