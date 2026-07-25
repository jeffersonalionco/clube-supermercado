import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Logo from "../components/Logo.jsx";
import ClientTabHeader from "../components/ClientTabHeader.jsx";
import EmptyState from "../components/EmptyState.jsx";
import PullToRefresh from "../components/PullToRefresh.jsx";
import RegrasPontos from "../components/RegrasPontos.jsx";
import { IconBack, IconChevron, IconReceipt } from "../components/icons/ClientIcons.jsx";
import { fetchAutenticado } from "../utils/session.js";
import { mensagemParaUsuario } from "../utils/mensagensUsuario.js";
import { formatarMoeda } from "../utils/moeda.js";
import {
  diasEntre,
  formatarDataNascimentoInput,
  MAX_DIAS_VENDAS,
  parseDataBR,
  periodoMesAtual,
  periodoUltimosDias,
} from "../utils/datas.js";
import { consumirIntentCompras } from "../utils/comprasNavegacao.js";
import "../styles/home.css";
import "../styles/compras.css";

const FILTROS = [
  { id: "mes", label: "Este mês" },
  { id: "7", label: "7 dias" },
  { id: "30", label: "30 dias" },
  { id: "90", label: "90 dias" },
  { id: "custom", label: "Outro" },
];

function formatarUnidade(unidade) {
  if (!unidade) return null;
  if (typeof unidade === "object") {
    return (
      unidade.nome ||
      unidade.descricao ||
      unidade.fantasia ||
      (unidade.codigo != null ? `Loja ${unidade.codigo}` : null)
    );
  }
  const texto = String(unidade).trim();
  return texto ? `Loja ${texto}` : null;
}

function tituloDia(grupo) {
  const br = String(grupo.data || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!br) return grupo.data || "Sem data";
  const date = new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]));
  const diaSemana = date.toLocaleDateString("pt-BR", { weekday: "short" });
  const mes = date.toLocaleDateString("pt-BR", { month: "short" });
  return `${diaSemana.replace(".", "")}, ${br[1]} ${mes.replace(".", "")}`;
}

function dataBadge(grupo) {
  const br = String(grupo.data || "").match(/^(\d{2})\/(\d{2})/);
  return br ? `${br[1]}/${br[2]}` : "—";
}

function ComprasSkeleton() {
  return (
    <div className="compras-skeleton" aria-hidden>
      <div className="compras-skeleton__hero" />
      <div className="compras-skeleton__cards">
        <div className="compras-skeleton__card" />
        <div className="compras-skeleton__card" />
      </div>
      <div className="compras-skeleton__dia" />
      <div className="compras-skeleton__dia" />
      <div className="compras-skeleton__dia compras-skeleton__dia--short" />
    </div>
  );
}

function ProdutoLinha({ produto }) {
  const qtd = produto.quantidade.toLocaleString("pt-BR", {
    maximumFractionDigits: 3,
  });
  const temDesconto = Number(produto.valorDesconto) > 0;

  return (
    <div className={`compras-produto${temDesconto ? " compras-produto--desconto" : ""}`}>
      <div className="compras-produto__corpo">
        <p className="compras-produto__nome">
          {produto.descricao || `Produto ${produto.codigoProduto}`}
        </p>
        <p className="compras-produto__meta">
          <span className="compras-produto__qtd-inline">Qtd. {qtd}</span>
          {produto.codigoBarras && (
            <>
              <span className="compras-produto__sep" aria-hidden>
                ·
              </span>
              <span className="compras-produto__ean">{produto.codigoBarras}</span>
            </>
          )}
          {produto.oferta && (
            <>
              <span className="compras-produto__sep" aria-hidden>
                ·
              </span>
              <span className="compras-badge-oferta">Oferta</span>
            </>
          )}
          {temDesconto && (
            <>
              <span className="compras-produto__sep" aria-hidden>
                ·
              </span>
              <span className="compras-badge-desconto">Desconto</span>
            </>
          )}
        </p>
        {temDesconto && (
          <p className="compras-produto__desconto-detalhe">
            <span className="compras-produto__desconto-par">
              <span className="compras-produto__desconto-label">De</span>
              <span className="compras-produto__valor-bruto">
                {formatarMoeda(produto.valorBruto)}
              </span>
            </span>
            <span className="compras-produto__desconto-par">
              <span className="compras-produto__desconto-label">Desconto</span>
              <span className="compras-produto__desconto-valor">
                −{formatarMoeda(produto.valorDesconto)}
              </span>
            </span>
            <span className="compras-produto__desconto-par compras-produto__desconto-par--final">
              <span className="compras-produto__desconto-label">Total item</span>
              <span className="compras-produto__desconto-final">
                {formatarMoeda(produto.valorLiquido ?? produto.valorTotal)}
              </span>
            </span>
          </p>
        )}
      </div>
      <span className="compras-produto__qtd-col" aria-label={`Quantidade ${qtd}`}>
        {qtd}
      </span>
      <span className="compras-produto__valor-col">
        {temDesconto && (
          <span className="compras-produto__valor-bruto-col">
            {formatarMoeda(produto.valorBruto)}
          </span>
        )}
        <span className="compras-produto__valor">
          {formatarMoeda(produto.valorLiquido ?? produto.valorTotal)}
        </span>
      </span>
    </div>
  );
}

