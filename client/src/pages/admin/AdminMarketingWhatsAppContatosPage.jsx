import { useCallback, useEffect, useMemo, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout.jsx";
import { clearAdminSession, fetchAdmin } from "../../utils/adminSession.js";
import { mensagemParaUsuario } from "../../utils/mensagensUsuario.js";

const FILTROS = [
  { id: "todos", label: "Todos", temClube: null },
  { id: "com_clube", label: "Com Clube", temClube: true },
  { id: "sem_clube", label: "Só WhatsApp (sem Clube)", temClube: false },
];

function formatarHora(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function mascararCpf(cpf) {
  const d = String(cpf || "").replace(/\D/g, "");
  if (d.length !== 11) return cpf || "—";
  return `${d.slice(0, 3)}.***.***-${d.slice(9)}`;
}

export default function AdminMarketingWhatsAppContatosPage({
  tab,
  onTabChange,
  onLogout,
  admin,
  onVoltarHub,
  onAbrirCampanhas,
}) {
  const [filtro, setFiltro] = useState("todos");
  const [busca, setBusca] = useState("");
  const [buscaDebounce, setBuscaDebounce] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selecionados, setSelecionados] = useState(() => new Set());
  const [backfillMsg, setBackfillMsg] = useState("");
  const [backfilling, setBackfilling] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setBuscaDebounce(busca.trim()), 320);
    return () => clearTimeout(t);
  }, [busca]);

  const temClube = useMemo(() => {
    const f = FILTROS.find((x) => x.id === filtro);
    return f?.temClube ?? null;
  }, [filtro]);

  const carregar = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const q = new URLSearchParams();
      q.set("page", String(page));
      q.set("limit", "50");
      if (temClube === true) q.set("temClube", "1");
      if (temClube === false) q.set("temClube", "0");
      if (buscaDebounce) q.set("busca", buscaDebounce);
      const res = await fetchAdmin(
        `/api/admin/marketing/whatsapp/contatos?${q.toString()}`
      );
      setData(res);
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
  }, [page, temClube, buscaDebounce, onLogout]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    setPage(1);
    setSelecionados(new Set());
  }, [filtro, buscaDebounce]);

  function handleSair() {
    clearAdminSession();
    onLogout();
  }

  function toggleTel(tel) {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(tel)) next.delete(tel);
      else next.add(tel);
      return next;
    });
  }

  function marcarVisiveis() {
    const lista = data?.contatos || [];
    setSelecionados((prev) => {
      const next = new Set(prev);
      for (const c of lista) {
        if (!c.optOut) next.add(c.telefone);
      }
      return next;
    });
  }

  function limparSelecao() {
    setSelecionados(new Set());
  }

  async function importarHistorico() {
    setBackfilling(true);
    setBackfillMsg("");
    try {
      const res = await fetchAdmin(
        "/api/admin/marketing/whatsapp/contatos/backfill",
        { method: "POST" }
      );
      setBackfillMsg(
        `Importados ${res.inseridos || 0} contatos do histórico.`
      );
      await carregar();
    } catch (err) {
      setBackfillMsg(mensagemParaUsuario(err.message));
    } finally {
      setBackfilling(false);
    }
  }

  function irCampanhaComSelecionados() {
    if (!selecionados.size || !onAbrirCampanhas) return;
    const tels = Array.from(selecionados);
    try {
      sessionStorage.setItem(
        "wa_campanha_telefones",
        JSON.stringify(tels)
      );
    } catch {
      /* ignore */
    }
    onAbrirCampanhas();
  }

  const resumo = data?.resumo || {};
  const contatos = data?.contatos || [];
  const pag = data?.paginacao;

  return (
    <AdminLayout tab={tab} onTabChange={onTabChange} onLogout={handleSair} admin={admin}>
      <div className="admin-marketing-stack">
        <header className="admin-page-head">
          <div>
            <button
              type="button"
              className="admin-btn admin-btn--ghost admin-btn--sm"
              onClick={onVoltarHub}
            >
              ← Marketing
            </button>
            <h1>Carteira WhatsApp</h1>
            <p>
              Contatos que falaram no número de ofertas — com ou sem Clube.
              Use na hora de montar a campanha.
            </p>
          </div>
          <div className="admin-page-head__acoes">
            <button
              type="button"
              className="admin-btn admin-btn--ghost"
              disabled={backfilling}
              onClick={importarHistorico}
            >
              {backfilling ? "Importando…" : "Importar histórico"}
            </button>
            {onAbrirCampanhas && (
              <button
                type="button"
                className="admin-btn admin-btn--primary"
                disabled={!selecionados.size}
                onClick={irCampanhaComSelecionados}
              >
                Campanha ({selecionados.size})
              </button>
            )}
          </div>
        </header>

        {error && (
          <p className="admin-alert" role="alert">
            {error}
          </p>
        )}
        {backfillMsg && <p className="admin-alert admin-alert--ok">{backfillMsg}</p>}

        <div className="admin-usuarios-stats" aria-label="Resumo carteira">
          <article className="admin-usuarios-stat">
            <span className="admin-usuarios-stat__valor">{resumo.total ?? "—"}</span>
            <span className="admin-usuarios-stat__label">Na carteira</span>
          </article>
          <article className="admin-usuarios-stat">
            <span className="admin-usuarios-stat__valor">
              {resumo.com_clube ?? "—"}
            </span>
            <span className="admin-usuarios-stat__label">Com Clube</span>
          </article>
          <article className="admin-usuarios-stat">
            <span className="admin-usuarios-stat__valor">
              {resumo.sem_clube ?? "—"}
            </span>
            <span className="admin-usuarios-stat__label">Sem Clube</span>
          </article>
          <article className="admin-usuarios-stat">
            <span className="admin-usuarios-stat__valor">
              {resumo.info_liberada ?? "—"}
            </span>
            <span className="admin-usuarios-stat__label">Acesso ampliado</span>
          </article>
        </div>

        <div className="admin-relatorio-filtros">
          <div className="admin-relatorio-filtros__grupo">
            {FILTROS.map((f) => (
              <button
                key={f.id}
                type="button"
                className={`admin-btn admin-btn--sm${
                  filtro === f.id ? " admin-btn--primary" : " admin-btn--ghost"
                }`}
                onClick={() => setFiltro(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <input
            className="admin-input"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar nome ou telefone"
            autoComplete="off"
          />
          <div className="admin-relatorio-filtros__acoes">
            <button
              type="button"
              className="admin-btn admin-btn--ghost admin-btn--sm"
              onClick={marcarVisiveis}
            >
              Marcar página
            </button>
            <button
              type="button"
              className="admin-btn admin-btn--ghost admin-btn--sm"
              onClick={limparSelecao}
              disabled={!selecionados.size}
            >
              Limpar seleção
            </button>
          </div>
        </div>

        <div className="admin-card">
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th />
                  <th>Contato</th>
                  <th>Clube</th>
                  <th>Último contato</th>
                  <th>Interações</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={5}>Carregando…</td>
                  </tr>
                )}
                {!loading && !contatos.length && (
                  <tr>
                    <td colSpan={5}>
                      Nenhum contato ainda. Quem falar no WhatsApp de ofertas
                      entra automaticamente — ou use Importar histórico.
                    </td>
                  </tr>
                )}
                {!loading &&
                  contatos.map((c) => (
                    <tr key={c.telefone}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selecionados.has(c.telefone)}
                          disabled={c.optOut}
                          onChange={() => toggleTel(c.telefone)}
                          aria-label={`Selecionar ${c.telefoneExibicao}`}
                        />
                      </td>
                      <td>
                        <strong>{c.nomeWa || "Sem nome"}</strong>
                        <div>
                          <code>{c.telefoneExibicao}</code>
                        </div>
                        {c.optOut ? (
                          <small className="admin-muted">Opt-out campanha</small>
                        ) : null}
                      </td>
                      <td>
                        {c.temClube ? (
                          <>
                            <span>Sim</span>
                            {c.infoLiberada ? (
                              <small> · ampliado</small>
                            ) : (
                              <small> · básico</small>
                            )}
                            {c.cpf ? (
                              <div>
                                <small>{mascararCpf(c.cpf)}</small>
                              </div>
                            ) : null}
                          </>
                        ) : (
                          <span className="admin-muted">Não</span>
                        )}
                      </td>
                      <td>
                        {formatarHora(c.ultimoInboundEm)}
                        {c.ultimaAcao ? (
                          <div>
                            <small>{c.ultimaAcao}</small>
                          </div>
                        ) : null}
                      </td>
                      <td>{c.totalInbounds}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          {pag && pag.pages > 1 && (
            <div className="admin-relatorio-filtros__acoes" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="admin-btn admin-btn--ghost admin-btn--sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Anterior
              </button>
              <span>
                Página {pag.page} / {pag.pages} · {pag.total} contatos
              </span>
              <button
                type="button"
                className="admin-btn admin-btn--ghost admin-btn--sm"
                disabled={page >= pag.pages}
                onClick={() => setPage((p) => p + 1)}
              >
                Próxima
              </button>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
