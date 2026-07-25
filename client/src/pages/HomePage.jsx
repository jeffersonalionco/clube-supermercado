import { useCallback, useEffect, useMemo, useState } from "react";
import MetajiCredit from "../components/MetajiCredit.jsx";
import Logo from "../components/Logo.jsx";
import AnimatedNumber from "../components/AnimatedNumber.jsx";
import ProgressBar from "../components/ProgressBar.jsx";
import PullToRefresh from "../components/PullToRefresh.jsx";
import RegrasPontos from "../components/RegrasPontos.jsx";
import {
  IconCart,
  IconContact,
  IconConvenio,
  IconGift,
  IconOffers,
  IconPoints,
  IconReceipt,
  IconShopping,
  IconStar,
  IconSupport,
  IconUser,
} from "../components/icons/ClientIcons.jsx";
import { clearSession, fetchAutenticado } from "../utils/session.js";
import { resolveImagemUrl } from "../utils/imagem.js";
import { mensagemParaUsuario } from "../utils/mensagensUsuario.js";
import { formatarMoeda } from "../utils/moeda.js";
import "../styles/home.css";
import "../styles/home-dashboard.css";
import "../styles/home-video.css";
import { useRefetchOnVisible } from "../hooks/useRefetchOnVisible.js";
import ClienteInsightsPanel from "../components/charts/ClienteInsightsPanel.jsx";
import HomeVideoCard from "../components/HomeVideoCard.jsx";
import {
  periodoInsightsVendas,
  resumoMesAtualDePorData,
  periodoDoMes,
} from "../utils/vendasCharts.js";
import {
  definirIntentCompras,
  intentComprasDia,
} from "../utils/comprasNavegacao.js";

const REAIS_POR_PONTO = 50;

async function buscarVendasInsights() {
  const periodo = periodoInsightsVendas();
  return fetchAutenticado(
    `/api/cliente/vendas?dataini=${encodeURIComponent(periodo.dataini)}&datafim=${encodeURIComponent(periodo.datafim)}`
  );
}

function montarDadosVendas(vendasRes) {
  const porData = vendasRes.porData ?? [];
  return {
    vendasPorData: porData,
    comprasResumo: resumoMesAtualDePorData(porData),
    comprasRecentes: extrairComprasRecentes(porData),
    comprasPeriodoLabel: "Este mês",
  };
}

function MenuCta({ icon, title, subtitle, onClick, variant = "default" }) {
  return (
    <button
      type="button"
      className={`home-menu-cta home-menu-cta--${variant}`}
      onClick={onClick}
    >
      <span className="home-menu-cta__icon" aria-hidden>
        {icon}
      </span>
      <span className="home-menu-cta__text">
        <strong>{title}</strong>
        <small>{subtitle}</small>
      </span>
      <span className="home-menu-cta__arrow" aria-hidden>
        →
      </span>
    </button>
  );
}

function iniciaisDoNome(nome) {
  const partes = String(nome || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!partes.length) return "C";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return `${partes[0][0]}${partes[partes.length - 1][0]}`.toUpperCase();
}

function formatarMembroDesde(dataStr) {
  if (!dataStr) return null;
  const match = String(dataStr).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return dataStr;
  const meses = [
    "jan", "fev", "mar", "abr", "mai", "jun",
    "jul", "ago", "set", "out", "nov", "dez",
  ];
  return `${meses[Number(match[2]) - 1]}/${match[3]}`;
}

function escolherProximoPremio(brindes, saldo) {
  const lista = [...(brindes || [])].sort(
    (a, b) => Number(a.pontos) - Number(b.pontos)
  );
  if (!lista.length) return null;

  const disponivel = lista.filter((b) => saldo >= Number(b.pontos));
  if (disponivel.length) {
    return { premio: disponivel[disponivel.length - 1], podeResgatar: true };
  }

  return { premio: lista[0], podeResgatar: false };
}

function rotuloAtividade(item) {
  if (!item) return null;
  if (item.tipo === "resgate") {
    return {
      titulo: `Resgate: ${item.brindeNome || "Brinde"}`,
      meta: `-${item.pontos} pontos`,
      icon: <IconGift size={18} />,
      tom: "resgate",
    };
  }
  if (item.tipo === "expiracao") {
    return {
      titulo: "Pontos expirados",
      meta: `-${item.pontos} pontos`,
      icon: <IconPoints size={18} />,
      tom: "expiracao",
    };
  }
  if (item.tipo === "estorno") {
    return {
      titulo: `Cancelamento · cupom ${item.cupomLabel || item.cupom}`,
      meta: item.pontos > 0 ? `-${item.pontos} pontos` : "Ajuste no saldo",
      icon: <IconShopping size={18} />,
      tom: "estorno",
    };
  }
  if (item.tipo === "convenio") {
    return {
      titulo: `Compra em convênio · ${item.cupomLabel || item.cupom}`,
      meta: `${formatarMoeda(item.valorCompra)} · sem pontos`,
      icon: <IconConvenio size={18} />,
      tom: "convenio",
    };
  }
  if (item.cancelada) {
    return {
      titulo: `Compra cancelada · ${item.cupomLabel || item.cupom}`,
      meta: formatarMoeda(item.valorCompra),
      icon: <IconShopping size={18} />,
      tom: "cancelada",
    };
  }
  return {
    titulo: `Compra · cupom ${item.cupomLabel || item.cupom}`,
    meta: `${formatarMoeda(item.valorCompra)} · contabilizada`,
    icon: <IconShopping size={18} />,
    tom: "compra",
  };
}

