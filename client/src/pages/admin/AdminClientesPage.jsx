import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Search,
  UserPlus,
  TrendingUp,
  Clock,
  Gift,
  Timer,
  Wallet,
  Users,
  ChevronRight,
  Loader2,
  ShoppingBag,
  Target,
  ScanLine,
  X,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Hash,
  User,
  Activity,
  ShieldCheck,
  FileText,
  Package,
  Award,
  AlertCircle,
  Sparkles,
  Receipt,
} from "lucide-react";
import AdminLayout from "../../components/admin/AdminLayout.jsx";
import AdminProgramaBanner from "../../components/admin/AdminProgramaBanner.jsx";
import { formatarCpfCnpj, cpfValido } from "../../utils/cpf.js";
import { clearAdminSession, fetchAdmin } from "../../utils/adminSession.js";
import { formatarMoeda } from "../../utils/moeda.js";
import { mensagemParaUsuario } from "../../utils/mensagensUsuario.js";
import { navegarAdminComQuery, adminQueryFromHash } from "../../utils/adminHash.js";
import { formatarReaisNivel } from "../../utils/nivelClube.js";
import { NivelIcon } from "../../components/NivelBadge.jsx";
import "../../styles/nivel-badge.css";

const OPCOES_PERIODO = [
  { dias: 7, label: "7 dias" },
  { dias: 30, label: "30 dias" },
  { dias: 90, label: "90 dias" },
];

const GRUPOS_SEGMENTOS = [
  {
    titulo: "Conversão",
    itens: [
      {
        id: "compramForaDoClube",
        label: "Fora do clube",
        hint: "Compram no caixa sem cadastro",
        Icon: UserPlus,
        tom: "prospect",
      },
    ],
  },
  {
    titulo: "Membros",
    itens: [
      {
        id: "maioresCompradores",
        label: "Maiores compradores",
        hint: "Maior gasto no período",
        Icon: TrendingUp,
        tom: "membro",
      },
      {
        id: "inativos",
        label: "Inativos (+60d)",
        hint: "Sem compra há mais de 60 dias",
        Icon: Clock,
        tom: "alerta",
      },
    ],
  },
  {
    titulo: "Pontos e prêmios",
    itens: [
      {
        id: "pertoDoPremio",
        label: "Perto do prêmio",
        hint: "Quase atingem o brinde",
        Icon: Gift,
        tom: "premio",
      },
      {
        id: "pontosExpirando",
        label: "Pontos expirando",
        hint: "Vencem em até 60 dias",
        Icon: Timer,
        tom: "alerta",
      },
      {
        id: "comPontosSemResgate",
        label: "Sem resgate",
        hint: "Saldo alto, nunca resgatou",
        Icon: Wallet,
        tom: "pontos",
      },
    ],
  },
];

const SEGMENTOS = GRUPOS_SEGMENTOS.flatMap((g) => g.itens);

const PONTOS_SEGMENTO_IDS = new Set([
  "pertoDoPremio",
  "pontosExpirando",
  "comPontosSemResgate",
]);

