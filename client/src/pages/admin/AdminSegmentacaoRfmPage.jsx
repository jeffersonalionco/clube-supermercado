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

  if (tipo === "ultimos30") {
    inicio.setDate(inicio.getDate() - 29);
  } else if (tipo === "ultimos90") {
    inicio.setDate(inicio.getDate() - 89);
  } else if (tipo === "ultimos180") {
    inicio.setDate(inicio.getDate() - 179);
  } else if (tipo === "ultimos365") {
    inicio.setDate(inicio.getDate() - 364);
  } else {
    return { inicio: "", fim: "" };
  }

  return {
    inicio: dataLocalInput(inicio),
    fim: dataLocalInput(fim),
  };
}

const OPCOES_PERIODO = [
  { id: "ultimos30", label: "30 dias" },
  { id: "ultimos90", label: "90 dias" },
  { id: "ultimos180", label: "180 dias" },
  { id: "ultimos365", label: "12 meses" },
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

function formatarDataCurta(valor) {
  if (!valor) return "—";
  try {
    return new Date(valor).toLocaleDateString("pt-BR");
  } catch {
    return "—";
  }
}

export default function AdminSegmentacaoRfmPage({
  tab,
  onTabChange,
  onLogout,
  admin,
  onVoltarHub,
}) {
  const padrao = useMemo(() => intervaloRapido("ultimos90"), []);
  const [periodoTipo, setPeriodoTipo] = useState("ultimos90");
  const [dataInicio, setDataInicio] = useState(padrao.inicio);
  const [dataFim, setDataFim] = useState(padrao.fim);
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [segmentoAtivo, setSegmentoAtivo] = useState(null);
  const [copiado, setCopiado] = useState("");

  const carregar = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ dataInicio, dataFim });
      const data = await fetchAdmin(
        `/api/admin/relatorio/segmentacao-rfm?${params}`
      );
      setDados(data);
      setSegmentoAtivo((atual) => {
        if (atual && data.segmentos?.some((s) => s.id === atual)) return atual;
        const primeiro =
          data.segmentos?.find((s) => s.id !== "sem_compra" && s.quantidade) ||
          data.segmentos?.[0];
        return primeiro?.id || null;
      });
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

  const segmentoSelecionado = useMemo(() => {
    if (!dados?.segmentos || !segmentoAtivo) return null;
    return dados.segmentos.find((s) => s.id === segmentoAtivo) || null;
  }, [dados, segmentoAtivo]);

  const membrosFiltrados = useMemo(() => {
    if (!dados?.membros || !segmentoAtivo) return [];
    return dados.membros.filter((m) => m.segmentoId === segmentoAtivo);
  }, [dados, segmentoAtivo]);

  async function copiarEmails() {
    const lista = segmentoSelecionado?.emails || [];
    if (!lista.length) {
      setCopiado("Nenhum e-mail neste segmento.");
      return;
    }
    try {
      await navigator.clipboard.writeText(lista.join("\n"));
      setCopiado(
        `${lista.length} e-mail(s) de “${segmentoSelecionado.titulo}” copiado(s).`
      );
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
            <h1>Segmentação RFM</h1>
            <p>
              Recência, frequência e valor — grupos prontos para campanha de
              e-mail e priorização comercial.
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
              {loading ? "Atualizando…" : "Atualizar segmentação"}
            </button>
            {dados?.geradoEm ? (
              <span className="admin-relatorio-nota">
                Gerado em {formatarDataHora(dados.geradoEm)}
                {dados.periodo
                  ? ` · ${dados.periodo.dataini} a ${dados.periodo.datafim}`
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

        <div className="admin-usuarios-stats" aria-label="Resumo RFM">
          <article className="admin-usuarios-stat admin-usuarios-stat--saldo">
            <span className="admin-usuarios-stat__valor">
              {loading && !kpis ? "—" : kpis?.membrosComCompra ?? 0}
            </span>
            <span className="admin-usuarios-stat__label">Com compra</span>
          </article>
          <article className="admin-usuarios-stat">
            <span className="admin-usuarios-stat__valor">
              {loading && !kpis ? "—" : formatarMoeda(kpis?.faturamentoPeriodo)}
            </span>
            <span className="admin-usuarios-stat__label">Faturamento período</span>
          </article>
          <article className="admin-usuarios-stat">
            <span className="admin-usuarios-stat__valor">
              {loading && !kpis
                ? "—"
                : `${kpis?.mediaR ?? "—"} / ${kpis?.mediaF ?? "—"} / ${kpis?.mediaM ?? "—"}`}
            </span>
            <span className="admin-usuarios-stat__label">Médias R / F / M</span>
          </article>
          <article className="admin-usuarios-stat admin-usuarios-stat--filtro">
            <span className="admin-usuarios-stat__valor">
              {loading && !kpis ? "—" : kpis?.membrosSemCompra ?? 0}
            </span>
            <span className="admin-usuarios-stat__label">Sem compra</span>
          </article>
        </div>

        {dados?.notas?.metodo ? (
          <p className="admin-relatorio-nota">{dados.notas.metodo}</p>
        ) : null}

        <section className="admin-card">
          <header className="admin-card__head">
            <div>
              <h2>Segmentos</h2>
              <p className="admin-card__sub admin-card__sub--tight">
                Clique em um grupo para ver a lista e copiar e-mails
              </p>
            </div>
          </header>

          {loading && !dados ? (
            <p className="admin-usuarios-loading">Carregando…</p>
          ) : !(dados?.segmentos || []).length ? (
            <p className="admin-usuarios-loading">Sem dados no período.</p>
          ) : (
            <div className="admin-rfm-grid" role="list">
              {dados.segmentos.map((seg) => {
                const ativo = seg.id === segmentoAtivo;
                return (
                  <button
                    key={seg.id}
                    type="button"
                    role="listitem"
                    className={`admin-rfm-seg${ativo ? " is-ativo" : ""}`}
                    onClick={() => {
                      setSegmentoAtivo(seg.id);
                      setCopiado("");
                    }}
                  >
                    <strong className="admin-rfm-seg__titulo">{seg.titulo}</strong>
                    <span className="admin-rfm-seg__qtd">{seg.quantidade}</span>
                    <span className="admin-rfm-seg__meta">
                      {seg.percentualMembros}% · {formatarMoeda(seg.faturamento)}
                    </span>
                    <span className="admin-rfm-seg__desc">{seg.descricao}</span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {segmentoSelecionado ? (
          <section className="admin-card">
            <header className="admin-card__head">
              <div>
                <h2>{segmentoSelecionado.titulo}</h2>
                <p className="admin-card__sub admin-card__sub--tight">
                  {segmentoSelecionado.descricao}
                  {segmentoSelecionado.acao
                    ? ` · Sugestão: ${segmentoSelecionado.acao}`
                    : ""}
                </p>
              </div>
              <button
                type="button"
                className="admin-btn admin-btn--ghost admin-btn--sm"
                onClick={copiarEmails}
                disabled={!segmentoSelecionado.emailsDisponiveis}
              >
                Copiar e-mails ({segmentoSelecionado.emailsDisponiveis || 0})
              </button>
            </header>

            {copiado ? (
              <p className="admin-success" role="status">
                {copiado}
              </p>
            ) : null}

            {dados?.notas?.uso ? (
              <p className="admin-relatorio-nota">{dados.notas.uso}</p>
            ) : null}

            {!membrosFiltrados.length ? (
              <p className="admin-usuarios-loading">Nenhum membro neste segmento.</p>
            ) : (
              <div className="admin-table-wrap admin-table-wrap--scroll">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Nome</th>
                      <th>E-mail</th>
                      <th>R/F/M</th>
                      <th>Dias</th>
                      <th>Cupons</th>
                      <th>Gasto</th>
                      <th>Última compra</th>
                      <th>CPF</th>
                    </tr>
                  </thead>
                  <tbody>
                    {membrosFiltrados.map((item) => (
                      <tr key={item.cpf}>
                        <td>{item.nome}</td>
                        <td>{item.email || "—"}</td>
                        <td>
                          {item.rfm ? (
                            <code className="admin-rfm-code">{item.rfm}</code>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>
                          {item.recenciaDias == null ? "—" : item.recenciaDias}
                        </td>
                        <td>{item.frequencia || 0}</td>
                        <td>{formatarMoeda(item.monetario)}</td>
                        <td>{formatarDataCurta(item.ultimaCompra)}</td>
                        <td>{formatarCpfCnpj(item.cpf)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ) : null}
      </div>
    </AdminLayout>
  );
}
