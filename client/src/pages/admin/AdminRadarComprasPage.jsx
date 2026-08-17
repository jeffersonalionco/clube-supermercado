import { useCallback, useEffect, useMemo, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout.jsx";
import { clearAdminSession, fetchAdmin } from "../../utils/adminSession.js";
import { formatarCpfCnpj } from "../../utils/cpf.js";
import { formatarMoeda } from "../../utils/moeda.js";
import { mensagemParaUsuario } from "../../utils/mensagensUsuario.js";

function dataLocalInput(data) {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function intervaloRapido(tipo) {
  const fim = new Date();
  fim.setHours(12, 0, 0, 0);
  const inicio = new Date(fim);

  if (tipo === "hoje") {
    /* same day */
  } else if (tipo === "ultimos7") {
    inicio.setDate(inicio.getDate() - 6);
  } else if (tipo === "ultimos30") {
    inicio.setDate(inicio.getDate() - 29);
  } else if (tipo === "mes") {
    inicio.setDate(1);
  } else {
    return { inicio: "", fim: "" };
  }

  return {
    inicio: dataLocalInput(inicio),
    fim: dataLocalInput(fim),
  };
}

const OPCOES_PERIODO = [
  { id: "hoje", label: "Hoje" },
  { id: "ultimos7", label: "7 dias" },
  { id: "ultimos30", label: "30 dias" },
  { id: "mes", label: "Este mês" },
  { id: "custom", label: "Personalizado" },
];

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

export default function AdminRadarComprasPage({
  tab,
  onTabChange,
  onLogout,
  admin,
  onVoltarHub,
}) {
  const padrao = useMemo(() => intervaloRapido("ultimos30"), []);
  const [periodoTipo, setPeriodoTipo] = useState("ultimos30");
  const [dataInicio, setDataInicio] = useState(padrao.inicio);
  const [dataFim, setDataFim] = useState(padrao.fim);
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copiado, setCopiado] = useState("");

  const carregar = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        dataInicio,
        dataFim,
      });
      const data = await fetchAdmin(
        `/api/admin/relatorio/radar-compras?${params}`
      );
      setDados(data);
    } catch (err) {
      if (err.code === "UNAUTHORIZED") {
        clearAdminSession();
        onLogout();
        return;
      }
      setError(mensagemParaUsuario(err.message));
    } finally {
      setLoading(false);
    }
  }, [dataInicio, dataFim, onLogout]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  function handlePeriodo(tipo) {
    setPeriodoTipo(tipo);
    if (tipo === "custom") return;
    const intervalo = intervaloRapido(tipo);
    setDataInicio(intervalo.inicio);
    setDataFim(intervalo.fim);
  }

  async function copiarEmails() {
    const lista = dados?.emailsInativos || [];
    if (!lista.length) {
      setCopiado("Nenhum e-mail disponível na lista de inativos.");
      return;
    }
    try {
      await navigator.clipboard.writeText(lista.join("\n"));
      setCopiado(`${lista.length} e-mail(s) copiado(s) — cole no Marketing.`);
    } catch {
      setCopiado("Não foi possível copiar. Selecione a lista manualmente.");
    }
  }

  function handleSair() {
    clearAdminSession();
    onLogout();
  }

  const kpis = dados?.kpis;

  return (
    <AdminLayout tab={tab} onTabChange={onTabChange} onLogout={handleSair} admin={admin}>
      <div className="admin-relatorio-stack">
        <header className="admin-page-head">
          <div>
            <button
              type="button"
              className="admin-btn admin-btn--ghost admin-btn--sm"
              onClick={onVoltarHub}
            >
              ← Relatórios
            </button>
            <h1>Radar de Compras</h1>
            <p>
              Visão rápida do relacionamento pelo caixa: faturamento, ticket,
              quem está ativo e quem precisa de reativação.
            </p>
          </div>
        </header>

        <form
          className="admin-relatorio-filtros admin-card"
          onSubmit={(e) => {
            e.preventDefault();
            carregar();
          }}
        >
          <div className="admin-marketing-tabs" role="tablist" aria-label="Período">
            {OPCOES_PERIODO.map((op) => (
              <button
                key={op.id}
                type="button"
                className={`admin-mkt-editor__btn${
                  periodoTipo === op.id ? " is-upload" : ""
                }`}
                onClick={() => handlePeriodo(op.id)}
              >
                {op.label}
              </button>
            ))}
          </div>

          {periodoTipo === "custom" && (
            <div className="admin-form__row" style={{ marginTop: "0.75rem" }}>
              <label className="admin-mkt-modal__field">
                De
                <input
                  type="date"
                  value={dataInicio}
                  onChange={(e) => setDataInicio(e.target.value)}
                />
              </label>
              <label className="admin-mkt-modal__field">
                Até
                <input
                  type="date"
                  value={dataFim}
                  onChange={(e) => setDataFim(e.target.value)}
                />
              </label>
            </div>
          )}

          <div className="admin-relatorio-filtros__acoes">
            <button
              type="submit"
              className="admin-btn admin-btn--primary"
              disabled={loading}
            >
              {loading ? "Atualizando…" : "Atualizar painel"}
            </button>
            {dados?.geradoEm ? (
              <span className="admin-relatorio-nota">
                Gerado em {formatarDataHora(dados.geradoEm)}
                {dados.periodo
                  ? ` · período ${dados.periodo.dataini} a ${dados.periodo.datafim}`
                  : ""}
              </span>
            ) : null}
          </div>
        </form>

        {error && (
          <p className="admin-alert" role="alert">
            {error}
          </p>
        )}

        <div className="admin-usuarios-stats" aria-label="Indicadores do radar">
          <article className="admin-usuarios-stat admin-usuarios-stat--saldo">
            <span className="admin-usuarios-stat__valor">
              {loading && !kpis ? "—" : formatarMoeda(kpis?.faturamentoMembros)}
            </span>
            <span className="admin-usuarios-stat__label">
              Faturamento membros
            </span>
          </article>
          <article className="admin-usuarios-stat">
            <span className="admin-usuarios-stat__valor">
              {loading && !kpis ? "—" : formatarMoeda(kpis?.ticketMedio)}
            </span>
            <span className="admin-usuarios-stat__label">Ticket médio</span>
          </article>
          <article className="admin-usuarios-stat">
            <span className="admin-usuarios-stat__valor">
              {loading && !kpis ? "—" : kpis?.membrosAtivos30d ?? 0}
            </span>
            <span className="admin-usuarios-stat__label">
              Ativos (30 dias)
            </span>
          </article>
          <article className="admin-usuarios-stat admin-usuarios-stat--filtro">
            <span className="admin-usuarios-stat__valor">
              {loading && !kpis ? "—" : kpis?.inativos60d ?? 0}
            </span>
            <span className="admin-usuarios-stat__label">
              Inativos (60+ dias)
            </span>
          </article>
        </div>

        {dados?.notas && (
          <p className="admin-relatorio-nota">
            {dados.notas.faturamento} {dados.notas.ativos}
          </p>
        )}

        <div className="admin-relatorio-grid">
          <section className="admin-card">
            <header className="admin-card__head">
              <div>
                <h2>Top 10 produtos</h2>
                <p className="admin-card__sub admin-card__sub--tight">
                  Mais vendidos entre membros no período
                </p>
              </div>
            </header>
            {loading && !dados ? (
              <p className="admin-usuarios-loading">Carregando…</p>
            ) : !(dados?.topProdutos || []).length ? (
              <p className="admin-usuarios-loading">Sem produtos no período.</p>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Produto</th>
                      <th>Qtd</th>
                      <th>Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dados.topProdutos.map((p, i) => (
                      <tr key={`${p.codigo || p.descricao}-${i}`}>
                        <td>{i + 1}</td>
                        <td>
                          <strong>{p.descricao || "—"}</strong>
                          {p.codigo ? (
                            <div className="admin-relatorio-nota">{p.codigo}</div>
                          ) : null}
                        </td>
                        <td>
                          {Number(p.quantidade || 0).toLocaleString("pt-BR", {
                            maximumFractionDigits: 3,
                          })}
                        </td>
                        <td>{formatarMoeda(p.valorTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="admin-card">
            <header className="admin-card__head">
              <div>
                <h2>Inativos 60+ dias</h2>
                <p className="admin-card__sub admin-card__sub--tight">
                  Lista para campanha de e-mail / reativação
                </p>
              </div>
              <button
                type="button"
                className="admin-btn admin-btn--ghost admin-btn--sm"
                onClick={copiarEmails}
                disabled={!dados?.emailsInativos?.length}
              >
                Copiar e-mails
              </button>
            </header>
            {copiado ? (
              <p className="admin-success" role="status">
                {copiado}
              </p>
            ) : null}
            {dados?.notas?.inativos ? (
              <p className="admin-relatorio-nota">{dados.notas.inativos}</p>
            ) : null}
            {loading && !dados ? (
              <p className="admin-usuarios-loading">Carregando…</p>
            ) : !(dados?.inativos || []).length ? (
              <p className="admin-usuarios-loading">
                Nenhum inativo neste critério. Bom sinal.
              </p>
            ) : (
              <div className="admin-table-wrap admin-table-wrap--scroll">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Nome</th>
                      <th>E-mail</th>
                      <th>Dias sem compra</th>
                      <th>CPF</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dados.inativos.map((item) => (
                      <tr key={item.cpf}>
                        <td>{item.nome}</td>
                        <td>{item.email || "—"}</td>
                        <td>
                          {item.diasSemCompra == null
                            ? "Sem compra recente"
                            : item.diasSemCompra}
                        </td>
                        <td>{formatarCpfCnpj(item.cpf)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {dados?.emailsInativos?.length ? (
              <p className="admin-relatorio-nota">
                {dados.emailsInativos.length} e-mail(s) elegível(is) para
                Marketing → E-mails específicos.
              </p>
            ) : null}
          </section>
        </div>
      </div>
    </AdminLayout>
  );
}
