import { useCallback, useEffect, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout.jsx";
import { fetchAdmin } from "../../utils/adminSession.js";
import { mensagemParaUsuario } from "../../utils/mensagensUsuario.js";

const DOCS = [
  {
    slug: "regulamento",
    label: "Regulamento do Clube",
    hint: "Regras de pontos, resgates e participação no programa.",
  },
  {
    slug: "privacidade",
    label: "Política de Privacidade",
    hint: "Como tratamos os dados pessoais dos participantes (LGPD).",
  },
];

function formatarData(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

export default function AdminLegalPage({ tab, onTabChange, onLogout, admin }) {
  const [documentos, setDocumentos] = useState([]);
  const [ativo, setAtivo] = useState("regulamento");
  const [titulo, setTitulo] = useState("");
  const [conteudo, setConteudo] = useState("");
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const carregar = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const data = await fetchAdmin("/api/admin/legal");
      const lista = data.documentos ?? [];
      setDocumentos(lista);

      const doc = lista.find((d) => d.slug === ativo) || lista[0];
      if (doc) {
        setTitulo(doc.titulo || "");
        setConteudo(doc.conteudo || "");
      }
    } catch (err) {
      setError(mensagemParaUsuario(err.message));
    } finally {
      setLoading(false);
    }
  }, [ativo]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  function selecionarDoc(slug) {
    const doc = documentos.find((d) => d.slug === slug);
    if (!doc) return;
    setAtivo(slug);
    setTitulo(doc.titulo || "");
    setConteudo(doc.conteudo || "");
    setSuccess("");
    setError("");
  }

  async function handleSalvar(event) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setSalvando(true);

    try {
      const data = await fetchAdmin(`/api/admin/legal/${ativo}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titulo, conteudo }),
      });

      setSuccess(data.message || "Salvo com sucesso");
      await carregar();
    } catch (err) {
      setError(mensagemParaUsuario(err.message));
    } finally {
      setSalvando(false);
    }
  }

  const docAtual = documentos.find((d) => d.slug === ativo);

  return (
    <AdminLayout tab={tab} onTabChange={onTabChange} onLogout={onLogout} admin={admin}>
      {(error || success) && (
        <div className="admin-feedback">
          {error && (
            <div className="admin-alert admin-alert--error" role="alert">
              {error}
            </div>
          )}
          {success && (
            <div className="admin-success" role="status">
              {success}
            </div>
          )}
        </div>
      )}

      <section className="admin-card">
        {loading ? (
          <p className="admin-muted">Carregando documentos…</p>
        ) : (
          <div className="admin-legal">
              <nav className="admin-legal__nav" aria-label="Documentos">
                {DOCS.map((item) => (
                  <button
                    key={item.slug}
                    type="button"
                    className={`admin-legal__tab ${ativo === item.slug ? "admin-legal__tab--active" : ""}`}
                    onClick={() => selecionarDoc(item.slug)}
                  >
                    <strong>{item.label}</strong>
                    <small>{item.hint}</small>
                  </button>
                ))}
              </nav>

              <form className="admin-legal__form" onSubmit={handleSalvar}>
                {docAtual && (
                  <p className="admin-legal__meta">
                    Última alteração: {formatarData(docAtual.atualizadoEm)}
                    {docAtual.adminUsuario ? ` · por ${docAtual.adminUsuario}` : ""}
                  </p>
                )}

                <label className="admin-field">
                  <span className="admin-field__label">Título da página</span>
                  <input
                    type="text"
                    value={titulo}
                    onChange={(e) => setTitulo(e.target.value)}
                    disabled={salvando}
                    required
                  />
                </label>

                <label className="admin-field">
                  <span className="admin-field__label">Conteúdo</span>
                  <span className="admin-field__hint">
                    Use ## para títulos de seção e - para listas. **negrito** para
                    destaque.
                  </span>
                  <textarea
                    className="admin-legal__textarea"
                    value={conteudo}
                    onChange={(e) => setConteudo(e.target.value)}
                    disabled={salvando}
                    rows={22}
                    required
                  />
                </label>

                <div className="admin-legal__actions">
                  <button
                    type="submit"
                    className="admin-btn admin-btn--primary"
                    disabled={salvando}
                  >
                    {salvando ? "Salvando…" : "Salvar alterações"}
                  </button>
                </div>
              </form>
          </div>
        )}
      </section>
    </AdminLayout>
  );
}
