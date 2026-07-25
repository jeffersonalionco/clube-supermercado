import { useCallback, useEffect, useRef, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout.jsx";
import AdminProgramaBanner from "../../components/admin/AdminProgramaBanner.jsx";
import Field from "../../components/Field.jsx";
import { formatarCpfCnpj, cpfValido } from "../../utils/cpf.js";
import { clearAdminSession, fetchAdmin } from "../../utils/adminSession.js";
import { formatarMoeda } from "../../utils/moeda.js";
import { mensagemParaUsuario } from "../../utils/mensagensUsuario.js";
import { navegarAdminComQuery } from "../../utils/adminHash.js";

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
        icon: "◎",
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
        icon: "▲",
        tom: "membro",
      },
      {
        id: "inativos",
        label: "Inativos (+60d)",
        hint: "Sem compra há mais de 60 dias",
        icon: "◷",
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
        icon: "★",
        tom: "premio",
      },
      {
        id: "pontosExpirando",
        label: "Pontos expirando",
        hint: "Vencem em até 60 dias",
        icon: "⏱",
        tom: "alerta",
      },
      {
        id: "comPontosSemResgate",
        label: "Sem resgate",
        hint: "Saldo alto, nunca resgatou",
        icon: "◆",
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

function ClienteListaItem({ item, onSelecionar, ativo, segmentoId, indice }) {
  const nomeExibicao = item.nome || (item.foraDoClube ? "Comprador no caixa" : "Sem nome");
  const chips = metricasItem(item, segmentoId);

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
            {chips.map((chip) => (
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
      <span className="admin-crm-card__chevron" aria-hidden>
        ›
      </span>
    </button>
  );
}

function SegmentosNav({ grupos, segmentoAtivo, contagens, onSelecionar }) {
  return (
    <nav className="admin-crm-seg-nav" aria-label="Listas inteligentes">
      {grupos.map((grupo) => (
        <div key={grupo.titulo} className="admin-crm-seg-grupo">
          <p className="admin-crm-seg-grupo__titulo">{grupo.titulo}</p>
          <ul className="admin-crm-seg-grupo__lista" role="tablist">
            {grupo.itens.map((seg) => {
              const total = contagens?.[seg.id];
              const ativo = segmentoAtivo === seg.id;
              return (
                <li key={seg.id}>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={ativo}
                    className={`admin-crm-seg-opt admin-crm-seg-opt--${seg.tom}${ativo ? " admin-crm-seg-opt--ativo" : ""}`}
                    onClick={() => onSelecionar(seg.id)}
                  >
                    <span className="admin-crm-seg-opt__icon" aria-hidden>
                      {seg.icon}
                    </span>
                    <span className="admin-crm-seg-opt__texto">
                      <strong>{seg.label}</strong>
                      <small>{seg.hint}</small>
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

function ResumoPeriodo({ resumo, periodo }) {
  if (!resumo) return null;

  const cards = [
    {
      label: "Membros ativos no caixa",
      valor: `${resumo.membrosComCompraNoPeriodo}/${resumo.totalMembros}`,
      sub: `${resumo.taxaMembrosComprando}% compraram no período`,
    },
    {
      label: "CPFs no caixa (loja)",
      valor: resumo.cpfsComCompraWrpdv,
      sub: "Compras com CPF identificado",
    },
    {
      label: "Oportunidade de conversão",
      valor: resumo.compramForaDoClube,
      sub: "Compram mas não estão no clube",
      destaque: resumo.compramForaDoClube > 0,
    },
  ];

  return (
    <section className="admin-crm-resumo" aria-label="Resumo do período">
      <header className="admin-crm-resumo__head">
        <div>
          <p className="admin-section-label">Panorama do período</p>
          <h2 className="admin-crm-resumo__titulo">
            {periodo.dataini} — {periodo.datafim}
          </h2>
        </div>
        <span className="admin-crm-resumo__badge">{periodo.dias} dias</span>
      </header>
      <div className="admin-crm-resumo__grid">
        {cards.map((card) => (
          <article
            key={card.label}
            className={`admin-crm-resumo__card${card.destaque ? " admin-crm-resumo__card--destaque" : ""}`}
          >
            <span className="admin-crm-resumo__card-label">{card.label}</span>
            <strong className="admin-crm-resumo__card-valor">{card.valor}</strong>
            <small>{card.sub}</small>
          </article>
        ))}
      </div>
    </section>
  );
}

function FichaCliente({ ficha, loading, onIrParaBaixa, pontosProgramaAtivo = true }) {
  if (loading) {
    return (
      <div className="admin-crm-loading">
        <span className="admin-crm-loading__spinner" aria-hidden />
        <p>Carregando ficha do cliente…</p>
      </div>
    );
  }

  if (!ficha) {
    return (
      <div className="admin-crm-empty">
        <div className="admin-crm-empty__icon" aria-hidden>
          👤
        </div>
        <h3>Selecione um cliente</h3>
        <p>
          Busque um CPF ou escolha alguém nas listas ao lado para ver compras reais do WR PDV
          {pontosProgramaAtivo ? ", pontos e histórico." : " e histórico."}
        </p>
      </div>
    );
  }

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
  } = ficha;
  const resumo = compras?.resumo;

  return (
    <div className="admin-crm-ficha">
      <header className="admin-crm-ficha__head">
        <div>
          <p className="admin-section-label">Ficha do cliente</p>
          <h2>{cliente?.nome || "Cliente"}</h2>
          <p className="admin-crm-ficha__sub">
            <span>{formatarCpfCnpj(cliente?.cpf)}</span>
            {noClube ? (
              <span className="admin-crm-badge admin-crm-badge--warn">Fora do clube</span>
            ) : (
              <span className="admin-crm-badge admin-crm-badge--ok">Membro do clube</span>
            )}
          </p>
          {!noClube && cliente?.cadastradoEm && (
            <p className="admin-crm-ficha__meta">
              Membro desde {formatarData(cliente.cadastradoEm)}
              {pontosProgramaAtivo && cliente.dataInicioPlataforma && (
                <> · pontos a partir de {cliente.dataInicioPlataforma}</>
              )}
            </p>
          )}
        </div>

        <div className="admin-crm-ficha__acoes">
          {pontosProgramaAtivo && pontos && (
            <div className="admin-crm-ficha__saldo">
              <span className="admin-crm-ficha__saldo-valor">{pontos.saldo}</span>
              <span className="admin-crm-ficha__saldo-label">pontos</span>
            </div>
          )}
          {pontosProgramaAtivo && !noClube && pontos && (
            <button
              type="button"
              className="admin-btn admin-btn--primary admin-crm-ficha__btn-baixa"
              onClick={() => onIrParaBaixa(cliente.cpf)}
            >
              Resgatar prêmio
            </button>
          )}
        </div>
      </header>

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
                {sync.novosCupons > 0 ? " · " : ""}
                +{sync.pontosCreditados} pts creditados
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
                Saldo suficiente para <em>{brindeProximo.nome}</em> ({brindeProximo.pontosNecessarios}{" "}
                pts)
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

      <div className="admin-crm-kpis">
        <article className="admin-crm-kpi">
          <span className="admin-crm-kpi__label">Compras no período</span>
          <strong>{resumo?.totalVendasAtivas ?? resumo?.totalVendas ?? 0}</strong>
          <small>
            {periodo?.dataini} — {periodo?.datafim}
          </small>
        </article>
        <article className="admin-crm-kpi">
          <span className="admin-crm-kpi__label">Total gasto (WR PDV)</span>
          <strong>{formatarMoeda(resumo?.totalGasto ?? 0)}</strong>
          <small>Cupons elegíveis no resumo</small>
        </article>
        <article className="admin-crm-kpi">
          <span className="admin-crm-kpi__label">Ticket médio</span>
          <strong>{formatarMoeda(resumo?.ticketMedio ?? 0)}</strong>
        </article>
        {resumo?.totalDescontos > 0 && (
          <article className="admin-crm-kpi admin-crm-kpi--desconto">
            <span className="admin-crm-kpi__label">Descontos no período</span>
            <strong>{formatarMoeda(resumo.totalDescontos)}</strong>
            <small>Valor economizado nos cupons</small>
          </article>
        )}
        {pontosProgramaAtivo && pontos && (
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
        )}
      </div>

      {compras?.porData?.length > 0 ? (
        <section className="admin-crm-compras">
          <h3>Compras reais (WR PDV)</h3>
          <div className="admin-crm-compras__lista">
            {compras.porData.slice(0, 15).map((dia) => (
              <details key={dia.data} className="admin-crm-dia">
                <summary>
                  <span>{dia.dataLabel || dia.data}</span>
                  <span>
                    {dia.quantidadeVendas} cupom{dia.quantidadeVendas === 1 ? "" : "s"} ·{" "}
                    {formatarMoeda(dia.totalDia)}
                  </span>
                </summary>
                <ul>
                  {dia.vendas.map((v) => (
                    <li
                      key={`${dia.data}-${v.chaveCupom || v.numeroDcto}`}
                      className={v.temDesconto ? "admin-crm-cupom--desconto" : ""}
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
                        </div>
                      </div>
                      {v.temDesconto && (
                        <p className="admin-crm-cupom__desconto">
                          Desconto <strong>−{formatarMoeda(v.totalDesconto)}</strong>
                          <span> · total do cupom {formatarMoeda(v.total)}</span>
                        </p>
                      )}
                      {v.produtos?.some((p) => p.temDesconto) && (
                        <ul className="admin-crm-cupom__itens">
                          {v.produtos
                            .filter((p) => p.temDesconto)
                            .map((p, idx) => (
                              <li key={`${p.codigoProduto}-${idx}`}>
                                <span>{p.descricao || p.codigoProduto}</span>
                                <span>
                                  {formatarMoeda(p.valorBruto)} − {formatarMoeda(p.valorDesconto)} ={" "}
                                  <strong>{formatarMoeda(p.valorLiquido ?? p.valorTotal)}</strong>
                                </span>
                              </li>
                            ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        </section>
      ) : (
        !erroVendas && (
          <p className="admin-empty">Nenhuma compra encontrada no período consultado.</p>
        )
      )}

      {pontosProgramaAtivo && baixas?.length > 0 && (
        <section className="admin-crm-resgates">
          <h3>Resgates no clube</h3>
          <ul className="admin-lista">
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
        <section className="admin-crm-auditoria">
          <h3>Atividade na plataforma</h3>
          <ol className="admin-crm-timeline">
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
  );
}

export default function AdminClientesPage({ tab, onTabChange, onLogout, admin }) {
  const [cpfBusca, setCpfBusca] = useState("");
  const [ficha, setFicha] = useState(null);
  const [loadingFicha, setLoadingFicha] = useState(false);
  const [segmentos, setSegmentos] = useState(null);
  const [loadingSegmentos, setLoadingSegmentos] = useState(true);
  const [segmentoAtivo, setSegmentoAtivo] = useState("compramForaDoClube");
  const [cpfSelecionado, setCpfSelecionado] = useState("");
  const [diasPeriodo, setDiasPeriodo] = useState(90);
  const [error, setError] = useState("");
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

      setLoadingFicha(true);
      setError("");
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
        setError(mensagemParaUsuario(err.message));
      } finally {
        setLoadingFicha(false);
      }
    },
    [diasPeriodo, onLogout]
  );

  useEffect(() => {
    carregarSegmentos();
  }, [carregarSegmentos]);

  const cpfSelecionadoRef = useRef(cpfSelecionado);
  cpfSelecionadoRef.current = cpfSelecionado;

  useEffect(() => {
    if (!cpfSelecionadoRef.current) return;
    carregarFicha(cpfSelecionadoRef.current);
  }, [diasPeriodo, carregarFicha]);

  function handleBuscar(event) {
    event.preventDefault();
    carregarFicha(cpfBusca);
  }

  function handleSair() {
    clearAdminSession();
    onLogout();
  }

  function handleIrParaBaixa(cpf) {
    navegarAdminComQuery("pontos", { cpf });
    onTabChange("pontos");
  }

  function handleMudarPeriodo(dias) {
    setDiasPeriodo(dias);
    setFicha(null);
  }

  const listaSegmento = segmentos?.segmentos?.[segmentoAtivo] || [];
  const segmentoConfig = SEGMENTOS.find((s) => s.id === segmentoAtivo);
  const contagemAtiva = segmentos?.contagens?.[segmentoAtivo];

  return (
    <AdminLayout tab={tab} onTabChange={onTabChange} onLogout={handleSair} admin={admin}>
      <AdminProgramaBanner />
      <div className="admin-crm">
        <header className="admin-crm-topbar">
          <div>
            <p className="admin-section-label">CRM · Clientes</p>
            <h1 className="admin-crm-topbar__title">Relacionamento com clientes</h1>
            <p className="admin-crm-topbar__sub">
              Compras reais do caixa cruzadas com pontos, resgates e segmentos acionáveis.
            </p>
          </div>
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
        </header>

        {error && (
          <p className="admin-alert" role="alert">
            {error}
          </p>
        )}

        {segmentos?.resumo && segmentos?.periodo && (
          <ResumoPeriodo resumo={segmentos.resumo} periodo={segmentos.periodo} />
        )}

        <section className="admin-card admin-crm-busca">
          <h2>Buscar cliente</h2>
          <p className="admin-crm-busca__hint">
            Digite o CPF para abrir a ficha completa com compras, pontos e histórico.
          </p>
          <form className="admin-crm-busca__form" onSubmit={handleBuscar}>
            <Field label="CPF do cliente" id="crm-cpf">
              <input
                id="crm-cpf"
                inputMode="numeric"
                value={cpfBusca}
                onChange={(e) => setCpfBusca(formatarCpfCnpj(e.target.value))}
                placeholder="000.000.000-00"
                className="admin-baixa-cpf-input"
              />
            </Field>
            <button
              type="submit"
              className="admin-btn admin-btn--primary"
              disabled={loadingFicha}
            >
              {loadingFicha ? "Consultando…" : "Ver ficha"}
            </button>
          </form>
        </section>

        <div className="admin-crm-layout">
          <aside className="admin-card admin-crm-lista-panel">
            <header className="admin-crm-lista-panel__head">
              <h3>Listas inteligentes</h3>
              <p>Segmentos prontos para ação no caixa e no clube.</p>
            </header>

            <SegmentosNav
              grupos={gruposSegmentos}
              segmentoAtivo={segmentoAtivo}
              contagens={segmentos?.contagens}
              onSelecionar={setSegmentoAtivo}
            />

            <div className="admin-crm-resultados">
              <header className="admin-crm-resultados__head">
                <div>
                  <p className="admin-section-label">Resultados</p>
                  <h4>{segmentoConfig?.label || "Clientes"}</h4>
                  {segmentoConfig?.hint && (
                    <p className="admin-crm-resultados__hint">{segmentoConfig.hint}</p>
                  )}
                </div>
                {contagemAtiva != null && (
                  <span className="admin-crm-resultados__badge">
                    {Math.min(contagemAtiva, 20)}
                    {contagemAtiva > 20 ? ` / ${contagemAtiva}` : ""}
                  </span>
                )}
              </header>

              {loadingSegmentos ? (
                <div className="admin-crm-loading admin-crm-loading--compact">
                  <span className="admin-crm-loading__spinner" aria-hidden />
                  <p>Carregando listas…</p>
                </div>
              ) : listaSegmento.length === 0 ? (
                <div className="admin-crm-resultados__vazio">
                  <span aria-hidden>∅</span>
                  <p>Nenhum cliente nesta lista.</p>
                </div>
              ) : (
                <>
                  {contagemAtiva > 20 && (
                    <p className="admin-crm-lista__limite">
                      Top 20 de {contagemAtiva} — clique para ver a ficha.
                    </p>
                  )}
                  <div className="admin-crm-lista__scroll">
                    {listaSegmento.map((item, indice) => (
                      <ClienteListaItem
                        key={item.cpf}
                        item={item}
                        indice={indice}
                        segmentoId={segmentoAtivo}
                        ativo={cpfSelecionado === item.cpf}
                        onSelecionar={carregarFicha}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          </aside>

          <div className="admin-card admin-crm-ficha-wrap">
            <FichaCliente
              ficha={ficha}
              loading={loadingFicha}
              onIrParaBaixa={handleIrParaBaixa}
              pontosProgramaAtivo={programaPontosAtivo}
            />
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