function CupomDescontoResumo({ venda, className = "" }) {
  if (!venda?.temDesconto) return null;

  return (
    <div className={`compras-desconto-resumo${className ? ` ${className}` : ""}`}>
      <div className="compras-desconto-resumo__linha">
        <span>Subtotal do cupom</span>
        <span>{formatarMoeda(venda.subtotal)}</span>
      </div>
      <div className="compras-desconto-resumo__linha compras-desconto-resumo__linha--destaque">
        <span>
          <span className="compras-badge-desconto">Desconto</span>
          {venda.totalDescontoCupom > 0 && venda.totalDesconto > venda.totalDescontoCupom
            ? " no cupom"
            : ""}
        </span>
        <span>−{formatarMoeda(venda.totalDesconto)}</span>
      </div>
      <div className="compras-desconto-resumo__linha compras-desconto-resumo__linha--total">
        <span>Total pago</span>
        <strong>{formatarMoeda(venda.total)}</strong>
      </div>
    </div>
  );
}

function VendaCard({ venda, pontosAtivo = true }) {
  const [aberta, setAberta] = useState(false);
  const loja = formatarUnidade(venda.unidade);
  const semPontos = pontosAtivo && (venda.cancelada || venda.convenio);
  const temDesconto = Boolean(venda.temDesconto);

  return (
    <article
      className={`compras-venda ${aberta ? "compras-venda--aberta" : ""}${semPontos ? " compras-venda--sem-pontos" : ""}${temDesconto ? " compras-venda--desconto" : ""}${venda.cancelada ? " compras-venda--cancelada" : ""}${venda.convenio ? " compras-venda--convenio" : ""}`}
    >
      <button
        type="button"
        className="compras-venda__head"
        onClick={() => setAberta((v) => !v)}
        aria-expanded={aberta}
      >
        <span className="compras-venda__icon" aria-hidden>
          <IconReceipt />
        </span>

        <div className="compras-venda__info">
          <div className="compras-venda__titulo-row">
            <p className="compras-venda__cupom">
              <span className="compras-venda__cupom-label">Cupom</span>
              <span className="compras-venda__cupom-num">{venda.numeroDcto}</span>
            </p>
            {venda.pdv && (
              <span className="compras-venda__pdv">Caixa {venda.pdv}</span>
            )}
          </div>

          {(venda.cancelada || venda.convenio || temDesconto) && (
            <div className="compras-venda__badges">
              {venda.cancelada && (
                <span className="compras-venda__badge-cancelada">Cancelada</span>
              )}
              {venda.convenio && (
                <span className="compras-venda__badge-convenio">Convênio</span>
              )}
              {temDesconto && (
                <span className="compras-venda__badge-desconto">Desconto</span>
              )}
            </div>
          )}

          <p className="compras-venda__sub">
            <span>
              {venda.quantidadeProdutos}{" "}
              {venda.quantidadeProdutos === 1 ? "item" : "itens"}
            </span>
            {loja && <span>{loja}</span>}
            {semPontos && <span className="compras-venda__sub-aviso">Não pontua</span>}
          </p>
        </div>

        <div className="compras-venda__valores">
          {temDesconto && (
            <>
              <div className="compras-venda__valor-row compras-venda__valor-row--muted">
                <span>Subtotal</span>
                <span>{formatarMoeda(venda.subtotal)}</span>
              </div>
              <div className="compras-venda__valor-row compras-venda__valor-row--desconto">
                <span>Desconto</span>
                <span>−{formatarMoeda(venda.totalDesconto)}</span>
              </div>
            </>
          )}
          <div className="compras-venda__valor-row compras-venda__valor-row--total">
            <span>{temDesconto ? "Total pago" : "Total"}</span>
            <strong>{formatarMoeda(venda.total)}</strong>
          </div>
        </div>

        <IconChevron aberto={aberta} className="compras-venda__chevron" />
      </button>
      {aberta && (
        <div className="compras-venda__produtos">
          {temDesconto && <CupomDescontoResumo venda={venda} />}
          <div className="compras-produtos-head" aria-hidden>
            <span>Produto</span>
            <span>Qtd.</span>
            <span>Valor</span>
          </div>
          {venda.produtos.map((p, i) => (
            <ProdutoLinha key={`${p.codigoProduto}-${i}`} produto={p} />
          ))}
        </div>
      )}
    </article>
  );
}