function formatarDataAtividade(item) {
  if (!item?.data) return "—";
  if (item.tipo === "resgate" || item.tipo === "estorno" || item.tipo === "expiracao") {
    try {
      return new Date(item.data).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    } catch {
      return "—";
    }
  }
  return item.data;
}

function extrairComprasRecentes(porData, limite = 4) {
  const lista = [];
  for (const dia of porData || []) {
    for (const venda of dia.vendas || []) {
      lista.push({
        ...venda,
        data: dia.data,
        dataLabel: dia.dataLabel,
      });
      if (lista.length >= limite) return lista;
    }
  }
  return lista;
}

function rotuloCompraRecente(venda) {
  if (!venda) return null;
  if (venda.cancelada) {
    return {
      titulo: `Cupom ${venda.numeroDcto || venda.cupom} · cancelado`,
      meta: formatarMoeda(venda.total),
      tom: "cancelada",
    };
  }
  if (venda.convenio) {
    return {
      titulo: `Cupom ${venda.numeroDcto || venda.cupom} · convênio`,
      meta: formatarMoeda(venda.total),
      tom: "convenio",
    };
  }
  return {
    titulo: `Cupom ${venda.numeroDcto || venda.cupom}`,
    meta: `${formatarMoeda(venda.total)}${venda.temDesconto ? " · com desconto" : ""}`,
    tom: "compra",
  };
}

function HomeBeneficiosSection({ variant = "default", pontosAtivo = true }) {
  return (
    <section
      className={`home-benefits${variant === "desk" ? " home-benefits--desk" : ""}`}
    >
      <div className="home-benefits__head">
        <h3 className="home-benefits__title">Benefícios do clube</h3>
        <p className="home-benefits__lead">
          {pontosAtivo
            ? "Vantagens exclusivas para quem faz parte do Superama+"
            : "Continue aproveitando as vantagens de ser membro do Superama+"}
        </p>
      </div>
      <div className="home-benefits__grid">
        <article className="home-benefit">
          <span className="home-benefit__icon" aria-hidden>
            <IconOffers />
          </span>
          <div>
            <h4>Ofertas exclusivas</h4>
            <p>Promoções especiais para membros do clube.</p>
          </div>
        </article>
        <article className="home-benefit">
          <span className="home-benefit__icon" aria-hidden>
            {pontosAtivo ? <IconPoints /> : <IconReceipt />}
          </span>
          <div>
            <h4>{pontosAtivo ? "Programa de pontos" : "Histórico de compras"}</h4>
            <p>
              {pontosAtivo
                ? "1 ponto a cada R$ 50 em compras elegíveis."
                : "Cupons e itens das suas compras com CPF cadastrado."}
            </p>
          </div>
        </article>
        <article className="home-benefit">
          <span className="home-benefit__icon" aria-hidden>
            <IconSupport />
          </span>
          <div>
            <h4>Atendimento preferencial</h4>
            <p>Prioridade no suporte ao cliente na loja.</p>
          </div>
        </article>
      </div>
    </section>
  );
}

function HomeDeskActionTile({ icon, title, subtitle, onClick, variant = "default" }) {
  return (
    <button
      type="button"
      className={`home-desk-tile home-desk-tile--${variant}`}
      onClick={onClick}
    >
      <span className="home-desk-tile__icon" aria-hidden>
        {icon}
      </span>
      <span className="home-desk-tile__body">
        <strong>{title}</strong>
        <small>{subtitle}</small>
      </span>
      <span className="home-desk-tile__arrow" aria-hidden>
        →
      </span>
    </button>
  );
}

function HomeDeskQuickNav({ onPremios, onCompras, onPontos, onPerfil, onContato, pontosAtivo = true }) {
  const itens = [
    onPremios && {
      id: "premios",
      variant: "featured",
      icon: <IconGift size={18} />,
      title: "Prêmios",
      subtitle: "Troque pontos por brindes",
      onClick: onPremios,
    },
    onCompras && {
      id: "compras",
      variant: pontosAtivo ? "default" : "featured",
      icon: <IconCart size={18} />,
      title: "Minhas compras",
      subtitle: pontosAtivo ? "Cupons e itens" : "Cupons e itens",
      onClick: onCompras,
    },
    onPontos && {
      id: "pontos",
      icon: <IconStar size={18} filled />,
      title: "Meus pontos",
      subtitle: "Histórico completo",
      onClick: onPontos,
    },
    onPerfil && {
      id: "perfil",
      icon: <IconUser size={18} />,
      title: "Meu perfil",
      subtitle: "Dados pessoais",
      onClick: onPerfil,
    },
    onContato && {
      id: "contato",
      icon: <IconContact size={18} />,
      title: "Meu contato",
      subtitle: "E-mail e telefone",
      onClick: onContato,
    },
  ].filter(Boolean);

  if (!itens.length) return null;

  return (
    <nav className="home-desk-quick" aria-label="Acesso rápido">
      <h2 className="home-desk-quick__label">Acesso rápido</h2>
      <div className="home-desk-quick__grid">
        {itens.map((item) => (
          <HomeDeskActionTile key={item.id} {...item} />
        ))}
      </div>
    </nav>
  );
}

function HomeDeskStatCard({ label, value, hint, onClick, copyable }) {
  const [copiado, setCopiado] = useState(false);

  async function handleClick() {
    if (!copyable || !value) {
      onClick?.();
      return;
    }
    try {
      await navigator.clipboard.writeText(String(value));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setCopiado(false);
    }
  }

  const Tag = onClick || copyable ? "button" : "div";

  return (
    <Tag
      type={Tag === "button" ? "button" : undefined}
      className={`home-desk-stat${onClick || copyable ? " home-desk-stat--interactive" : ""}`}
      onClick={onClick || copyable ? handleClick : undefined}
    >
      <span className="home-desk-stat__label">{label}</span>
      <span className="home-desk-stat__value">{value}</span>
      {copyable && (
        <span className="home-desk-stat__hint">{copiado ? "Copiado!" : "Clique para copiar"}</span>
      )}
      {hint && !copyable && <span className="home-desk-stat__hint">{hint}</span>}
    </Tag>
  );
}

