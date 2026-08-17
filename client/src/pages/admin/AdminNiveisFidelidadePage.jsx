import { useCallback, useEffect, useMemo, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout.jsx";
import { clearAdminSession, fetchAdmin } from "../../utils/adminSession.js";
import { formatarCpfCnpj } from "../../utils/cpf.js";
import { formatarMoeda } from "../../utils/moeda.js";
import { mensagemParaUsuario } from "../../utils/mensagensUsuario.js";

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

export default function AdminNiveisFidelidadePage({
  tab,
  onTabChange,
  onLogout,
  admin,
  onVoltarHub,
}) {
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [nivelAtivo, setNivelAtivo] = useState("proximos");
  const [copiado, setCopiado] = useState("");

  const carregar = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAdmin("/api/admin/relatorio/niveis-fidelidade");
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
  }, [onLogout]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const listaAtual = useMemo(() => {
    if (!dados) return [];
    if (nivelAtivo === "proximos") return dados.proximosUpgrade || [];
    const n = dados.niveis?.find((x) => x.id === nivelAtivo);
    return n?.membros || [];
  }, [dados, nivelAtivo]);

  const emailsAtual = useMemo(() => {
    if (!dados) return [];
    if (nivelAtivo === "proximos") return dados.emailsProximosUpgrade || [];
    const n = dados.niveis?.find((x) => x.id === nivelAtivo);
    return n?.emails || [];
  }, [dados, nivelAtivo]);

  const tituloLista =
    nivelAtivo === "proximos"
      ? "Perto do upgrade"
      : dados?.niveis?.find((x) => x.id === nivelAtivo)?.nome || "Membros";

  async function copiarEmails() {
    if (!emailsAtual.length) {
      setCopiado("Nenhum e-mail nesta lista.");
      return;
    }
    try {
      await navigator.clipboard.writeText(emailsAtual.join("\n"));
      setCopiado(`${emailsAtual.length} e-mail(s) de “${tituloLista}” copiado(s).`);
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
            <h1>Níveis e fidelidade</h1>
            <p>
              Distribuição Bronze → Diamante (VIP), quem está perto de subir e
              listas para campanha / pauta.
            </p>
          </div>
          <button
            type="button"
            className="admin-btn admin-btn--primary"
            onClick={carregar}
            disabled={loading}
          >
            {loading ? "Atualizando…" : "Atualizar"}
          </button>
        </header>

        {error && (
          <p className="admin-alert" role="alert">
            {error}
          </p>
        )}

        {dados?.geradoEm ? (
          <p className="admin-relatorio-nota">
            Gerado em {formatarDataHora(dados.geradoEm)}
            {dados.periodo
              ? ` · ano ${dados.anoReferencia} (${dados.periodo.dataini} a ${dados.periodo.datafim})`
              : ""}
          </p>
        ) : null}

        <div className="admin-usuarios-stats" aria-label="Resumo níveis">
          <article className="admin-usuarios-stat admin-usuarios-stat--saldo">
            <span className="admin-usuarios-stat__valor">
              {loading && !kpis ? "—" : kpis?.totalMembros ?? 0}
            </span>
            <span className="admin-usuarios-stat__label">Membros</span>
          </article>
          <article className="admin-usuarios-stat">
            <span className="admin-usuarios-stat__valor">
              {loading && !kpis ? "—" : formatarMoeda(kpis?.gastoTotalAno)}
            </span>
            <span className="admin-usuarios-stat__label">Gasto no ano</span>
          </article>
          <article className="admin-usuarios-stat">
            <span className="admin-usuarios-stat__valor">
              {loading && !kpis ? "—" : kpis?.proximosDoUpgrade ?? 0}
            </span>
            <span className="admin-usuarios-stat__label">
              Perto do upgrade (≤ R$ {kpis?.limiarProximoUpgradeReais ?? 400})
            </span>
          </article>
          <article className="admin-usuarios-stat admin-usuarios-stat--filtro">
            <span className="admin-usuarios-stat__valor">
              {loading && !kpis ? "—" : `${kpis?.vipShare ?? 0}%`}
            </span>
            <span className="admin-usuarios-stat__label">Share VIP</span>
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
              <h2>Distribuição por nível</h2>
              <p className="admin-card__sub admin-card__sub--tight">
                Clique para ver a lista e copiar e-mails
              </p>
            </div>
          </header>

          {loading && !dados ? (
            <p className="admin-usuarios-loading">Carregando…</p>
          ) : (
            <div className="admin-rfm-grid" role="list">
              <button
                type="button"
                className={`admin-rfm-seg${nivelAtivo === "proximos" ? " is-ativo" : ""}`}
                onClick={() => {
                  setNivelAtivo("proximos");
                  setCopiado("");
                }}
              >
                <strong className="admin-rfm-seg__titulo">Perto do upgrade</strong>
                <span className="admin-rfm-seg__qtd">
                  {dados?.proximosUpgrade?.length ?? 0}
                </span>
                <span className="admin-rfm-seg__desc">
                  Falta pouco para o próximo nível — campanha “quase lá”.
                </span>
              </button>
              {(dados?.niveis || []).map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className={`admin-rfm-seg${nivelAtivo === n.id ? " is-ativo" : ""}`}
                  onClick={() => {
                    setNivelAtivo(n.id);
                    setCopiado("");
                  }}
                >
                  <strong className="admin-rfm-seg__titulo">{n.nome}</strong>
                  <span className="admin-rfm-seg__qtd">{n.quantidade}</span>
                  <span className="admin-rfm-seg__meta">
                    {n.percentual}% · médio {formatarMoeda(n.gastoMedio)}
                  </span>
                  <span className="admin-rfm-seg__desc">{n.acaoMarketing}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="admin-card">
          <header className="admin-card__head">
            <div>
              <h2>{tituloLista}</h2>
              <p className="admin-card__sub admin-card__sub--tight">
                {dados?.notas?.uso}
              </p>
            </div>
            <button
              type="button"
              className="admin-btn admin-btn--ghost admin-btn--sm"
              onClick={copiarEmails}
              disabled={!emailsAtual.length}
            >
              Copiar e-mails ({emailsAtual.length})
            </button>
          </header>
          {copiado ? (
            <p className="admin-success" role="status">
              {copiado}
            </p>
          ) : null}
          {!listaAtual.length ? (
            <p className="admin-usuarios-loading">Nenhum membro nesta lista.</p>
          ) : (
            <div className="admin-table-wrap admin-table-wrap--scroll">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>E-mail</th>
                    <th>Nível</th>
                    <th>Gasto ano</th>
                    <th>Falta p/ próximo</th>
                    <th>CPF</th>
                  </tr>
                </thead>
                <tbody>
                  {listaAtual.map((item) => (
                    <tr key={item.cpf}>
                      <td>{item.nome}</td>
                      <td>{item.email || "—"}</td>
                      <td>{item.nivelNome}</td>
                      <td>{formatarMoeda(item.gastoAno)}</td>
                      <td>
                        {item.proximoNivel
                          ? formatarMoeda(item.faltaParaProximo)
                          : "—"}
                      </td>
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
