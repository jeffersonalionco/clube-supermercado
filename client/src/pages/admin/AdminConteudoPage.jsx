import { useCallback, useEffect, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout.jsx";
import { fetchAdmin } from "../../utils/adminSession.js";
import { extrairYoutubeVideoId } from "../../utils/youtube.js";
import { mensagemParaUsuario } from "../../utils/mensagensUsuario.js";

function formatarData(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

export default function AdminConteudoPage({ tab, onTabChange, onLogout, admin }) {
  const [config, setConfig] = useState(null);
  const [url, setUrl] = useState("");
  const [titulo, setTitulo] = useState("");
  const [ativo, setAtivo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const carregar = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const data = await fetchAdmin("/api/admin/config/conteudo");
      setConfig(data);
      setUrl(data.videoHomeUrl || "");
      setTitulo(data.videoHomeTitulo || "");
      setAtivo(Boolean(data.videoHomeAtivo));
    } catch (err) {
      setError(mensagemParaUsuario(err.message));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const previewId = extrairYoutubeVideoId(url);

  async function handleSalvar(event) {
    event.preventDefault();
    if (salvando) return;

    setSalvando(true);
    setError("");
    setSuccess("");

    try {
      const data = await fetchAdmin("/api/admin/config/conteudo", {
        method: "PATCH",
        body: JSON.stringify({
          videoHomeUrl: url,
          videoHomeTitulo: titulo,
          videoHomeAtivo: ativo,
        }),
      });
      setConfig(data);
      setUrl(data.videoHomeUrl || "");
      setTitulo(data.videoHomeTitulo || "");
      setAtivo(Boolean(data.videoHomeAtivo));
      setSuccess(data.message || "Conteúdo salvo.");
    } catch (err) {
      setError(mensagemParaUsuario(err.message));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <AdminLayout tab={tab} onTabChange={onTabChange} onLogout={onLogout} admin={admin}>
      {error && <p className="admin-alert admin-alert--error">{error}</p>}
      {success && <p className="admin-alert admin-alert--success">{success}</p>}

      {loading ? (
        <p className="admin-muted">Carregando conteúdo…</p>
      ) : (
        <div className="admin-conteudo">
          <section className="admin-card admin-conteudo__card">
            <div className="admin-conteudo__head">
              <div>
                <h2>Vídeo da home</h2>
                <p className="admin-muted">
                  Exibido para clientes logo após &quot;Compras recentes&quot;, com
                  player e controles do clube.
                </p>
              </div>
              <span
                className={`admin-conteudo__badge${
                  ativo && previewId ? " admin-conteudo__badge--on" : ""
                }`}
              >
                {ativo && previewId ? "Visível na home" : "Oculto"}
              </span>
            </div>

            <form className="admin-conteudo__form" onSubmit={handleSalvar}>
              <label className="admin-field">
                <span>URL do YouTube</span>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                  autoComplete="off"
                />
                <small className="admin-muted">
                  Aceita links watch, youtu.be ou shorts. Deixe vazio para remover.
                </small>
              </label>

              <label className="admin-field">
                <span>Título do card</span>
                <input
                  type="text"
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  placeholder="Novidades do Superama+"
                  maxLength={200}
                />
              </label>

              <label className="admin-programa__toggle admin-conteudo__toggle">
                <input
                  type="checkbox"
                  checked={ativo}
                  disabled={salvando}
                  onChange={(e) => setAtivo(e.target.checked)}
                />
                <span className="admin-programa__toggle-ui" aria-hidden />
                <span>
                  <strong>Exibir vídeo na home dos clientes</strong>
                  <small>
                    {ativo
                      ? "Clientes verão o card quando a URL for válida."
                      : "O card fica oculto mesmo com URL cadastrada."}
                  </small>
                </span>
              </label>

              {previewId && (
                <div className="admin-conteudo__preview">
                  <img
                    src={`https://img.youtube.com/vi/${previewId}/hqdefault.jpg`}
                    alt=""
                  />
                  <div>
                    <strong>Prévia</strong>
                    <p className="admin-muted">ID: {previewId}</p>
                  </div>
                </div>
              )}

              <div className="admin-conteudo__actions">
                <button
                  type="submit"
                  className="admin-btn admin-btn--primary"
                  disabled={salvando}
                >
                  {salvando ? "Salvando…" : "Salvar conteúdo"}
                </button>
              </div>
            </form>

            <dl className="admin-programa__meta admin-conteudo__meta">
              <div>
                <dt>Última alteração</dt>
                <dd>{formatarData(config?.atualizadoEm)}</dd>
              </div>
              <div>
                <dt>Alterado por</dt>
                <dd>{config?.atualizadoPor || "—"}</dd>
              </div>
            </dl>
          </section>
        </div>
      )}
    </AdminLayout>
  );
}