function HomeFaq({ pontosAtivo = true }) {
  const itens = pontosAtivo
    ? [
        {
          pergunta: "O que gera pontos?",
          resposta:
            "Compras pagas em dinheiro, cartão ou PIX, com seu CPF no clube, a partir do cadastro.",
        },
        {
          pergunta: "Como resgato um prêmio?",
          resposta:
            "Acumule os pontos necessários e apresente seu CPF na loja para retirar o brinde.",
        },
        {
          pergunta: "Convênio ou cancelamento?",
          resposta:
            "Cupons em convênio aparecem nas compras, mas não pontuam. Cancelados podem estornar pontos.",
        },
      ]
    : [
        {
          pergunta: "Como vejo minhas compras?",
          resposta:
            "Informe seu CPF no caixa. Os cupons aparecem em Minhas compras em poucos minutos.",
        },
        {
          pergunta: "Qual período consigo consultar?",
          resposta:
            "Você pode ver compras dos últimos 90 dias, filtrando por mês ou intervalo personalizado.",
        },
        {
          pergunta: "Preciso atualizar meus dados?",
          resposta:
            "Mantenha e-mail e telefone em dia em Meu perfil e Meu contato para receber novidades do clube.",
        },
      ];

  return (
    <section className="home-faq" aria-label="Perguntas frequentes">
      <h3 className="home-faq__titulo">Como funciona</h3>
      <dl className="home-faq__lista">
        {itens.map((item) => (
          <div key={item.pergunta} className="home-faq__item">
            <dt>{item.pergunta}</dt>
            <dd>{item.resposta}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function HomePainelCompras({ resumo, periodoLabel, onCompras, compact = false }) {
  const totalGasto = resumo?.totalGasto ?? 0;
  const cupons = resumo?.totalVendasAtivas ?? 0;
  const descontos = resumo?.totalDescontos ?? 0;

  return (
    <section
      className={`home-compras-card${compact ? " home-compras-card--inline" : ""}`}
      aria-label="Resumo de compras"
    >
      <div className="home-compras-card__top">
        <div>
          <p className="home-compras-card__label">
            {periodoLabel || "Compras no mês"}
          </p>
          <div className="home-compras-card__valor-wrap">
            <span className="home-compras-card__valor">{formatarMoeda(totalGasto)}</span>
            <small>total</small>
          </div>
        </div>
        <span className="home-compras-card__icon" aria-hidden>
          <IconReceipt size={22} />
        </span>
      </div>

      <div className="home-compras-card__chips">
        <span className="home-compras-card__chip">
          <strong>{cupons}</strong> cupons
        </span>
        {descontos > 0 && (
          <span className="home-compras-card__chip home-compras-card__chip--desconto">
            <strong>{formatarMoeda(descontos)}</strong> em descontos
          </span>
        )}
      </div>

      {onCompras && (
        <button
          type="button"
          className="home-compras-card__cta"
          onClick={onCompras}
        >
          Ver minhas compras
        </button>
      )}
    </section>
  );
}

function HomeComprasRecentes({ compras, onCompras, periodoLabel }) {
  const lista = compras || [];

  return (
    <section className="home-dash-card home-dash-card--compras">
      <div className="home-dash-card__head">
        <h3 className="home-dash-card__titulo">Compras recentes</h3>
        {periodoLabel && (
          <span className="home-dash-card__periodo">{periodoLabel}</span>
        )}
      </div>

      {lista.length === 0 ? (
        <p className="home-dash-card__vazio">
          Nenhuma compra neste período. Passe na loja com seu CPF cadastrado e
          elas aparecerão aqui automaticamente.
        </p>
      ) : (
        <ul className="home-atividade-lista">
          {lista.map((venda) => {
            const info = rotuloCompraRecente(venda);
            const chave = `${venda.data}-${venda.numeroDcto || venda.cupom}`;
            return (
              <li
                key={chave}
                className={`home-atividade-item home-atividade-item--${info.tom}`}
              >
                <span className="home-atividade-item__icon" aria-hidden>
                  <IconShopping size={18} />
                </span>
                <span className="home-atividade-item__corpo">
                  <strong>{info.titulo}</strong>
                  <small>{info.meta}</small>
                </span>
                <time className="home-atividade-item__data">
                  {venda.dataLabel || venda.data}
                </time>
              </li>
            );
          })}
        </ul>
      )}

      {onCompras && (
        <button
          type="button"
          className="home-dash-card__link home-dash-card__link--block"
          onClick={onCompras}
        >
          Ver histórico completo →
        </button>
      )}
    </section>
  );
}

function HomeDicasClube({ onPerfil, onContato }) {
  const dicas = [
    {
      titulo: "CPF no caixa",
      texto: "Sempre informe o CPF cadastrado no clube para vincular suas compras.",
    },
    {
      titulo: "Dados atualizados",
      texto: "Revise perfil e contato para não perder comunicações do Superama+.",
    },
    {
      titulo: "Ofertas na loja",
      texto: "Fique de olho nas promoções exclusivas para membros do clube.",
    },
  ];

  return (
    <section className="home-dash-card home-dash-card--dicas" aria-label="Dicas do clube">
      <h3 className="home-dash-card__titulo">Dicas para você</h3>
      <ul className="home-dicas-lista">
        {dicas.map((dica) => (
          <li key={dica.titulo} className="home-dica-item">
            <strong>{dica.titulo}</strong>
            <p>{dica.texto}</p>
          </li>
        ))}
      </ul>
      <div className="home-dicas-acoes">
        {onPerfil && (
          <button type="button" className="home-dash-card__link" onClick={onPerfil}>
            Meu perfil
          </button>
        )}
        {onContato && (
          <button type="button" className="home-dash-card__link" onClick={onContato}>
            Meu contato
          </button>
        )}
      </div>
    </section>
  );
}

function HomeDescontosClube({ itens }) {
  const lista = Array.isArray(itens) ? itens.slice(0, 6) : [];

  return (
    <section className="home-dash-card home-dash-card--descontos" aria-label="Descontos do clube">
      <div className="home-descontos-badge">Clube Superama+</div>
      <div className="home-dash-card__head">
        <h3 className="home-dash-card__titulo">Descontos em produtos</h3>
        <span className="home-dash-card__periodo">Exclusivo para membros</span>
      </div>
      {lista.length === 0 ? (
        <p className="home-dash-card__vazio">
          Em breve vamos destacar aqui produtos com preço especial para membros do clube.
        </p>
      ) : (
        <ul className="home-descontos-lista">
          {lista.map((p) => (
            <li key={`${p.codigo}-${p.unidade}`} className="home-descontos-item">
              <div className="home-descontos-item__top">
                <strong className="home-descontos-item__nome">
                  {p.descricao || `Produto ${p.codigo}`}
                </strong>
                {p.marca && <span className="home-descontos-item__marca">{p.marca}</span>}
              </div>
              <div className="home-descontos-item__precos">
                <span className="home-descontos-item__preco1">{formatarMoeda(p.preco1)}</span>
                <span className="home-descontos-item__preco2">{formatarMoeda(p.preco2)}</span>
                {Number(p.economia) > 0 && (
                  <span className="home-descontos-item__eco">
                    economize {formatarMoeda(p.economia)}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function HomeOnboarding({ onCompras, pontosAtivo = true }) {
  if (!pontosAtivo) {
    return (
      <section className="home-onboarding" aria-label="Primeiros passos">
        <h3 className="home-onboarding__titulo">Bem-vindo ao clube</h3>
        <p className="home-onboarding__texto">
          Suas compras na loja com o CPF cadastrado aparecem em Minhas compras.
        </p>
        {onCompras && (
          <button type="button" className="home-btn home-btn--primary" onClick={onCompras}>
            Ver minhas compras
          </button>
        )}
      </section>
    );
  }

  return (
    <section className="home-onboarding" aria-label="Primeiros passos">
      <h3 className="home-onboarding__titulo">Comece a pontuar</h3>
      <p className="home-onboarding__texto">
        Faça sua primeira compra na loja com o CPF cadastrado no clube. Seus pontos
        aparecem aqui em poucos minutos.
      </p>
      <ol className="home-onboarding__passos">
        <li>
          <span className="home-onboarding__num">1</span>
          <span>Cadastro no clube</span>
        </li>
        <li>
          <span className="home-onboarding__num">2</span>
          <span>Compra com CPF no caixa</span>
        </li>
        <li>
          <span className="home-onboarding__num">3</span>
          <span>Pontos e prêmios liberados</span>
        </li>
      </ol>
      {onCompras && (
        <button type="button" className="home-btn home-btn--primary" onClick={onCompras}>
          Ver minhas compras
        </button>
      )}
    </section>
  );
}

function HomeProximoPremio({ premio, saldo, podeResgatar, onPremios }) {
  if (!premio) {
    return (
      <section className="home-dash-card home-dash-card--premio">
        <h3 className="home-dash-card__titulo">Prêmios</h3>
        <p className="home-dash-card__vazio">
          Em breve teremos brindes disponíveis para você resgatar.
        </p>
      </section>
    );
  }

  const img = resolveImagemUrl(premio.imagemUrl);
  const faltam = Math.max(0, Number(premio.pontos) - saldo);

  return (
    <section className="home-dash-card home-dash-card--premio">
      <h3 className="home-dash-card__titulo">
        {podeResgatar ? "Prêmio disponível" : "Próximo prêmio"}
      </h3>
      <div className="home-premio-preview">
        <div className="home-premio-preview__media">
          {img ? (
            <img src={img} alt="" />
          ) : (
            <IconGift size={28} />
          )}
        </div>
        <div className="home-premio-preview__corpo">
          <p className="home-premio-preview__nome">{premio.nome}</p>
          <p className="home-premio-preview__pts">{premio.pontos} pontos</p>
          {!podeResgatar && (
            <ProgressBar
              variant="premio"
              value={saldo}
              max={premio.pontos}
              label={`${saldo} de ${premio.pontos} pts`}
              hint={`Faltam ${faltam}`}
            />
          )}
          {podeResgatar && (
            <p className="home-premio-preview__ok">Você já pode resgatar na loja!</p>
          )}
        </div>
      </div>
      {onPremios && (
        <button type="button" className="home-dash-card__link" onClick={onPremios}>
          Ver todos os prêmios →
        </button>
      )}
    </section>
  );
}

function HomeAtividade({ itens, onPontos, onCompras, pontosAtivo = true }) {
  const lista = (itens || []).slice(0, 4);

  return (
    <section className="home-dash-card home-dash-card--atividade">
      <div className="home-dash-card__head">
        <h3 className="home-dash-card__titulo">Sua atividade recente</h3>
        {pontosAtivo && onPontos && (
          <button type="button" className="home-dash-card__link" onClick={onPontos}>
            Ver tudo
          </button>
        )}
      </div>

      {lista.length === 0 ? (
        <p className="home-dash-card__vazio">
          {pontosAtivo
            ? "Nenhuma movimentação ainda. Suas compras e resgates aparecerão aqui."
            : "Consulte o histórico completo das suas compras na aba Minhas compras."}
        </p>
      ) : (
        <ul className="home-atividade-lista">
          {lista.map((item) => {
            const info = rotuloAtividade(item);
            return (
              <li key={item.id} className={`home-atividade-item home-atividade-item--${info.tom}`}>
                <span className="home-atividade-item__icon" aria-hidden>
                  {info.icon}
                </span>
                <span className="home-atividade-item__corpo">
                  <strong>{info.titulo}</strong>
                  <small>{info.meta}</small>
                </span>
                <time className="home-atividade-item__data">
                  {formatarDataAtividade(item)}
                </time>
              </li>
            );
          })}
        </ul>
      )}

      {onCompras && (lista.length > 0 || !pontosAtivo) && (
        <button type="button" className="home-dash-card__link home-dash-card__link--block" onClick={onCompras}>
          Ver minhas compras →
        </button>
      )}
    </section>
  );
}

function HomeContaChip({ perfil, clube, cuponsProcessados }) {
  const [copiado, setCopiado] = useState(false);

  async function copiarNumero() {
    if (!perfil?.codigoCliente) return;
    try {
      await navigator.clipboard.writeText(String(perfil.codigoCliente));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <section className="home-dash-card home-dash-card--conta" aria-label="Resumo da conta">
      <div className="home-conta-stat">
        <span className="home-conta-stat__val">{clube?.nivel || "Clube"}</span>
        <span className="home-conta-stat__lbl">Seu clube</span>
      </div>
      {cuponsProcessados != null && (
        <div className="home-conta-stat">
          <span className="home-conta-stat__val">{cuponsProcessados}</span>
          <span className="home-conta-stat__lbl">Cupons pontuados</span>
        </div>
      )}
      {perfil?.codigoCliente && (
        <button type="button" className="home-conta-numero" onClick={copiarNumero}>
          <span className="home-conta-stat__lbl">Seu número no clube</span>
          <span className="home-conta-numero__val">{perfil.codigoCliente}</span>
          <span className="home-conta-numero__hint">
            {copiado ? "Copiado!" : "Clique para copiar"}
          </span>
        </button>
      )}
    </section>
  );
}

function HomePainelPontos({
  saldo,
  progressoPontos,
  onPremios,
  onPontos,
  compact = false,
}) {
  return (
    <section
      className={`home-pontos-card${compact ? " home-pontos-card--inline" : ""}`}
      aria-label="Seus pontos"
    >
      <div className="home-pontos-card__top">
        <div>
          <p className="home-pontos-card__label">Seu saldo</p>
          <div className="home-pontos-card__saldo-wrap">
            <span className="home-pontos-card__saldo">
              <AnimatedNumber value={saldo} />
            </span>
            <small>pts</small>
          </div>
        </div>
        <span className="home-pontos-card__star" aria-hidden>
          <IconStar size={22} filled />
        </span>
      </div>

      <ProgressBar
        variant="gold"
        value={REAIS_POR_PONTO - progressoPontos.falta}
        max={REAIS_POR_PONTO}
        label={`${formatarMoeda(progressoPontos.valorPendente)} de ${formatarMoeda(REAIS_POR_PONTO)}`}
        hint={
          progressoPontos.falta > 0
            ? `Faltam ${formatarMoeda(progressoPontos.falta)} para +1 pt`
            : "Próximo ponto quase garantido!"
        }
      />

      <div className="home-pontos-card__actions">
        {onPremios && (
          <button
            type="button"
            className="home-pontos-card__cta home-pontos-card__cta--primary"
            onClick={onPremios}
          >
            Trocar prêmios
          </button>
        )}
        {onPontos && (
          <button
            type="button"
            className="home-pontos-card__cta home-pontos-card__cta--ghost"
            onClick={onPontos}
          >
            Ver histórico
          </button>
        )}
      </div>
    </section>
  );
}

export default function HomePage({
  pontosAtivo = true,
  onLogout,
  onCompras,
  onPremios,
  onPontos,
  onPerfil,
  onContato,
  onRegulamento,
  onPrivacidade,
}) {
  const [loading, setLoading] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [error, setError] = useState("");
  const [dados, setDados] = useState(null);
  const [videoHome, setVideoHome] = useState(null);
  const [descontosClube, setDescontosClube] = useState([]);

  const carregar = useCallback(async ({ silencioso = false } = {}) => {
    if (silencioso) {
      setAtualizando(true);
    } else {
      setLoading(true);
    }
    setError("");

    try {
      const perfilRes = await fetchAutenticado("/api/cliente/me");
      const conteudoRes = await fetchAutenticado("/api/cliente/conteudo");
      setVideoHome(conteudoRes.videoHome ?? null);

      // Em modo sem pontos, substitui os avisos por vitrine de descontos.
      if (!pontosAtivo) {
        try {
          const descRes = await fetchAutenticado(
            "/api/cliente/clube-descontos/produtos?limite=6"
          );
          setDescontosClube(descRes.itens ?? []);
        } catch {
          setDescontosClube([]);
        }
      } else {
        setDescontosClube([]);
      }

      if (pontosAtivo) {
        const [historicoRes, brindesRes, vendasRes] = await Promise.all([
          fetchAutenticado("/api/cliente/pontos/historico"),
          fetchAutenticado("/api/cliente/brindes"),
          buscarVendasInsights(),
        ]);

        setDados({
          ...perfilRes,
          ...montarDadosVendas(vendasRes),
          saldo: historicoRes.saldo,
          valorPendente: historicoRes.valorPendente,
          faltaParaProximoPonto: historicoRes.faltaParaProximoPonto,
          dataInicioPlataforma: historicoRes.dataInicioPlataforma,
          timeline: historicoRes.timeline ?? [],
          resumo: historicoRes.resumo,
          brindes: brindesRes.brindes ?? [],
          cuponsProcessados: historicoRes.resumo?.totalCompras ?? 0,
        });
      } else {
        const vendasRes = await buscarVendasInsights();

        setDados({
          ...perfilRes,
          ...montarDadosVendas(vendasRes),
          saldo: 0,
          valorPendente: 0,
          faltaParaProximoPonto: 0,
          timeline: [],
          resumo: null,
          brindes: [],
          cuponsProcessados: 0,
        });
      }
    } catch (err) {
      if (err.code === "UNAUTHORIZED") {
        onLogout();
        return;
      }
      setError(mensagemParaUsuario(err.message));
    } finally {
      setLoading(false);
      setAtualizando(false);
    }
  }, [onLogout, pontosAtivo]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const atualizarSilencioso = useCallback(
    () => carregar({ silencioso: true }),
    [carregar]
  );

  const verComprasDia = useCallback(
    (data) => {
      definirIntentCompras(intentComprasDia(data));
      onCompras?.();
    },
    [onCompras]
  );

  const verComprasMes = useCallback(
    (mes, ano) => {
      const periodo = periodoDoMes(mes, ano);
      definirIntentCompras({
        filtro: "custom",
        dataini: periodo.dataini,
        datafim: periodo.datafim,
      });
      onCompras?.();
    },
    [onCompras]
  );

  const propsInsights = {
    porData: dados?.vendasPorData,
    onVerComprasDia: verComprasDia,
    onVerComprasMes: verComprasMes,
    onVerCompras: onCompras,
  };

  const recarregarBrindes = useCallback(async () => {
    if (!pontosAtivo) return;
    try {
      const brindesRes = await fetchAutenticado("/api/cliente/brindes");
      setDados((prev) => {
        if (!prev) return prev;
        return { ...prev, brindes: brindesRes.brindes ?? [] };
      });
    } catch {
      // mantém catálogo atual em falha silenciosa
    }
  }, [pontosAtivo]);

  useRefetchOnVisible(recarregarBrindes, Boolean(dados) && pontosAtivo);

  function handleSair() {
    clearSession();
    onLogout();
  }

  const progressoPontos = useMemo(() => {
    const valorPendente = Number(dados?.valorPendente) || 0;
    const falta = Number(dados?.faltaParaProximoPonto);
    const faltaCalc =
      falta > 0 ? falta : Math.max(0, REAIS_POR_PONTO - valorPendente);
    return { valorPendente, falta: faltaCalc };
  }, [dados]);

  const proximoPremio = useMemo(
    () => escolherProximoPremio(dados?.brindes, dados?.saldo ?? 0),
    [dados]
  );

  if (loading) {
    return (
      <div className="home-app">
        <div className="home-loading home-loading--dashboard">
          <Logo variant="compact" className="home-loading__logo" />
          <div className="home-skeleton-dashboard" aria-hidden>
            <div className="home-skeleton-dashboard__hero" />
            <div className="home-skeleton-dashboard__grid">
              <div />
              <div />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="home-app">
        <div className="home-error">
          <Logo variant="compact" className="home-error__logo" />
          <p>{error}</p>
          <button type="button" className="home-btn home-btn--primary" onClick={carregar}>
            Tentar novamente
          </button>
          <button type="button" className="home-btn home-btn--ghost" onClick={handleSair}>
            Sair
          </button>
        </div>
      </div>
    );
  }

  const { perfil, clube } = dados;
  const primeiroNome = perfil.nome?.split(" ")[0] || "Cliente";
  const saldoPontos = dados?.saldo ?? 0;
  const membroDesde = formatarMembroDesde(dados?.dataInicioPlataforma);
  const temComprasRecentes = (dados?.comprasRecentes?.length ?? 0) > 0;
  const clienteNovo = pontosAtivo
    ? saldoPontos === 0 && (dados?.timeline?.length ?? 0) === 0
    : !temComprasRecentes;
  const periodoComprasLabel = dados?.comprasPeriodoLabel || "Este mês";

  return (
    <div className="home-app">
      <PullToRefresh onRefresh={atualizarSilencioso} disabled={loading || atualizando}>
        <header className="home-header home-header--dashboard">
          <div className="home-header__brand">
            <div className="home-header__mobile-brand">
              <Logo variant="header" />
              <span className="home-header__tag">Área do cliente</span>
            </div>
            <div className="home-header__desktop-brand">
              <Logo variant="header" className="home-header__logo" />
              <div className="home-header__brand-text">
                <span className="home-header__brand-title">Área do cliente</span>
                <span className="home-header__brand-sub">Clube Superama+</span>
              </div>
            </div>
          </div>
          <div className="home-header__actions">
            {onPerfil ? (
              <button
                type="button"
                className="home-header__desktop-user"
                onClick={onPerfil}
                aria-label="Meu perfil"
              >
                <span className="home-header__desktop-avatar" aria-hidden>
                  {iniciaisDoNome(perfil.nome)}
                </span>
                <div className="home-header__desktop-user-text">
                  <p className="home-header__desktop-nome">{perfil.nome || primeiroNome}</p>
                  {membroDesde && (
                    <p className="home-header__desktop-meta">Membro desde {membroDesde}</p>
                  )}
                </div>
              </button>
            ) : (
              <div className="home-header__desktop-user home-header__desktop-user--static">
                <span className="home-header__desktop-avatar" aria-hidden>
                  {iniciaisDoNome(perfil.nome)}
                </span>
                <div className="home-header__desktop-user-text">
                  <p className="home-header__desktop-nome">{perfil.nome || primeiroNome}</p>
                  {membroDesde && (
                    <p className="home-header__desktop-meta">Membro desde {membroDesde}</p>
                  )}
                </div>
              </div>
            )}
            <button type="button" className="home-header__sair" onClick={handleSair}>
              Sair
            </button>
          </div>
        </header>

        {/* ——— Mobile ——— */}
        <div
          className={`home-layout-mobile${!pontosAtivo ? " home-layout-mobile--sem-pontos" : ""}`}
        >
          <section className="home-hero home-hero--rich">
            <div className="home-hero__avatar home-hero__avatar--iniciais" aria-hidden>
              {iniciaisDoNome(perfil.nome)}
            </div>
            <div className="home-hero__text">
              <p className="home-hero__ola">Olá,</p>
              <h1 className="home-hero__nome">{primeiroNome}</h1>
              <p className="home-hero__sub">Membro do Clube Superama+</p>
            </div>
            {membroDesde && (
              <div className="home-hero__badge home-hero__badge--membro">
                Cliente desde {membroDesde}
              </div>
            )}
          </section>

          <div className={`home-stats home-stats--rich${!pontosAtivo ? " home-stats--sem-pontos" : ""}`}>
            {pontosAtivo ? (
              <HomePainelPontos
                saldo={saldoPontos}
                progressoPontos={progressoPontos}
                onPremios={onPremios}
                onPontos={onPontos}
              />
            ) : (
              <HomePainelCompras
                resumo={dados.comprasResumo}
                periodoLabel={periodoComprasLabel}
                onCompras={onCompras}
              />
            )}
            <div className="home-stat">
              <span className="home-stat__value">{clube.nivel}</span>
              <span className="home-stat__label">Seu clube</span>
            </div>
            {perfil.codigoCliente && (
              <div className="home-stat">
                <span className="home-stat__value">{perfil.codigoCliente}</span>
                <span className="home-stat__label">Seu número</span>
              </div>
            )}
          </div>

          {dados.vendasPorData && (
            <div
              className={`home-insights-slot home-insights-slot--mobile${
                atualizando ? " home-insights-slot--atualizando" : ""
              }`}
            >
              <ClienteInsightsPanel
                {...propsInsights}
                className={atualizando ? "cinsights--atualizando" : ""}
              />
            </div>
          )}

          {pontosAtivo && videoHome && (
            <div className="home-video-slot home-video-slot--mobile">
              <HomeVideoCard video={videoHome} />
            </div>
          )}

          <main className="home-main">
            {pontosAtivo ? (
              <div className="home-grid">
                <nav className="home-menu" aria-label="Área do cliente">
                  <h2 className="home-menu__titulo">Acesso rápido</h2>
                  {onPremios && (
                    <MenuCta
                      variant="primary"
                      icon={<IconGift />}
                      title="Prêmios"
                      subtitle="Troque seus pontos por brindes"
                      onClick={onPremios}
                    />
                  )}
                  {onCompras && (
                    <MenuCta
                      icon={<IconCart />}
                      title="Minhas compras"
                      subtitle="Cupons e itens por período"
                      onClick={onCompras}
                    />
                  )}
                  {onPontos && (
                    <MenuCta
                      icon={<IconStar />}
                      title="Meus pontos"
                      subtitle="Histórico de compras e resgates"
                      onClick={onPontos}
                    />
                  )}
                  {onPerfil && (
                    <MenuCta
                      icon={<IconUser />}
                      title="Meu perfil"
                      subtitle="Nome, CPF e dados pessoais"
                      onClick={onPerfil}
                    />
                  )}
                  {onContato && (
                    <MenuCta
                      icon={<IconContact />}
                      title="Meu contato"
                      subtitle="E-mail, telefone e endereço"
                      onClick={onContato}
                    />
                  )}
                </nav>

                <div className="home-side-stack">
                  <RegrasPontos compact />
                  <HomeBeneficiosSection pontosAtivo />
                </div>
              </div>
            ) : (
              <div
                className={`home-mobile-sem-pontos${atualizando ? " home-mobile-sem-pontos--atualizando" : ""}`}
              >
                {atualizando && (
                  <p className="home-mobile-atualizando" role="status">
                    Atualizando compras…
                  </p>
                )}

                {clienteNovo ? (
                  <HomeOnboarding onCompras={onCompras} pontosAtivo={false} />
                ) : (
                  <HomeComprasRecentes
                    compras={dados.comprasRecentes}
                    onCompras={onCompras}
                    periodoLabel={periodoComprasLabel}
                  />
                )}

                {videoHome && <HomeVideoCard video={videoHome} />}

                <nav className="home-menu home-menu--sem-pontos" aria-label="Área do cliente">
                  <h2 className="home-menu__titulo">Acesso rápido</h2>
                  {onCompras && (
                    <MenuCta
                      variant="primary"
                      icon={<IconCart />}
                      title="Minhas compras"
                      subtitle="Cupons e itens por período"
                      onClick={onCompras}
                    />
                  )}
                  {onPerfil && (
                    <MenuCta
                      icon={<IconUser />}
                      title="Meu perfil"
                      subtitle="Nome, CPF e dados pessoais"
                      onClick={onPerfil}
                    />
                  )}
                  {onContato && (
                    <MenuCta
                      icon={<IconContact />}
                      title="Meu contato"
                      subtitle="E-mail, telefone e endereço"
                      onClick={onContato}
                    />
                  )}
                </nav>

                <div className="home-mobile-pausa">
                  <HomeDescontosClube itens={descontosClube} />
                </div>

                <HomeBeneficiosSection pontosAtivo={false} />

                <div className="home-side-card home-side-card--faq">
                  <HomeFaq pontosAtivo={false} />
                </div>
              </div>
            )}
          </main>
        </div>

        {/* ——— Desktop dashboard ——— */}
        <div className="home-layout-desktop">
          <section className="home-desk-hero" aria-label="Resumo da sua conta">
            <div className="home-desk-hero__intro">
              <p className="home-desk-hero__eyebrow">Painel do clube</p>
              <h1 className="home-desk-hero__title">
                Olá, <span>{primeiroNome}</span>
              </h1>
            </div>

            <div className="home-desk-hero__metrics">
              {pontosAtivo ? (
                <div className="home-desk-hero__saldo">
                  <HomePainelPontos
                    saldo={saldoPontos}
                    progressoPontos={progressoPontos}
                    onPremios={onPremios}
                    onPontos={onPontos}
                    compact
                  />
                </div>
              ) : (
                <div className="home-desk-hero__saldo">
                  <HomePainelCompras
                    resumo={dados.comprasResumo}
                    periodoLabel={periodoComprasLabel}
                    onCompras={onCompras}
                    compact
                  />
                </div>
              )}
              <div className="home-desk-hero__stats">
                <HomeDeskStatCard label="Seu clube" value={clube.nivel} />
                {pontosAtivo && dados.cuponsProcessados != null && (
                  <HomeDeskStatCard
                    label="Cupons pontuados"
                    value={dados.cuponsProcessados}
                  />
                )}
                {!pontosAtivo && dados.comprasResumo && (
                  <>
                    <HomeDeskStatCard
                      label="Cupons no mês"
                      value={dados.comprasResumo.totalVendasAtivas ?? 0}
                    />
                    {(dados.comprasResumo.totalDescontos ?? 0) > 0 && (
                      <HomeDeskStatCard
                        label="Descontos no mês"
                        value={formatarMoeda(dados.comprasResumo.totalDescontos)}
                      />
                    )}
                  </>
                )}
                {perfil.codigoCliente && (
                  <HomeDeskStatCard
                    label="Número no clube"
                    value={perfil.codigoCliente}
                    copyable
                  />
                )}
              </div>
            </div>
          </section>

          <HomeDeskQuickNav
            onPremios={onPremios}
            onCompras={onCompras}
            onPontos={onPontos}
            onPerfil={onPerfil}
            onContato={onContato}
            pontosAtivo={pontosAtivo}
          />

          {dados.vendasPorData && (
            <div className="home-insights-slot home-insights-slot--desktop">
              <ClienteInsightsPanel
                {...propsInsights}
              />
            </div>
          )}

          <div className="home-desk-grid">
            <div className="home-desk-main">
              {clienteNovo ? (
                <HomeOnboarding onCompras={onCompras} pontosAtivo={pontosAtivo} />
              ) : pontosAtivo ? (
                <HomeAtividade
                  itens={dados.timeline}
                  onPontos={onPontos}
                  onCompras={onCompras}
                  pontosAtivo={pontosAtivo}
                />
              ) : (
                <HomeComprasRecentes
                  compras={dados.comprasRecentes}
                  onCompras={onCompras}
                  periodoLabel={periodoComprasLabel}
                />
              )}
              {videoHome && <HomeVideoCard video={videoHome} />}
              <HomeBeneficiosSection variant="desk" pontosAtivo={pontosAtivo} />
            </div>

            <aside className="home-desk-aside">
              {pontosAtivo && (
                <HomeProximoPremio
                  premio={proximoPremio?.premio}
                  saldo={saldoPontos}
                  podeResgatar={proximoPremio?.podeResgatar}
                  onPremios={onPremios}
                />
              )}
              {pontosAtivo && (
                <div className="home-desk-aside-card home-desk-aside-card--rules">
                  <RegrasPontos compact />
                </div>
              )}
              {pontosAtivo && (
                <div className="home-desk-aside-card home-desk-aside-card--faq">
                  <HomeFaq pontosAtivo />
                </div>
              )}
              {!pontosAtivo && (
                <div className="home-desk-aside-card home-desk-aside-card--pausa">
                  <HomeDescontosClube itens={descontosClube} />
                </div>
              )}
              {!pontosAtivo && (
                <div className="home-desk-aside-card home-desk-aside-card--dicas">
                  <HomeDicasClube onPerfil={onPerfil} onContato={onContato} />
                </div>
              )}
              {!pontosAtivo && (
                <div className="home-desk-aside-card home-desk-aside-card--faq">
                  <HomeFaq pontosAtivo={false} />
                </div>
              )}
            </aside>
          </div>
        </div>

        <footer className="home-legal-footer">
          {onRegulamento && (
            <button type="button" className="home-legal-footer__link" onClick={onRegulamento}>
              Regulamento
            </button>
          )}
          {onPrivacidade && (
            <button type="button" className="home-legal-footer__link" onClick={onPrivacidade}>
              Privacidade
            </button>
          )}
          <MetajiCredit className="metaji-credit--home" />
        </footer>
      </PullToRefresh>
    </div>
  );
}