function formatarDataHora(valor) {
  if (!valor) return "—";
  try {
    return new Date(valor).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function formatarData(valor) {
  if (!valor) return "—";
  try {
    return new Date(valor).toLocaleDateString("pt-BR");
  } catch {
    return String(valor);
  }
}

function textoDiasSemCompra(dias) {
  if (dias == null) return "Sem compra no período";
  if (dias === 0) return "Comprou hoje";
  if (dias === 1) return "1 dia sem comprar";
  return `${dias} dias sem comprar`;
}

function formatarTelefone(valor) {
  if (!valor) return "—";
  const d = String(valor).replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return valor;
}

function formatarDataNascimento(valor) {
  if (!valor) return "—";
  const s = String(valor).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return s;
}

function FichaDetalheLinha({ Icon, rotulo, valor, multiline }) {
  return (
    <div className="admin-crm-ficha-v2__linha">
      <span className="admin-crm-ficha-v2__linha-icon" aria-hidden>
        <Icon size={15} />
      </span>
      <div className={multiline ? "admin-crm-ficha-v2__linha--multi" : ""}>
        <span className="admin-crm-ficha-v2__linha-rotulo">{rotulo}</span>
        <strong>{valor || "—"}</strong>
      </div>
    </div>
  );
}

function iniciaisNome(nome) {
  if (!nome) return "?";
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return `${partes[0][0]}${partes[partes.length - 1][0]}`.toUpperCase();
}

function metricasItem(item, segmentoId) {
  const chips = [];

  if (item.totalGasto > 0) {
    chips.push({
      key: "gasto",
      label: formatarMoeda(item.totalGasto),
      tom: "verde",
    });
    if (item.quantidadeCupons > 0) {
      chips.push({
        key: "cupons",
        label: `${item.quantidadeCupons} cupom${item.quantidadeCupons === 1 ? "" : "s"}`,
        tom: "neutro",
      });
    }
  }

  if (segmentoId === "inativos") {
    chips.push({
      key: "inativo",
      label: textoDiasSemCompra(item.diasSemCompra),
      tom: "alerta",
    });
    if (item.ultimaCompra) {
      chips.push({
        key: "ultima",
        label: `Última ${formatarData(item.ultimaCompra)}`,
        tom: "neutro",
      });
    }
  }

  if (segmentoId === "pertoDoPremio" && item.faltamPontos != null) {
    chips.push({
      key: "faltam",
      label: `Faltam ${item.faltamPontos} pts`,
      tom: "premio",
    });
    if (item.brindeNome) {
      chips.push({ key: "brinde", label: item.brindeNome, tom: "neutro" });
    }
  }

  if (segmentoId === "pontosExpirando" && item.proximaExpiracao) {
    chips.push({
      key: "expira",
      label: `${item.pontosExpirando} pts · ${formatarData(item.proximaExpiracao)}`,
      tom: "alerta",
    });
    if (item.valorExpirando > 0) {
      chips.push({
        key: "valor",
        label: `~${formatarMoeda(item.valorExpirando)}`,
        tom: "neutro",
      });
    }
  }

  if (segmentoId === "comPontosSemResgate" && item.saldoPontos != null) {
    chips.push({
      key: "saldo",
      label: `${item.saldoPontos} pts`,
      tom: "pontos",
    });
    if (item.diasSemCompra != null && item.diasSemCompra <= 7) {
      chips.push({ key: "recente", label: "Comprou recente", tom: "verde" });
    }
  }

  if (segmentoId === "compramForaDoClube" && item.ultimaCompra) {
    chips.push({
      key: "ultima",
      label: `Última ${formatarData(item.ultimaCompra)}`,
      tom: "neutro",
    });
  }

  if (segmentoId === "maioresCompradores" && item.saldoPontos != null) {
    chips.push({
      key: "pts",
      label: `${item.saldoPontos} pts`,
      tom: "pontos",
    });
  }

  if (
    item.saldoPontos > 0 &&
    !chips.some((c) => c.key === "pts" || c.key === "saldo") &&
    !item.foraDoClube
  ) {
    chips.push({
      key: "pts",
      label: `${item.saldoPontos} pts`,
      tom: "pontos",
    });
  }

  if (item.foraDoClube) {
    chips.unshift({ key: "fora", label: "Fora do clube", tom: "prospect" });
  }

  return chips;
}

function valorDestaqueItem(item, segmentoId) {
  if (item.totalGasto > 0) return formatarMoeda(item.totalGasto);
  if (segmentoId === "pertoDoPremio" && item.faltamPontos != null) {
    return `Faltam ${item.faltamPontos} pts`;
  }
  if (segmentoId === "pontosExpirando" && item.pontosExpirando > 0) {
    return `${item.pontosExpirando} pts`;
  }
  if (segmentoId === "comPontosSemResgate" && item.saldoPontos != null) {
    return `${item.saldoPontos} pts`;
  }
  if (item.saldoPontos > 0) return `${item.saldoPontos} pts`;
  return null;
}

function BuscaClientesResultados({ resultados, loading, onSelecionar, termo }) {
  if (loading) {
    return (
      <div className="admin-crm-busca-resultados admin-crm-busca-resultados--loading">
        <Loader2 size={18} className="admin-crm-loading__spinner admin-crm-loading__spinner--icon" aria-hidden />
        <span>Buscando “{termo}”…</span>
      </div>
    );
  }

  if (!resultados?.length) return null;

  return (
    <div className="admin-crm-busca-resultados" role="listbox" aria-label="Resultados da busca">
      <p className="admin-crm-busca-resultados__titulo">
        {resultados.length} resultado{resultados.length === 1 ? "" : "s"} — clique para abrir a ficha
      </p>
      <ul>
        {resultados.map((item) => (
          <li key={item.cpf}>
            <button
              type="button"
              className="admin-crm-busca-resultados__item"
              onClick={() => onSelecionar(item.cpf)}
            >
              <span className="admin-crm-busca-resultados__nome">
                {item.nome || formatarCpfCnpj(item.cpf)}
              </span>
              <span className="admin-crm-busca-resultados__meta">
                {formatarCpfCnpj(item.cpf)}
                {item.clienteCodigo && <> · Cód. {item.clienteCodigo}</>}
                {item.noClube ? (
                  <span className="admin-crm-badge admin-crm-badge--warn">Fora do clube</span>
                ) : (
                  <span className="admin-crm-badge admin-crm-badge--ok">Membro</span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ClienteListaItem({ item, onSelecionar, ativo, segmentoId, indice }) {
  const nomeExibicao =
    item.nome ||
    (item.foraDoClube ? formatarCpfCnpj(item.cpf) : "Sem nome");
  const chips = metricasItem(item, segmentoId);
  const destaque = valorDestaqueItem(item, segmentoId);

  return (
    <button
      type="button"
      className={`admin-crm-card${ativo ? " admin-crm-card--ativo" : ""}${item.foraDoClube ? " admin-crm-card--prospect" : ""}`}
      onClick={() => onSelecionar(item.cpf)}
    >
      <span className="admin-crm-card__rank" aria-hidden>
        {indice + 1}
      </span>
      <span
        className={`admin-crm-card__avatar${item.foraDoClube ? " admin-crm-card__avatar--prospect" : ""}`}
        aria-hidden
      >
        {iniciaisNome(nomeExibicao)}
      </span>
      <span className="admin-crm-card__body">
        <span className="admin-crm-card__nome">{nomeExibicao}</span>
        <span className="admin-crm-card__cpf">{formatarCpfCnpj(item.cpf)}</span>
        {chips.length > 0 && (
          <span className="admin-crm-card__chips">
            {chips.slice(0, 3).map((chip) => (
              <span
                key={chip.key}
                className={`admin-crm-chip admin-crm-chip--${chip.tom}`}
              >
                {chip.label}
              </span>
            ))}
          </span>
        )}
      </span>
      {destaque && <span className="admin-crm-card__valor">{destaque}</span>}
      <ChevronRight size={16} className="admin-crm-card__chevron" aria-hidden />
    </button>
  );
}

function SegmentosNav({ grupos, segmentoAtivo, contagens, onSelecionar, horizontal = false }) {
  return (
    <nav
      className={`admin-crm-seg-nav${horizontal ? " admin-crm-seg-nav--horizontal" : ""}`}
      aria-label="Listas inteligentes"
    >
      {grupos.map((grupo) => (
        <div key={grupo.titulo} className="admin-crm-seg-grupo">
          <p className="admin-crm-seg-grupo__titulo">{grupo.titulo}</p>
          <ul className="admin-crm-seg-grupo__lista" role="tablist">
            {grupo.itens.map((seg) => {
              const total = contagens?.[seg.id];
              const ativo = segmentoAtivo === seg.id;
              const Icon = seg.Icon;
              return (
                <li key={seg.id}>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={ativo}
                    title={seg.hint}
                    className={`admin-crm-seg-opt admin-crm-seg-opt--${seg.tom}${ativo ? " admin-crm-seg-opt--ativo" : ""}`}
                    onClick={() => onSelecionar(seg.id)}
                  >
                    <span className="admin-crm-seg-opt__icon" aria-hidden>
                      <Icon size={15} strokeWidth={2.25} />
                    </span>
                    <span className="admin-crm-seg-opt__texto">
                      <strong>{seg.label}</strong>
                      {!horizontal && <small>{seg.hint}</small>}
                    </span>
                    {total != null && (
                      <span className="admin-crm-seg-opt__count">{total}</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function ClienteListaTabela({ items, segmentoId, cpfSelecionado, onSelecionar }) {
  return (
    <div className="admin-crm-table-wrap">
      <table className="admin-crm-table">
        <thead>
          <tr>
            <th className="admin-crm-table__col-rank">#</th>
            <th>Cliente</th>
            <th>CPF</th>
            <th>Indicadores</th>
            <th className="admin-crm-table__col-valor">Valor / pts</th>
            <th className="admin-crm-table__col-acao" aria-hidden />
          </tr>
        </thead>
        <tbody>
          {items.map((item, indice) => {
            const nomeExibicao =
              item.nome || (item.foraDoClube ? "Comprador no caixa" : "Sem nome");
            const chips = metricasItem(item, segmentoId);
            const destaque = valorDestaqueItem(item, segmentoId);
            const ativo = cpfSelecionado === item.cpf;

            return (
              <tr
                key={item.cpf}
                className={`admin-crm-table__row${ativo ? " admin-crm-table__row--ativo" : ""}${item.foraDoClube ? " admin-crm-table__row--prospect" : ""}`}
                onClick={() => onSelecionar(item.cpf)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelecionar(item.cpf);
                  }
                }}
                tabIndex={0}
                role="button"
              >
                <td className="admin-crm-table__col-rank">{indice + 1}</td>
                <td>
                  <span className="admin-crm-table__nome">{nomeExibicao}</span>
                </td>
                <td className="admin-crm-table__cpf">{formatarCpfCnpj(item.cpf)}</td>
                <td>
                  <span className="admin-crm-card__chips">
                    {chips.slice(0, 4).map((chip) => (
                      <span
                        key={chip.key}
                        className={`admin-crm-chip admin-crm-chip--${chip.tom}`}
                      >
                        {chip.label}
                      </span>
                    ))}
                  </span>
                </td>
                <td className="admin-crm-table__col-valor">
                  {destaque || "—"}
                </td>
                <td className="admin-crm-table__col-acao">
                  <ChevronRight size={16} aria-hidden />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ClienteListaResultados({
  items,
  segmentoId,
  cpfSelecionado,
  onSelecionar,
}) {
  return (
    <>
      <div className="admin-crm-lista__cards">
        {items.map((item, indice) => (
          <ClienteListaItem
            key={item.cpf}
            item={item}
            indice={indice}
            segmentoId={segmentoId}
            ativo={cpfSelecionado === item.cpf}
            onSelecionar={onSelecionar}
          />
        ))}
      </div>
      <ClienteListaTabela
        items={items}
        segmentoId={segmentoId}
        cpfSelecionado={cpfSelecionado}
        onSelecionar={onSelecionar}
      />
    </>
  );
}

function ResumoPeriodo({ resumo, periodo }) {
  if (!resumo) return null;

  const cards = [
    {
      label: "Membros ativos",
      valor: `${resumo.membrosComCompraNoPeriodo}/${resumo.totalMembros}`,
      sub: `${resumo.taxaMembrosComprando}% compraram`,
      Icon: Users,
      cor: "blue",
    },
    {
      label: "CPFs no caixa",
      valor: resumo.cpfsComCompraWrpdv,
      sub: "Com CPF identificado",
      Icon: ScanLine,
      cor: "green",
    },
    {
      label: "Conversão",
      valor: resumo.compramForaDoClube,
      sub: "Compram fora do clube",
      Icon: Target,
      cor: "orange",
      destaque: resumo.compramForaDoClube > 0,
    },
  ];

  return (
    <section className="admin-crm-stats" aria-label="Resumo do período">
      <div className="admin-crm-stats__periodo">
        <CalendarIcon periodo={periodo} />
      </div>
      <div className="admin-crm-stats__grid">
        {cards.map((card) => {
          const Icon = card.Icon;
          return (
            <article
              key={card.label}
              className={`admin-crm-stat admin-crm-stat--${card.cor}${card.destaque ? " admin-crm-stat--destaque" : ""}`}
            >
              <span className="admin-crm-stat__icon">
                <Icon size={18} />
              </span>
              <div>
                <span className="admin-crm-stat__label">{card.label}</span>
                <strong className="admin-crm-stat__valor">{card.valor}</strong>
                <small>{card.sub}</small>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function CalendarIcon({ periodo }) {
  return (
    <div className="admin-crm-stats__periodo-inner">
      <span className="admin-section-label">Período</span>
      <strong>
        {periodo.dataini} — {periodo.datafim}
      </strong>
      <span className="admin-crm-stats__badge">{periodo.dias} dias</span>
    </div>
  );
}

function rotuloUnidadeCupom(unidade) {
  if (unidade == null || unidade === "") return null;
  if (typeof unidade === "object") {
    return unidade.codigo ?? unidade.nome ?? null;
  }
  return String(unidade);
}

function resumoCupomModal(venda) {
  if (!venda) return null;
  const produtos = Array.isArray(venda.produtos) ? venda.produtos : [];
  return {
    ...venda,
    produtos,
    unidadeLabel: rotuloUnidadeCupom(venda.unidade),
    subtotalExibir:
      venda.subtotal ??
      venda.subtotalItens ??
      produtos.reduce((acc, p) => acc + (Number(p.valorBruto ?? p.valorTotal) || 0), 0),
    totalExibir:
      venda.total ??
      venda.totalLiquido ??
      venda.valorTotalCupom ??
      produtos.reduce((acc, p) => acc + (Number(p.valorLiquido ?? p.valorTotal) || 0), 0),
    qtdItens: produtos.length || venda.quantidadeProdutos || 0,
  };
}

function CupomDetalheModal({ aberto, cupom, dataLabel, onFechar }) {
  useEffect(() => {
    if (!aberto) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onFechar();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [aberto, onFechar]);

  if (!aberto || !cupom) return null;

  const cupomNorm = resumoCupomModal(cupom);
  const produtos = cupomNorm.produtos;

  const modal = (
    <div
      className="admin-mkt-modal pdv-modal admin-crm-cupom-modal"
      role="dialog"
      aria-modal="true"
      aria-label={`Detalhes do cupom ${cupomNorm.numeroDcto}`}
    >
      <div className="admin-mkt-modal__backdrop" onClick={onFechar} />
      <div className="admin-mkt-modal__panel pdv-modal__panel admin-crm-cupom-modal__panel">
        <header className="admin-mkt-modal__head pdv-modal__head">
          <div>
            <h3>
              <Receipt size={18} aria-hidden />
              Cupom {cupomNorm.numeroDcto}
            </h3>
            <p className="pdv-modal__sub">
              {dataLabel || cupomNorm.data || "—"}
              {cupomNorm.pdv && <> · Caixa {cupomNorm.pdv}</>}
              {cupomNorm.chaveCupom && (
                <>
                  {" · "}
                  <span className="mono">{cupomNorm.chaveCupom}</span>
                </>
              )}
            </p>
          </div>
          <button type="button" className="pdv-modal__close" onClick={onFechar} aria-label="Fechar">
            <X size={18} />
          </button>
        </header>

        <div className="admin-mkt-modal__body pdv-modal__body">
          <div className="pdv-modal__resumo admin-crm-cupom-modal__resumo">
            <div>
              <span>Status</span>
              <strong>
                {cupomNorm.cancelada ? (
                  <span className="pdv-tag pdv-tag--cancelado">Cancelado</span>
                ) : cupomNorm.convenio ? (
                  <span className="pdv-tag pdv-tag--convenio">Convênio</span>
                ) : (
                  <span className="pdv-tag pdv-tag--normal">Normal</span>
                )}
              </strong>
            </div>
            <div>
              <span>Itens</span>
              <strong>{cupomNorm.qtdItens}</strong>
            </div>
            <div>
              <span>Subtotal</span>
              <strong>{formatarMoeda(cupomNorm.subtotalExibir)}</strong>
            </div>
            <div>
              <span>Total</span>
              <strong>{formatarMoeda(cupomNorm.totalExibir)}</strong>
            </div>
          </div>

          {(cupomNorm.formaPagamento || cupomNorm.formasPagamento?.length > 0) && (
            <p className="admin-crm-cupom-modal__pagamento">
              <strong>Pagamento:</strong>{" "}
              {cupomNorm.formasPagamento?.length
                ? cupomNorm.formasPagamento.join(" · ")
                : cupomNorm.formaPagamento}
              {cupomNorm.unidadeLabel && <> · Unidade {cupomNorm.unidadeLabel}</>}
            </p>
          )}

          {cupomNorm.temDesconto && (
            <p className="admin-crm-cupom-modal__desconto">
              Desconto total no cupom: <strong>−{formatarMoeda(cupomNorm.totalDesconto)}</strong>
              {cupomNorm.totalDescontoCupom > 0 &&
                cupomNorm.totalDescontoCupom !== cupomNorm.totalDesconto && (
                  <> (cupom: {formatarMoeda(cupomNorm.totalDescontoCupom)})</>
                )}
            </p>
          )}

          {produtos.length > 0 ? (
            <div className="pdv-table-wrap">
              <table className="pdv-table pdv-table--compact">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Produto</th>
                    <th style={{ textAlign: "right" }}>Qtd</th>
                    <th style={{ textAlign: "right" }}>Valor</th>
                    <th style={{ textAlign: "right" }}>Desc.</th>
                    <th style={{ textAlign: "right" }}>Líquido</th>
                  </tr>
                </thead>
                <tbody>
                  {produtos.map((item, idx) => (
                    <tr key={`${item.codigoProduto}-${idx}`}>
                      <td className="mono">{item.codigoProduto || item.codigoBarras || "—"}</td>
                      <td>
                        {item.descricao || "—"}
                        {(item.oferta === "SIM" || item.oferta === true) && (
                          <span className="pdv-tag pdv-tag--oferta">Oferta</span>
                        )}
                      </td>
                      <td style={{ textAlign: "right" }}>{item.quantidade ?? item.quantidadeUnitaria ?? "—"}</td>
                      <td style={{ textAlign: "right" }}>{formatarMoeda(item.valorBruto ?? item.valorTotal)}</td>
                      <td style={{ textAlign: "right" }}>
                        {(item.valorDesconto || 0) > 0 ? formatarMoeda(item.valorDesconto) : "—"}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <strong>{formatarMoeda(item.valorLiquido ?? item.valorTotal)}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3} />
                    <td style={{ textAlign: "right" }}>{formatarMoeda(cupomNorm.subtotalExibir)}</td>
                    <td style={{ textAlign: "right" }}>
                      {(cupomNorm.totalDesconto || 0) > 0 ? formatarMoeda(cupomNorm.totalDesconto) : "—"}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <strong>{formatarMoeda(cupomNorm.totalExibir)}</strong>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <p className="pdv-cupom-card__sem-itens">Sem itens registrados neste cupom.</p>
          )}

          {!cupomNorm.cancelada && cupomNorm.elegivelPontos === false && (
            <p className="admin-crm-cupom-modal__nota">
              Este cupom não gera pontos (convênio ou regra de elegibilidade).
            </p>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

function FichaClienteModal({
  aberto,
  onFechar,
  ficha,
  loading,
  erro,
  onIrParaBaixa,
  pontosProgramaAtivo,
}) {
  const [cupomDetalhe, setCupomDetalhe] = useState(null);

  useEffect(() => {
    if (!aberto) {
      setCupomDetalhe(null);
      return undefined;
    }
    const onKey = (e) => {
      if (e.key === "Escape") {
        if (cupomDetalhe) {
          setCupomDetalhe(null);
        } else {
          onFechar();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [aberto, cupomDetalhe, onFechar]);

  if (!aberto) return null;

  return (
    <>
    <div
      className="admin-mkt-modal admin-crm-modal admin-crm-modal--ficha-v2"
      role="dialog"
      aria-modal="true"
      aria-label="Ficha do cliente"
    >
      <div className="admin-mkt-modal__backdrop" onClick={onFechar} />
      <div className="admin-mkt-modal__panel admin-crm-modal__panel admin-crm-modal__panel--ficha">
        {loading ? (
          <div className="admin-crm-ficha-v2__loading">
            <Loader2 size={28} className="admin-crm-loading__spinner admin-crm-loading__spinner--icon" aria-hidden />
            <p>Carregando ficha do cliente…</p>
          </div>
        ) : (
          <>
            {erro && (
              <p className="admin-alert admin-crm-ficha-v2__erro-topo" role="alert">
                {erro}
              </p>
            )}
            <FichaCliente
              ficha={ficha}
              loading={false}
              onFechar={onFechar}
              onIrParaBaixa={onIrParaBaixa}
              pontosProgramaAtivo={pontosProgramaAtivo}
              onAbrirCupom={setCupomDetalhe}
            />
          </>
        )}
      </div>
    </div>

    <CupomDetalheModal
      aberto={Boolean(cupomDetalhe)}
      cupom={cupomDetalhe?.venda}
      dataLabel={cupomDetalhe?.dataLabel}
      onFechar={() => setCupomDetalhe(null)}
    />
    </>
  );
}

function FichaCliente({
  ficha,
  loading,
  onFechar,
  onIrParaBaixa,
  pontosProgramaAtivo = true,
  onAbrirCupom,
}) {
  if (loading) {
    return (
      <div className="admin-crm-loading">
        <Loader2 size={28} className="admin-crm-loading__spinner admin-crm-loading__spinner--icon" aria-hidden />
        <p>Carregando ficha do cliente…</p>
      </div>
    );
  }

  if (!ficha) return null;

  const {
    cliente,
    pontos,
    compras,
    baixas,
    noClube,
    erroVendas,
    periodo,
    sync,
    brindeProximo,
    auditoria,
    valorReferenciaPonto,
    comportamento,
    resgatesResumo,
    erpEncontrado,
    fidelidade,
  } = ficha;
  const resumo = compras?.resumo;
  const nomeCliente =
    cliente?.nome ||
    (noClube && erpEncontrado === false
      ? `Cliente ${formatarCpfCnpj(cliente?.cpf)}`
      : "Cliente");
  const codigoExibir = cliente?.clienteCodigo || cliente?.erpCodigo;
  const totalCupons =
    resumo?.totalVendas ??
    compras?.vendas?.length ??
    compras?.porData?.reduce((acc, dia) => acc + (dia.vendas?.length || 0), 0) ??
    0;

  function abrirCupom(venda, dataLabel) {
    onAbrirCupom?.({ venda, dataLabel });
  }

  return (
    <div className="admin-crm-ficha admin-crm-ficha--v2">
      <header className="admin-crm-ficha-v2__banner">
        <button
          type="button"
          className="admin-crm-ficha-v2__close"
          onClick={onFechar}
          aria-label="Fechar ficha"
        >
          <X size={18} />
        </button>

        <div className="admin-crm-ficha-v2__banner-main">
          <span className="admin-crm-ficha-v2__avatar" aria-hidden>
            {iniciaisNome(nomeCliente)}
          </span>
          <div className="admin-crm-ficha-v2__identidade">
            <p className="admin-section-label">Ficha do cliente</p>
            <h2>{nomeCliente}</h2>
            <p className="admin-crm-ficha-v2__doc">{formatarCpfCnpj(cliente?.cpf)}</p>
            <div className="admin-crm-ficha-v2__badges">
              {noClube ? (
                <span className="admin-crm-badge admin-crm-badge--warn">Fora do clube</span>
              ) : (
                <span className="admin-crm-badge admin-crm-badge--ok">Membro do clube</span>
              )}
              {erpEncontrado === false && (
                <span className="admin-crm-badge admin-crm-badge--muted">Não encontrado no ERP</span>
              )}
              {periodo && (
                <span className="admin-crm-ficha-v2__periodo-badge">
                  {periodo.dataini} — {periodo.datafim}
                </span>
              )}
            </div>
          </div>

          <div className="admin-crm-ficha-v2__banner-stats">
            {pontosProgramaAtivo && pontos && !noClube && (
              <div className="admin-crm-ficha-v2__saldo-card">
                <Award size={18} aria-hidden />
                <div>
                  <strong>{pontos.saldo}</strong>
                  <span>pontos</span>
                </div>
              </div>
            )}
            {resumo && (
              <div className="admin-crm-ficha-v2__saldo-card admin-crm-ficha-v2__saldo-card--gasto">
                <TrendingUp size={18} aria-hidden />
                <div>
                  <strong>{formatarMoeda(resumo.totalGasto ?? 0)}</strong>
                  <span>gasto no período</span>
                </div>
              </div>
            )}
            {!noClube && fidelidade && (
              <div className={`admin-crm-ficha-v2__saldo-card admin-crm-ficha-v2__saldo-card--nivel admin-crm-ficha-v2__saldo-card--nivel-${fidelidade.nivelId}`}>
                <NivelIcon nivelId={fidelidade.nivelId} size={22} />
                <div>
                  <strong>{fidelidade.nivel}</strong>
                  <span>nível {fidelidade.anoReferencia}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {pontosProgramaAtivo && !noClube && pontos && (
          <button
            type="button"
            className="admin-btn admin-btn--primary admin-btn--sm admin-crm-ficha-v2__btn-baixa"
            onClick={() => onIrParaBaixa(cliente.cpf)}
          >
            <Gift size={14} aria-hidden />
            Resgatar prêmio
          </button>
        )}
      </header>

      <div className="admin-crm-ficha-v2__body">
        {pontosProgramaAtivo && sync && (sync.novosCupons > 0 || sync.pontosCreditados > 0) && (
          <div className="admin-crm-banner admin-crm-banner--sync" role="status">
            <strong>Sincronização recente</strong>
            <p>
              {sync.novosCupons > 0 && (
                <>
                  {sync.novosCupons} cupom{sync.novosCupons === 1 ? "" : "s"} novo
                  {sync.novosCupons === 1 ? "" : "s"}
                </>
              )}
              {sync.pontosCreditados > 0 && (
                <>
                  {sync.novosCupons > 0 ? " · " : ""}+{sync.pontosCreditados} pts creditados
                </>
              )}
            </p>
          </div>
        )}

        {pontosProgramaAtivo && brindeProximo && !noClube && (
          <div
            className={`admin-crm-banner${brindeProximo.jaPodeResgatar ? " admin-crm-banner--ok" : " admin-crm-banner--premio"}`}
            role="status"
          >
            {brindeProximo.jaPodeResgatar ? (
              <>
                <strong>Pronto para resgatar</strong>
                <p>
                  Saldo suficiente para <em>{brindeProximo.nome}</em> ({brindeProximo.pontosNecessarios} pts)
                </p>
              </>
            ) : (
              <>
                <strong>Faltam {brindeProximo.faltamPontos} pontos</strong>
                <p>
                  Para resgatar <em>{brindeProximo.nome}</em> ({brindeProximo.pontosNecessarios} pts)
                </p>
              </>
            )}
          </div>
        )}

        {erroVendas && (
          <p className="admin-alert" role="alert">
            {mensagemParaUsuario(erroVendas)}
          </p>
        )}

        {!noClube && fidelidade && (
          <section className={`admin-crm-ficha-v2__nivel admin-crm-ficha-v2__nivel--${fidelidade.nivelId}`}>
            <div className="admin-crm-ficha-v2__nivel-head">
              <NivelIcon nivelId={fidelidade.nivelId} size={36} />
              <div>
                <h3>Nível {fidelidade.nivel}</h3>
                <p>{fidelidade.nivelDescricao}</p>
              </div>
              <div className="admin-crm-ficha-v2__nivel-gasto">
                <span>Gasto em {fidelidade.anoReferencia}</span>
                <strong>{formatarReaisNivel(fidelidade.gastoAno, { centavos: true })}</strong>
                {fidelidade.gastoDesde && (
                  <small>Desde {fidelidade.gastoDesde}</small>
                )}
              </div>
            </div>
            {fidelidade.proximoNivel ? (
              <div className="admin-crm-ficha-v2__nivel-progresso">
                <div className="admin-crm-ficha-v2__nivel-bar" role="progressbar" aria-valuenow={fidelidade.progressoPct} aria-valuemin={0} aria-valuemax={100}>
                  <div style={{ width: `${fidelidade.progressoPct}%` }} />
                </div>
                <p>
                  <Sparkles size={14} aria-hidden />
                  Faltam <strong>{formatarReaisNivel(fidelidade.faltaParaProximo, { centavos: true })}</strong>{" "}
                  para o nível <strong>{fidelidade.proximoNivel.nome}</strong>
                  {fidelidade.proximoNivel.limiar != null && (
                    <> (meta: {formatarReaisNivel(fidelidade.proximoNivel.limiar)})</>
                  )}
                </p>
              </div>
            ) : (
              <p className="admin-crm-ficha-v2__nivel-topo">
                <Sparkles size={14} aria-hidden /> Nível máximo — Diamante alcançado!
              </p>
            )}
          </section>
        )}

        {noClube && (
          <section className="admin-crm-ficha-v2__nivel admin-crm-ficha-v2__nivel--fora">
            <p>
              <UserPlus size={16} aria-hidden />
              Cliente compra no caixa, mas ainda não tem conta no clube online — sem nível de fidelidade.
            </p>
          </section>
        )}

        <div className="admin-crm-ficha-v2__layout">
          <aside className="admin-crm-ficha-v2__sidebar">
            <section className="admin-crm-ficha-v2__card">
              <h3><User size={15} /> Contato e cadastro</h3>
              <FichaDetalheLinha Icon={Hash} rotulo="Código cliente" valor={codigoExibir} />
              <FichaDetalheLinha Icon={Mail} rotulo="E-mail" valor={cliente?.email} />
              <FichaDetalheLinha Icon={Phone} rotulo="Telefone" valor={formatarTelefone(cliente?.telefone)} />
              <FichaDetalheLinha
                Icon={MapPin}
                rotulo="Endereço"
                valor={cliente?.endereco}
                multiline
              />
              <FichaDetalheLinha
                Icon={Calendar}
                rotulo="Data de nascimento"
                valor={formatarDataNascimento(cliente?.dataNascimento)}
              />
              {cliente?.sexo && (
                <FichaDetalheLinha Icon={User} rotulo="Sexo" valor={cliente.sexo} />
              )}
              {cliente?.estadoCivil && (
                <FichaDetalheLinha Icon={User} rotulo="Estado civil" valor={cliente.estadoCivil} />
              )}
            </section>

            {!noClube && (
              <section className="admin-crm-ficha-v2__card">
                <h3><ShieldCheck size={15} /> Clube online</h3>
                <FichaDetalheLinha
                  Icon={Calendar}
                  rotulo="Membro desde"
                  valor={formatarDataHora(cliente.cadastradoEm)}
                />
                {pontosProgramaAtivo && cliente.dataInicioPlataforma && (
                  <FichaDetalheLinha
                    Icon={Award}
                    rotulo="Pontos desde"
                    valor={cliente.dataInicioPlataforma}
                  />
                )}
                <FichaDetalheLinha
                  Icon={Clock}
                  rotulo="Última atualização"
                  valor={formatarDataHora(cliente.atualizadoEm)}
                />
                <FichaDetalheLinha
                  Icon={FileText}
                  rotulo="Aceite regulamento"
                  valor={formatarDataHora(cliente.aceiteRegulamentoEm)}
                />
                <FichaDetalheLinha
                  Icon={FileText}
                  rotulo="Aceite privacidade"
                  valor={formatarDataHora(cliente.aceitePrivacidadeEm)}
                />
              </section>
            )}

            <section className="admin-crm-ficha-v2__card">
              <h3><Activity size={15} /> Comportamento de compra</h3>
              <FichaDetalheLinha
                Icon={ShoppingBag}
                rotulo="Última compra"
                valor={comportamento?.ultimaCompra || "—"}
              />
              <FichaDetalheLinha
                Icon={Clock}
                rotulo="Recência"
                valor={textoDiasSemCompra(comportamento?.diasSemCompra)}
              />
              <FichaDetalheLinha
                Icon={Calendar}
                rotulo="Dias com compra"
                valor={
                  comportamento?.diasComCompra != null
                    ? String(comportamento.diasComCompra)
                    : "—"
                }
              />
              {comportamento?.cuponsCancelados > 0 && (
                <FichaDetalheLinha
                  Icon={AlertCircle}
                  rotulo="Cupons cancelados"
                  valor={String(comportamento.cuponsCancelados)}
                />
              )}
              {comportamento?.cuponsConvenio > 0 && (
                <FichaDetalheLinha
                  Icon={Package}
                  rotulo="Cupons convênio"
                  valor={String(comportamento.cuponsConvenio)}
                />
              )}
            </section>
          </aside>

          <main className="admin-crm-ficha-v2__main">
            <div className="admin-crm-kpis admin-crm-kpis--ficha">
              <article className="admin-crm-kpi">
                <span className="admin-crm-kpi__label">Cupons no período</span>
                <strong>{resumo?.totalVendasAtivas ?? resumo?.totalVendas ?? 0}</strong>
                <small>{periodo?.dataini} — {periodo?.datafim}</small>
              </article>
              <article className="admin-crm-kpi">
                <span className="admin-crm-kpi__label">Total gasto</span>
                <strong>{formatarMoeda(resumo?.totalGasto ?? 0)}</strong>
                <small>WR PDV · cupons elegíveis</small>
              </article>
              <article className="admin-crm-kpi">
                <span className="admin-crm-kpi__label">Ticket médio</span>
                <strong>{formatarMoeda(resumo?.ticketMedio ?? 0)}</strong>
              </article>
              <article className="admin-crm-kpi">
                <span className="admin-crm-kpi__label">Itens comprados</span>
                <strong>{resumo?.totalItens ?? 0}</strong>
                <small>
                  {comportamento?.mediaItensPorCupom
                    ? `~${comportamento.mediaItensPorCupom} por cupom`
                    : "No período"}
                </small>
              </article>
              {resumo?.totalDescontos > 0 && (
                <article className="admin-crm-kpi admin-crm-kpi--desconto">
                  <span className="admin-crm-kpi__label">Descontos</span>
                  <strong>{formatarMoeda(resumo.totalDescontos)}</strong>
                  <small>Economia nos cupons</small>
                </article>
              )}
              {pontosProgramaAtivo && pontos && !noClube && (
                <>
                  <article className="admin-crm-kpi">
                    <span className="admin-crm-kpi__label">Cupons contabilizados</span>
                    <strong>{pontos.cupons ?? 0}</strong>
                    <small>Pontos gerados no clube</small>
                  </article>
                  <article className="admin-crm-kpi">
                    <span className="admin-crm-kpi__label">Próxima expiração</span>
                    <strong>
                      {pontos.pontosProximaExpiracao > 0
                        ? `${pontos.pontosProximaExpiracao} pts`
                        : "—"}
                    </strong>
                    <small>
                      {pontos.proximaExpiracao
                        ? `${formatarData(pontos.proximaExpiracao)} (~${formatarMoeda(pontos.pontosProximaExpiracao * (valorReferenciaPonto || 0.5))})`
                        : "Sem expiração próxima"}
                    </small>
                  </article>
                  {pontos.valorPendente > 0 && (
                    <article className="admin-crm-kpi">
                      <span className="admin-crm-kpi__label">Parcial p/ próximo ponto</span>
                      <strong>{formatarMoeda(pontos.valorPendente)}</strong>
                      <small>Faltam {formatarMoeda(pontos.faltaParaProximoPonto)}</small>
                    </article>
                  )}
                  {resgatesResumo?.total > 0 && (
                    <article className="admin-crm-kpi">
                      <span className="admin-crm-kpi__label">Resgates realizados</span>
                      <strong>{resgatesResumo.total}</strong>
                      <small>{resgatesResumo.pontosResgatados} pts resgatados</small>
                    </article>
                  )}
                </>
              )}
            </div>

            <div className="admin-crm-ficha-v2__colunas">
              {compras?.porData?.length > 0 ? (
                <section className="admin-crm-compras admin-crm-ficha-v2__secao">
                  <header className="admin-crm-ficha-v2__secao-head">
                    <h3><ShoppingBag size={16} /> Compras (WR PDV)</h3>
                    <span>{totalCupons} cupom{totalCupons === 1 ? "" : "s"}</span>
                  </header>
                  <p className="admin-crm-ficha-v2__secao-hint">Clique em um cupom para ver todos os itens.</p>
                  <div className="admin-crm-compras__lista admin-crm-compras__lista--scroll">
                    {compras.porData.map((dia) => (
                      <details key={dia.data} className="admin-crm-dia" open={compras.porData.length <= 3}>
                        <summary>
                          <span>{dia.dataLabel || dia.data}</span>
                          <span>
                            {dia.vendas?.length ?? dia.quantidadeVendas ?? 0} cupom
                            {(dia.vendas?.length ?? dia.quantidadeVendas ?? 0) === 1 ? "" : "s"} ·{" "}
                            {formatarMoeda(dia.totalDia)}
                          </span>
                        </summary>
                        <ul>
                          {dia.vendas.map((v) => (
                            <li key={`${dia.data}-${v.chaveCupom || v.numeroDcto}`} className="admin-crm-dia__cupom-item">
                              <button
                                type="button"
                                className={`admin-crm-cupom-btn${v.temDesconto ? " admin-crm-cupom--desconto" : ""}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  abrirCupom(v, dia.dataLabel || dia.data);
                                }}
                              >
                                <div className="admin-crm-cupom__head">
                                  <div>
                                    <strong>Cupom {v.numeroDcto}</strong>
                                    {v.pdv && <span> · Caixa {v.pdv}</span>}
                                    {v.cancelada && (
                                      <span className="admin-crm-tag admin-crm-tag--cancel">Cancelada</span>
                                    )}
                                    {v.convenio && (
                                      <span className="admin-crm-tag admin-crm-tag--conv">Convênio</span>
                                    )}
                                    {v.temDesconto && (
                                      <span className="admin-crm-tag admin-crm-tag--desconto">Desconto</span>
                                    )}
                                  </div>
                                  <div className="admin-crm-cupom__valores">
                                    {v.temDesconto && (
                                      <span className="admin-crm-cupom__subtotal">
                                        {formatarMoeda(v.subtotal)}
                                      </span>
                                    )}
                                    <span className="admin-crm-cupom__total">{formatarMoeda(v.total)}</span>
                                    <ChevronRight size={16} className="admin-crm-cupom__chevron" aria-hidden />
                                  </div>
                                </div>
                                {(v.produtos?.length > 0 || v.quantidadeProdutos > 0) && (
                                  <p className="admin-crm-cupom__preview">
                                    {v.produtos?.length || v.quantidadeProdutos} item
                                    {(v.produtos?.length || v.quantidadeProdutos) === 1 ? "" : "s"}
                                    {v.produtos?.[0]?.descricao && (
                                      <> · {v.produtos[0].descricao}</>
                                    )}
                                  </p>
                                )}
                              </button>
                            </li>
                          ))}
                        </ul>
                      </details>
                    ))}
                  </div>
                </section>
              ) : (
                !erroVendas && (
                  <section className="admin-crm-ficha-v2__secao admin-crm-ficha-v2__secao--vazio">
                    <ShoppingBag size={28} strokeWidth={1.25} aria-hidden />
                    <p>Nenhuma compra no período consultado.</p>
                  </section>
                )
              )}

              <div className="admin-crm-ficha-v2__col-direita">
                {pontosProgramaAtivo && baixas?.length > 0 && (
                  <section className="admin-crm-resgates admin-crm-ficha-v2__secao">
                    <header className="admin-crm-ficha-v2__secao-head">
                      <h3><Gift size={16} /> Resgates no clube</h3>
                      <span>{baixas.length}</span>
                    </header>
                    <ul className="admin-lista admin-crm-ficha-v2__lista-compacta">
                      {baixas.map((b) => (
                        <li key={b.id} className="admin-lista__item">
                          <div>
                            <strong>-{b.pontos} pts</strong>
                            {b.brindeNome && <span> · {b.brindeNome}</span>}
                          </div>
                          <small>
                            {formatarDataHora(b.criadoEm)} · {b.adminUsuario}
                            {b.codigoResgate && <> · {b.codigoResgate}</>}
                          </small>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {auditoria?.length > 0 && (
                  <section className="admin-crm-auditoria admin-crm-ficha-v2__secao">
                    <header className="admin-crm-ficha-v2__secao-head">
                      <h3><Activity size={16} /> Atividade na plataforma</h3>
                      <span>{auditoria.length}</span>
                    </header>
                    <ol className="admin-crm-timeline admin-crm-timeline--compact">
                      {auditoria.map((ev) => (
                        <li
                          key={ev.id}
                          className={`admin-crm-timeline__item${ev.sucesso === false ? " admin-crm-timeline__item--falha" : ""}`}
                        >
                          <span className="admin-crm-timeline__dot" aria-hidden />
                          <div>
                            <strong>{ev.eventoLabel || ev.evento}</strong>
                            <time dateTime={ev.criadoEm}>{formatarDataHora(ev.criadoEm)}</time>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </section>
                )}
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

export default function AdminClientesPage({ tab, onTabChange, onLogout, admin }) {
  const [termoBusca, setTermoBusca] = useState("");
  const [resultadosBusca, setResultadosBusca] = useState([]);
  const [loadingBusca, setLoadingBusca] = useState(false);
  const [termoBuscaAtivo, setTermoBuscaAtivo] = useState("");
  const [ficha, setFicha] = useState(null);
  const [loadingFicha, setLoadingFicha] = useState(false);
  const [segmentos, setSegmentos] = useState(null);
  const [loadingSegmentos, setLoadingSegmentos] = useState(true);
  const [segmentoAtivo, setSegmentoAtivo] = useState("compramForaDoClube");
  const [cpfSelecionado, setCpfSelecionado] = useState("");
  const [diasPeriodo, setDiasPeriodo] = useState(90);
  const [error, setError] = useState("");
  const [fichaErro, setFichaErro] = useState("");
  const [modalFichaAberto, setModalFichaAberto] = useState(false);
  const [programaPontosAtivo, setProgramaPontosAtivo] = useState(true);

  const carregarPrograma = useCallback(async () => {
    try {
      const data = await fetchAdmin("/api/admin/config/programa");
      setProgramaPontosAtivo(Boolean(data.pontosHabilitado));
    } catch {
      setProgramaPontosAtivo(true);
    }
  }, []);

  useEffect(() => {
    carregarPrograma();
  }, [carregarPrograma]);

  useEffect(() => {
    const qs = adminQueryFromHash();
    const cpfUrl = qs.get("cpf")?.replace(/\D/g, "");
    if (cpfUrl && cpfUrl.length >= 11) {
      setTermoBusca(formatarCpfCnpj(cpfUrl));
      carregarFicha(cpfUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só na montagem com ?cpf=
  }, []);

  useEffect(() => {
    if (!programaPontosAtivo && PONTOS_SEGMENTO_IDS.has(segmentoAtivo)) {
      setSegmentoAtivo("compramForaDoClube");
    }
  }, [programaPontosAtivo, segmentoAtivo]);

  const gruposSegmentos = programaPontosAtivo
    ? GRUPOS_SEGMENTOS
    : GRUPOS_SEGMENTOS.filter((g) => g.titulo !== "Pontos e prêmios");

  const carregarSegmentos = useCallback(async () => {
    setLoadingSegmentos(true);
    try {
      const data = await fetchAdmin(`/api/admin/clientes/segmentos?dias=${diasPeriodo}`);
      setSegmentos(data);
    } catch (err) {
      if (err.code === "UNAUTHORIZED") {
        clearAdminSession();
        onLogout();
        return;
      }
      setError(mensagemParaUsuario(err.message));
    } finally {
      setLoadingSegmentos(false);
    }
  }, [diasPeriodo, onLogout]);

  const carregarFicha = useCallback(
    async (cpf) => {
      const cpfNorm = cpf.replace(/\D/g, "");
      if (!cpfValido(cpfNorm) && cpfNorm.length !== 14) {
        setError("Informe um CPF válido");
        return;
      }

      setModalFichaAberto(true);
      setLoadingFicha(true);
      setError("");
      setFichaErro("");
      setCpfSelecionado(cpfNorm);

      try {
        const data = await fetchAdmin(
          `/api/admin/clientes/${cpfNorm}/ficha?dias=${diasPeriodo}`
        );
        setFicha(data);
      } catch (err) {
        if (err.code === "UNAUTHORIZED") {
          clearAdminSession();
          onLogout();
          return;
        }
        setFicha(null);
        setFichaErro(mensagemParaUsuario(err.message));
      } finally {
        setLoadingFicha(false);
      }
    },
    [diasPeriodo, onLogout]
  );

  const fecharModalFicha = useCallback(() => {
    setModalFichaAberto(false);
    setFichaErro("");
  }, []);

  useEffect(() => {
    carregarSegmentos();
  }, [carregarSegmentos]);

  const cpfSelecionadoRef = useRef(cpfSelecionado);
  cpfSelecionadoRef.current = cpfSelecionado;

  useEffect(() => {
    if (!cpfSelecionadoRef.current) return;
    carregarFicha(cpfSelecionadoRef.current);
  }, [diasPeriodo, carregarFicha]);

  function handleTermoChange(valor) {
    const digits = valor.replace(/\D/g, "");
    const soDigitos = digits.length > 0 && /^[\d\s./-]+$/.test(valor);
    setTermoBusca(soDigitos ? formatarCpfCnpj(valor) : valor);
    if (resultadosBusca.length) setResultadosBusca([]);
  }

  async function handleBuscar(event) {
    event.preventDefault();
    const termo = termoBusca.trim();
    if (!termo) {
      setError("Informe CPF, CNPJ, nome ou código do cliente.");
      return;
    }

    setError("");
    setResultadosBusca([]);
    const digits = termo.replace(/\D/g, "");

    if (digits.length === 11 || digits.length === 14) {
      if (digits.length === 11 && !cpfValido(digits)) {
        setError("CPF inválido. Confira os números digitados.");
        return;
      }
      carregarFicha(digits);
      return;
    }

    setLoadingBusca(true);
    setTermoBuscaAtivo(termo);
    try {
      const params = new URLSearchParams({ q: termo, limite: "15" });
      const data = await fetchAdmin(`/api/admin/clientes/busca?${params}`);
      const lista = data.resultados || [];

      if (lista.length === 0) {
        setError(
          "Nenhum cliente encontrado. Tente o CPF/CNPJ completo ou parte do nome cadastrado no clube."
        );
        return;
      }

      if (lista.length === 1) {
        carregarFicha(lista[0].cpf);
        return;
      }

      setResultadosBusca(lista);
    } catch (err) {
      if (err.code === "UNAUTHORIZED") {
        clearAdminSession();
        onLogout();
        return;
      }
      setError(mensagemParaUsuario(err.message));
    } finally {
      setLoadingBusca(false);
    }
  }

  function handleSair() {
    clearAdminSession();
    onLogout();
  }

  function handleIrParaBaixa(cpf) {
    fecharModalFicha();
    navegarAdminComQuery("pontos", { cpf });
    onTabChange("pontos");
  }

  function handleMudarPeriodo(dias) {
    setDiasPeriodo(dias);
    setFicha(null);
    setModalFichaAberto(false);
    setCpfSelecionado("");
  }

  const listaSegmento = segmentos?.segmentos?.[segmentoAtivo] || [];
  const segmentoConfig = SEGMENTOS.find((s) => s.id === segmentoAtivo);
  const contagemAtiva = segmentos?.contagens?.[segmentoAtivo];

  return (
    <AdminLayout tab={tab} onTabChange={onTabChange} onLogout={handleSair} admin={admin}>
      <AdminProgramaBanner />
      <div className="admin-crm admin-crm--v3">
        <header className="admin-crm-hero">
          <div className="admin-crm-hero__text">
            <p className="admin-section-label">CRM · Clientes</p>
            <h1>Relacionamento com clientes</h1>
            <p>Compras do caixa, segmentos acionáveis — busque por CPF, nome ou código e abra a ficha.</p>
          </div>

          <div className="admin-crm-hero__tools">
            <form className="admin-crm-search admin-crm-search--wide" onSubmit={handleBuscar}>
              <Search size={18} className="admin-crm-search__icon" aria-hidden />
              <input
                id="crm-busca-cliente"
                value={termoBusca}
                onChange={(e) => handleTermoChange(e.target.value)}
                placeholder="CPF, CNPJ, nome ou código do cliente…"
                className="admin-crm-search__input"
                aria-label="Buscar cliente por CPF, CNPJ, nome ou código"
                autoComplete="off"
              />
              <button
                type="submit"
                className="admin-btn admin-btn--primary admin-btn--sm"
                disabled={loadingFicha || loadingBusca}
              >
                {loadingFicha || loadingBusca ? "…" : "Buscar"}
              </button>
            </form>

            <BuscaClientesResultados
              resultados={resultadosBusca}
              loading={loadingBusca}
              termo={termoBuscaAtivo}
              onSelecionar={(cpf) => {
                setResultadosBusca([]);
                carregarFicha(cpf);
              }}
            />

            <div className="admin-crm-periodo" role="group" aria-label="Período de análise">
              {OPCOES_PERIODO.map((op) => (
                <button
                  key={op.dias}
                  type="button"
                  className={`admin-crm-periodo__btn${diasPeriodo === op.dias ? " admin-crm-periodo__btn--ativo" : ""}`}
                  onClick={() => handleMudarPeriodo(op.dias)}
                  disabled={loadingSegmentos || loadingFicha}
                >
                  {op.label}
                </button>
              ))}
            </div>
          </div>
        </header>

        {error && (
          <p className="admin-alert" role="alert">
            {error}
          </p>
        )}

        {segmentos?.resumo && segmentos?.periodo && (
          <ResumoPeriodo resumo={segmentos.resumo} periodo={segmentos.periodo} />
        )}

        <div className="admin-crm-workspace">
          <section className="admin-crm-lista admin-card">
            <SegmentosNav
              grupos={gruposSegmentos}
              segmentoAtivo={segmentoAtivo}
              contagens={segmentos?.contagens}
              onSelecionar={setSegmentoAtivo}
              horizontal
            />

            <header className="admin-crm-lista__head">
              <div>
                <p className="admin-section-label">Resultados</p>
                <h2>{segmentoConfig?.label || "Clientes"}</h2>
                {segmentoConfig?.hint && (
                  <p className="admin-crm-lista__hint">{segmentoConfig.hint}</p>
                )}
              </div>
              {contagemAtiva != null && (
                <span className="admin-crm-lista__badge">
                  {Math.min(contagemAtiva, 20)}
                  {contagemAtiva > 20 ? ` / ${contagemAtiva}` : ""}
                </span>
              )}
            </header>

            <div className="admin-crm-lista__body">
              {loadingSegmentos ? (
                <div className="admin-crm-loading admin-crm-loading--compact">
                  <Loader2 size={22} className="admin-crm-loading__spinner admin-crm-loading__spinner--icon" aria-hidden />
                  <p>Carregando listas…</p>
                </div>
              ) : listaSegmento.length === 0 ? (
                <div className="admin-crm-resultados__vazio">
                  <Users size={32} strokeWidth={1.25} aria-hidden />
                  <p>Nenhum cliente nesta lista.</p>
                </div>
              ) : (
                <>
                  {contagemAtiva > 20 && (
                    <p className="admin-crm-lista__limite">
                      Top 20 de {contagemAtiva} — clique na linha para abrir a ficha.
                    </p>
                  )}
                  <ClienteListaResultados
                    items={listaSegmento}
                    segmentoId={segmentoAtivo}
                    cpfSelecionado={cpfSelecionado}
                    onSelecionar={carregarFicha}
                  />
                </>
              )}
            </div>
          </section>
        </div>

        <FichaClienteModal
          aberto={modalFichaAberto}
          onFechar={fecharModalFicha}
          ficha={ficha}
          loading={loadingFicha}
          erro={fichaErro}
          onIrParaBaixa={handleIrParaBaixa}
          pontosProgramaAtivo={programaPontosAtivo}
        />
      </div>
    </AdminLayout>
  );
}
