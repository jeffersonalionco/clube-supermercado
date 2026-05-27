import { useCallback, useEffect, useMemo, useState } from "react";
import Logo from "../components/Logo.jsx";
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
import "../styles/home.css";
import "../styles/compras.css";

const FILTROS = [
  { id: "mes", label: "Este mês" },
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

function IconBack() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M15 6l-6 6 6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconReceipt() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 2h12v20l-2-1.5L14 22l-2-1.5L10 22 8 20.5 6 22V2z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M9 7h6M9 11h6M9 15h4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconChevron({ aberto }) {
  return (
    <svg
      className={`compras-chevron ${aberto ? "compras-chevron--aberto" : ""}`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <path
        d="M6 9l6 6 6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
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

  return (
    <div className="compras-produto">
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
        </p>
      </div>
      <span className="compras-produto__qtd-col" aria-label={`Quantidade ${qtd}`}>
        {qtd}
      </span>
      <span className="compras-produto__valor">{formatarMoeda(produto.valorTotal)}</span>
    </div>
  );
}

function VendaCard({ venda }) {
  const [aberta, setAberta] = useState(false);
  const loja = formatarUnidade(venda.unidade);

  return (
    <article className={`compras-venda ${aberta ? "compras-venda--aberta" : ""}`}>
      <button
        type="button"
        className="compras-venda__head"
        onClick={() => setAberta((v) => !v)}
        aria-expanded={aberta}
      >
        <span className="compras-venda__icon">
          <IconReceipt />
        </span>
        <span className="compras-venda__info">
          <p className="compras-venda__cupom">Cupom {venda.numeroDcto}</p>
          <p className="compras-venda__sub">
            {venda.quantidadeProdutos}{" "}
            {venda.quantidadeProdutos === 1 ? "item" : "itens"}
            {loja ? ` · ${loja}` : ""}
          </p>
        </span>
        <span className="compras-venda__valor">{formatarMoeda(venda.total)}</span>
        <IconChevron aberto={aberta} />
      </button>
      {aberta && (
        <div className="compras-venda__produtos">
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

function DiaGrupo({ grupo, abertoInicial }) {
  const [aberto, setAberto] = useState(abertoInicial);

  return (
    <section className={`compras-dia ${aberto ? "compras-dia--aberto" : ""}`}>
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
          </span>
        </span>
        <span className="compras-dia__total">
          <span className="compras-dia__total-valor">
            {formatarMoeda(grupo.totalDia)}
          </span>
        </span>
        <IconChevron aberto={aberto} />
      </button>
      {aberto && (
        <div className="compras-dia__lista">
          {grupo.vendas.map((v) => (
            <VendaCard key={`${grupo.data}-${v.numeroDcto}`} venda={v} />
          ))}
        </div>
      )}
    </section>
  );
}

export default function ComprasPage({ onVoltar }) {
  const [filtro, setFiltro] = useState("mes");
  const [customIni, setCustomIni] = useState("");
  const [customFim, setCustomFim] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dados, setDados] = useState(null);

  const periodoAtual = useMemo(() => {
    if (filtro === "mes") return periodoMesAtual();
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
      }
      return;
    }
    carregar();
  }, [filtro, carregar]);

  function handleFiltro(id) {
    setFiltro(id);
    setError("");
    if (id === "custom") {
      const padrao = periodoMesAtual();
      setCustomIni(padrao.dataini);
      setCustomFim(padrao.datafim);
    }
  }

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
    <div className="compras-app">
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

      <div className="compras-shell">
        <aside className="compras-sidebar">
          <section className="compras-filtros">
            <h2 className="compras-filtros__titulo">Período</h2>
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
                  <div className="compras-empty">
                    <div className="compras-empty__icon" aria-hidden>
                      <IconReceipt />
                    </div>
                    <h2>Nenhuma compra neste período</h2>
                    <p>
                      Quando você comprar na loja, seus cupons aparecerão aqui
                      organizados por dia.
                    </p>
                  </div>
                ) : (
                  <div className="compras-timeline">
                    <header className="compras-timeline__header">
                      <h2 className="compras-timeline__titulo">
                        Histórico por dia
                      </h2>
                      <p className="compras-timeline__sub">
                        {dados.resumo.totalVendas}{" "}
                        {dados.resumo.totalVendas === 1
                          ? "compra"
                          : "compras"}{" "}
                        no período selecionado
                      </p>
                    </header>
                    {dados.porData.map((grupo, index) => (
                      <DiaGrupo
                        key={grupo.data}
                        grupo={grupo}
                        abertoInicial={index === 0}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
