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
  if (tipo === "ultimos7") inicio.setDate(inicio.getDate() - 6);
  else if (tipo === "ultimos30") inicio.setDate(inicio.getDate() - 29);
  else if (tipo === "ultimos90") inicio.setDate(inicio.getDate() - 89);
  else return { inicio: "", fim: "" };
  return { inicio: dataLocalInput(inicio), fim: dataLocalInput(fim) };
}

const OPCOES_PERIODO = [
  { id: "ultimos7", label: "7 dias" },
  { id: "ultimos30", label: "30 dias" },
  { id: "ultimos90", label: "90 dias" },
  { id: "custom", label: "Personalizado" },
];

const FILTROS_LISTA = [
  { id: "todos", label: "Todos" },
  { id: "sem_compra", label: "Sem compra" },
  { id: "primeira_compra", label: "Só 1 compra" },
  { id: "segunda_compra", label: "2+ compras" },
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

function formatarDataCurta(valor) {
  if (!valor) return "—";
  try {
    return new Date(valor).toLocaleDateString("pt-BR");
  } catch {
    return "—";
  }
}

export default function AdminFunilNovosMembrosPage({
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
  const [filtro, setFiltro] = useState("sem_compra");
  const [copiado, setCopiado] = useState("");

  const carregar = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ dataInicio, dataFim });
      const data = await fetchAdmin(
        `/api/admin/relatorio/funil-novos-membros?${params}`
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

  const membrosFiltrados = useMemo(() => {
    const lista = dados?.membros || [];
    if (filtro === "todos") return lista;
    return lista.filter((m) => m.estagio === filtro);
  }, [dados, filtro]);

  const emailsFiltrados = useMemo(() => {
    if (filtro === "sem_compra") return dados?.emailsSemCompra || [];
    if (filtro === "primeira_compra") return dados?.emailsUmaCompra || [];
    if (filtro === "segunda_compra") return dados?.emailsEngajados || [];
    return [
      ...new Set(
        (dados?.membros || []).map((m) => m.email).filter(Boolean)
      ),
    ];
  }, [dados, filtro]);

  async function copiarEmails() {
    if (!emailsFiltrados.length) {
      setCopiado("Nenhum e-mail neste filtro.");
      return;
    }
    try {
      await navigator.clipboard.writeText(emailsFiltrados.join("\n"));
      setCopiado(`${emailsFiltrados.length} e-mail(s) copiado(s).`);
    } catch {
      setCopiado("Não foi possível copiar.");
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
            <h1>Funil de novos membros</h1>
            <p>
              Cadastro → 1ª compra → 2ª compra. Conversão e listas para ativação
              e conteúdo de hábito.
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
          <div className="admin-marketing-tabs" role="tablist" aria-label="Período de cadastro">
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
              {loading ? "Atualizando…" : "Atualizar funil"}
            </button>
            {dados?.geradoEm ? (
              <span className="admin-relatorio-nota">
                Gerado em {formatarDataHora(dados.geradoEm)}
                {dados.periodo
                  ? ` · cadastros ${dados.periodo.dataini} a ${dados.periodo.datafim}`
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

        <div className="admin-usuarios-stats" aria-label="KPIs do funil">
          <article className="admin-usuarios-stat admin-usuarios-stat--saldo">
            <span className="admin-usuarios-stat__valor">
              {loading && !kpis ? "—" : kpis?.cadastrados ?? 0}
            </span>
            <span className="admin-usuarios-stat__label">Cadastrados</span>
          </article>
          <article className="admin-usuarios-stat">
            <span className="admin-usuarios-stat__valor">
              {loading && !kpis ? "—" : `${kpis?.conversao1aPct ?? 0}%`}
            </span>
            <span className="admin-usuarios-stat__label">→ 1ª compra</span>
          </article>
          <article className="admin-usuarios-stat">
            <span className="admin-usuarios-stat__valor">
              {loading && !kpis ? "—" : `${kpis?.conversao2aPct ?? 0}%`}
            </span>
            <span className="admin-usuarios-stat__label">
              1ª → 2ª (dos que compraram)
            </span>
          </article>
          <article className="admin-usuarios-stat admin-usuarios-stat--filtro">
            <span className="admin-usuarios-stat__valor">
              {loading && !kpis
                ? "—"
                : kpis?.tempoMedioAte1aCompraDias != null
                  ? `${kpis.tempoMedioAte1aCompraDias}d`
                  : "—"}
            </span>
            <span className="admin-usuarios-stat__label">Média até 1ª compra</span>
          </article>
        </div>

        {dados?.insights?.length ? (
          <section className="admin-card admin-rfm-insights">
            <header className="admin-card__head">
              <div>
                <h2>Conclusões p/ marketing e editorial</h2>
              </div>
            </header>
            <ul className="admin-rfm-insights__lista">
              {dados.insights.map((tip, i) => (
                <li key={i}>
                  <span className="admin-rfm-insights__tag">{tip.tipo}</span>
                  {tip.texto}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="admin-card">
          <header className="admin-card__head">
            <div>
              <h2>Tempo até a 1ª compra</h2>
            </div>
          </header>
          {loading && !dados ? (
            <p className="admin-usuarios-loading">Carregando…</p>
          ) : (
            <div className="admin-rfm-grid">
              {(dados?.funil?.porFaixa || []).map((f) => (
                <div key={f.faixa} className="admin-rfm-seg" style={{ cursor: "default" }}>
                  <strong className="admin-rfm-seg__titulo">{f.label}</strong>
                  <span className="admin-rfm-seg__qtd">{f.quantidade}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="admin-card">
          <header className="admin-card__head">
            <div>
              <h2>Listas para campanha</h2>
              <p className="admin-card__sub admin-card__sub--tight">
                {dados?.notas?.uso}
              </p>
            </div>
            <button
              type="button"
              className="admin-btn admin-btn--ghost admin-btn--sm"
              onClick={copiarEmails}
              disabled={!emailsFiltrados.length}
            >
              Copiar e-mails ({emailsFiltrados.length})
            </button>
          </header>

          <div className="admin-marketing-tabs" style={{ marginBottom: "0.75rem" }}>
            {FILTROS_LISTA.map((f) => (
              <button
                key={f.id}
                type="button"
                className={`admin-mkt-editor__btn${
                  filtro === f.id ? " is-upload" : ""
                }`}
                onClick={() => {
                  setFiltro(f.id);
                  setCopiado("");
                }}
              >
                {f.label}
                {f.id === "sem_compra" && dados
                  ? ` (${dados.kpis?.semCompra ?? 0})`
                  : ""}
                {f.id === "primeira_compra" && dados
                  ? ` (${dados.kpis?.apenasUmaCompra ?? 0})`
                  : ""}
                {f.id === "segunda_compra" && dados
                  ? ` (${dados.kpis?.comSegundaCompra ?? 0})`
                  : ""}
              </button>
            ))}
          </div>

          {copiado ? (
            <p className="admin-success" role="status">
              {copiado}
            </p>
          ) : null}

          {!membrosFiltrados.length ? (
            <p className="admin-usuarios-loading">Nenhum membro neste filtro.</p>
          ) : (
            <div className="admin-table-wrap admin-table-wrap--scroll">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>E-mail</th>
                    <th>Cadastro</th>
                    <th>1ª compra</th>
                    <th>Dias</th>
                    <th>Cupons</th>
                    <th>Gasto</th>
                    <th>CPF</th>
                  </tr>
                </thead>
                <tbody>
                  {membrosFiltrados.map((item) => (
                    <tr key={item.cpf}>
                      <td>{item.nome}</td>
                      <td>{item.email || "—"}</td>
                      <td>{formatarDataCurta(item.cadastradoEm)}</td>
                      <td>{formatarDataCurta(item.primeiraCompra)}</td>
                      <td>
                        {item.diasAtePrimeiraCompra == null
                          ? "—"
                          : item.diasAtePrimeiraCompra}
                      </td>
                      <td>{item.quantidadeCupons}</td>
                      <td>{formatarMoeda(item.gastoDesdeCadastro)}</td>
                      <td>{formatarCpfCnpj(item.cpf)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </AdminLayout>
  );
}