function DiaGrupo({ grupo, abertoInicial, destacado = false, pontosAtivo = true }) {
  const ref = useRef(null);
  const [aberto, setAberto] = useState(abertoInicial || destacado);

  useEffect(() => {
    if (destacado && ref.current) {
      setAberto(true);
      ref.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [destacado]);

  return (
    <section
      ref={ref}
      className={`compras-dia ${aberto ? "compras-dia--aberto" : ""}${destacado ? " compras-dia--destaque" : ""}`}
    >
      <button
        type="button"
        className="compras-dia__head"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
      >
        <span className="compras-dia__badge">{dataBadge(grupo)}</span>
        <span className="compras-dia__texto">
          <span className="compras-dia__data">{tituloDia(grupo)}</span>
          <span className="compras-dia__meta">
            {grupo.quantidadeVendas}{" "}
            {grupo.quantidadeVendas === 1 ? "compra" : "compras"} ·{" "}
            {grupo.totalItens} {grupo.totalItens === 1 ? "item" : "itens"}
            {grupo.quantidadeCanceladas > 0 && (
              <> · {grupo.quantidadeCanceladas} cancelada{grupo.quantidadeCanceladas > 1 ? "s" : ""}</>
            )}
            {grupo.quantidadeConvenio > 0 && (
              <> · {grupo.quantidadeConvenio} convênio{grupo.quantidadeConvenio > 1 ? "s" : ""}</>
            )}
          </span>
        </span>
        <span className="compras-dia__total">
          <span className="compras-dia__total-valor">
            {formatarMoeda(grupo.totalDia)}
          </span>
        </span>
        <IconChevron aberto={aberto} className="compras-chevron" />
      </button>
      {aberto && (
        <div className="compras-dia__lista">
          {grupo.vendas.map((v) => (
            <VendaCard
              key={`${grupo.data}-${v.pdv || ""}-${v.numeroDcto}`}
              venda={v}
              pontosAtivo={pontosAtivo}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export default function ComprasPage({
  onVoltar,
  onInicio,
  tabMode = false,
  pontosAtivo = true,
}) {
  const [navInicial] = useState(() => consumirIntentCompras());
  const autoCustomRef = useRef(
    Boolean(navInicial?.filtro === "custom" && navInicial?.dataini && navInicial?.datafim)
  );
  const [filtro, setFiltro] = useState(() => {
    if (navInicial?.filtro === "custom") return "custom";
    if (navInicial?.filtro) return navInicial.filtro;
    return "mes";
  });
  const [customIni, setCustomIni] = useState(() => navInicial?.dataini || "");
  const [customFim, setCustomFim] = useState(() => navInicial?.datafim || "");
  const [destacarDia, setDestacarDia] = useState(() => navInicial?.destacarDia || null);
  const [busca, setBusca] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dados, setDados] = useState(null);

  const periodoAtual = useMemo(() => {
    if (filtro === "mes") return periodoMesAtual();
    if (filtro === "7") return periodoUltimosDias(7);
    if (filtro === "30") return periodoUltimosDias(30);
    if (filtro === "90") return periodoUltimosDias(90);
    if (customIni && customFim) {
      return { dataini: customIni, datafim: customFim };
    }
    return periodoMesAtual();
  }, [filtro, customIni, customFim]);

  const carregar = useCallback(async () => {
    if (filtro === "custom") {
      const ini = parseDataBR(customIni);
      const fim = parseDataBR(customFim);
      if (!ini || !fim) {
        setError("Informe as duas datas no formato DD/MM/AAAA");
        setLoading(false);
        return;
      }
      if (ini > fim) {
        setError("A data inicial não pode ser depois da final");
        setLoading(false);
        return;
      }
      if (diasEntre(ini, fim) > MAX_DIAS_VENDAS) {
        setError(`O período não pode ultrapassar ${MAX_DIAS_VENDAS} dias`);
        setLoading(false);
        return;
      }
    }

    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({
        dataini: periodoAtual.dataini,
        datafim: periodoAtual.datafim,
      });
      const data = await fetchAutenticado(`/api/cliente/vendas?${params}`);
      setDados(data);
    } catch (err) {
      if (err.code === "UNAUTHORIZED") {
        onVoltar?.();
        return;
      }
      setError(mensagemParaUsuario(err.message));
      setDados(null);
    } finally {
      setLoading(false);
    }
  }, [filtro, customIni, customFim, periodoAtual, onVoltar]);

  useEffect(() => {
    if (filtro === "custom") {
      if (!customIni || !customFim) {
        const padrao = periodoMesAtual();
        setCustomIni(padrao.dataini);
        setCustomFim(padrao.datafim);
        return;
      }
      if (autoCustomRef.current) {
        autoCustomRef.current = false;
        carregar();
      }
      return;
    }
    carregar();
  }, [filtro, carregar]);

  function handleFiltro(id) {
    setFiltro(id);
    setError("");
    setDestacarDia(null);
    if (id === "custom") {
      const padrao = periodoMesAtual();
      setCustomIni(padrao.dataini);
      setCustomFim(padrao.datafim);
    }
  }

  const porDataExibicao = useMemo(() => {
    if (!dados?.porData) return [];
    const termo = busca.trim().toLowerCase();
    if (!termo) return dados.porData;

    return dados.porData
      .map((grupo) => ({
        ...grupo,
        vendas: (grupo.vendas || [])
          .map((venda) => ({
            ...venda,
            produtos: (venda.produtos || []).filter((produto) => {
              const nome = String(produto.descricao || "").toLowerCase();
              const codigo = String(produto.codigoProduto || "");
              const ean = String(produto.codigoBarras || "");
              return (
                nome.includes(termo) ||
                codigo.includes(termo) ||
                ean.includes(termo)
              );
            }),
          }))
          .filter((venda) => venda.produtos.length > 0),
      }))
      .filter((grupo) => grupo.vendas.length > 0);
  }, [dados, busca]);

  const periodoLabel =
    dados?.periodo?.dataini && dados?.periodo?.datafim
      ? `${dados.periodo.dataini} — ${dados.periodo.datafim}`
      : "";

  const resumo = !loading && dados && (
    <section className="compras-resumo" aria-label="Resumo do período">
      <div className="compras-resumo__hero">
        <p className="compras-resumo__hero-label">Total no período</p>
        <p className="compras-resumo__hero-valor">
          {formatarMoeda(dados.resumo.totalGasto)}
        </p>
        {periodoLabel && (
          <p className="compras-resumo__hero-sub">{periodoLabel}</p>
        )}
        {(dados.resumo.totalDescontos > 0 || dados.resumo.totalCanceladas > 0 || dados.resumo.totalConvenio > 0) && (
          <div className="compras-resumo__avisos">
            {dados.resumo.totalDescontos > 0 && (
              <p className="compras-resumo__aviso compras-resumo__aviso--desconto">
                Você economizou {formatarMoeda(dados.resumo.totalDescontos)} em descontos no período
              </p>
            )}
            {dados.resumo.totalCanceladas > 0 && (
              <p className="compras-resumo__aviso compras-resumo__aviso--cancelado">
                {dados.resumo.totalCanceladas}{" "}
                {dados.resumo.totalCanceladas === 1 ? "cupom cancelado" : "cupons cancelados"}{" "}
                no período (fora do total)
              </p>
            )}
            {dados.resumo.totalConvenio > 0 && (
              <p className="compras-resumo__aviso compras-resumo__aviso--convenio">
                {dados.resumo.totalConvenio}{" "}
                {dados.resumo.totalConvenio === 1 ? "cupom em convênio" : "cupons em convênio"}{" "}
                no período (fora do total)
              </p>
            )}
          </div>
        )}
      </div>
      <div className="compras-resumo__stats">
        <div className="compras-resumo__card">
          <span className="compras-resumo__card-valor">
            {dados.resumo.totalVendas}
          </span>
          <span className="compras-resumo__card-label">
            {dados.resumo.totalVendas === 1 ? "Compra" : "Compras"}
          </span>
        </div>
        <div className="compras-resumo__card">
          <span className="compras-resumo__card-valor">
            {dados.resumo.totalItens}
          </span>
          <span className="compras-resumo__card-label">Itens</span>
        </div>
        <div className="compras-resumo__card">
          <span className="compras-resumo__card-valor">
            {formatarMoeda(dados.resumo.ticketMedio)}
          </span>
          <span className="compras-resumo__card-label">Média por compra</span>
        </div>
      </div>
    </section>
  );

  return (
    <div className={`compras-app${tabMode ? " compras-app--tab" : ""}`}>
      {tabMode ? (
        <ClientTabHeader title="Minhas compras" onInicio={onInicio} />
      ) : (
        <header className="compras-header">
          <div className="compras-header__inner">
            <button
              type="button"
              className="compras-header__back"
              onClick={onVoltar}
              aria-label="Voltar para início"
            >
              <IconBack />
              <span>Voltar</span>
            </button>
            <div className="compras-header__brand">
              <Logo variant="header" className="compras-header__logo" />
              <div>
                <p className="compras-header__tag">Clube Superama+</p>
                <h1 className="compras-header__title">Minhas compras</h1>
              </div>
            </div>
          </div>
        </header>
      )}

      <PullToRefresh onRefresh={carregar} disabled={loading}>
      <div className="compras-shell">
        <aside className="compras-sidebar">
          <section className="compras-filtros">
            <h2 className="compras-filtros__titulo">Período</h2>
            {dados?.dataInicioPlataforma && (
              <p className="compras-plataforma-nota">
                Compras exibidas a partir do seu cadastro no clube (
                {dados.dataInicioPlataforma}).
              </p>
            )}
            <div
              className="compras-filtros__chips"
              role="tablist"
              aria-label="Período"
            >
              {FILTROS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  role="tab"
                  aria-selected={filtro === f.id}
                  className={`compras-chip ${filtro === f.id ? "compras-chip--ativo" : ""}`}
                  onClick={() => handleFiltro(f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {filtro === "custom" && (
              <div className="compras-periodo-custom">
                <div className="compras-periodo-custom__row">
                  <div className="compras-periodo-custom__field">
                    <label htmlFor="vendas-ini">De</label>
                    <input
                      id="vendas-ini"
                      type="text"
                      inputMode="numeric"
                      placeholder="DD/MM/AAAA"
                      value={customIni}
                      onChange={(e) =>
                        setCustomIni(formatarDataNascimentoInput(e.target.value))
                      }
                    />
                  </div>
                  <div className="compras-periodo-custom__field">
                    <label htmlFor="vendas-fim">Até</label>
                    <input
                      id="vendas-fim"
                      type="text"
                      inputMode="numeric"
                      placeholder="DD/MM/AAAA"
                      value={customFim}
                      onChange={(e) =>
                        setCustomFim(formatarDataNascimentoInput(e.target.value))
                      }
                    />
                  </div>
                </div>
                <p className="compras-periodo-custom__hint">
                  Máximo de {MAX_DIAS_VENDAS} dias entre as datas.
                </p>
                <button
                  type="button"
                  className="home-btn home-btn--primary compras-periodo-custom__btn"
                  onClick={carregar}
                >
                  Buscar período
                </button>
              </div>
            )}

            {pontosAtivo && <RegrasPontos compact />}
          </section>

          {resumo}
        </aside>

        <div className="compras-content">
          <main className="compras-main">
            {error && (
              <div className="compras-alert" role="alert">
                <p>{error}</p>
                <button
                  type="button"
                  className="compras-alert__retry"
                  onClick={carregar}
                >
                  Tentar novamente
                </button>
              </div>
            )}

            {loading && (
              <div
                className="compras-loading"
                aria-busy="true"
                aria-live="polite"
              >
                <span className="home-loading__spinner" />
                <p>Carregando suas compras…</p>
                <ComprasSkeleton />
              </div>
            )}

            {!loading && dados && (
              <>
                {dados.porData.length === 0 ? (
                  <EmptyState
                    icon={<IconReceipt size={28} />}
                    title="Nenhuma compra neste período"
                    description="Quando você comprar na loja após seu cadastro no clube, seus cupons aparecerão aqui organizados por dia."
                    actionLabel={pontosAtivo ? "Regras do programa" : undefined}
                    onAction={pontosAtivo ? () => onVoltar?.() : undefined}
                  />
                ) : (
                  <>
                    <div className="compras-busca">
                      <label className="compras-busca__label" htmlFor="compras-busca-input">
                        Buscar produto
                      </label>
                      <div className="compras-busca__wrap">
                        <input
                          id="compras-busca-input"
                          type="search"
                          className="compras-busca__input"
                          placeholder="Nome, código ou código de barras…"
                          value={busca}
                          onChange={(e) => setBusca(e.target.value)}
                          autoComplete="off"
                        />
                        {busca && (
                          <button
                            type="button"
                            className="compras-busca__limpar"
                            onClick={() => setBusca("")}
                            aria-label="Limpar busca"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </div>

                    {porDataExibicao.length === 0 ? (
                      <EmptyState
                        icon={<IconReceipt size={28} />}
                        title="Nenhum produto encontrado"
                        description={`Não encontramos "${busca.trim()}" nos cupons deste período. Tente outro nome ou código.`}
                        actionLabel="Limpar busca"
                        onAction={() => setBusca("")}
                      />
                    ) : (
                      <div className="compras-timeline">
                        <header className="compras-timeline__header">
                          <h2 className="compras-timeline__titulo">
                            {busca ? "Resultados da busca" : "Histórico por dia"}
                          </h2>
                          <p className="compras-timeline__sub">
                            {porDataExibicao.reduce((acc, g) => acc + g.vendas.length, 0)}{" "}
                            {porDataExibicao.reduce((acc, g) => acc + g.vendas.length, 0) === 1
                              ? "compra"
                              : "compras"}
                            {busca ? ` com "${busca.trim()}"` : " no período selecionado"}
                          </p>
                        </header>

                        {porDataExibicao.map((grupo, index) => (
                          <DiaGrupo
                            key={grupo.data}
                            grupo={grupo}
                            abertoInicial={index === 0 && !destacarDia}
                            destacado={destacarDia === grupo.data}
                            pontosAtivo={pontosAtivo}
                          />
                        ))}
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </main>
        </div>
      </div>
      </PullToRefresh>
    </div>
  );
}
