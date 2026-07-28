import { useCallback, useEffect, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout.jsx";
import Field from "../../components/Field.jsx";
import { apiUrl, parseApiResponse } from "../../utils/api.js";
import {
  fetchAdmin,
  loadAdminSession,
  resolveImagemUrl,
} from "../../utils/adminSession.js";
import { mensagemParaUsuario } from "../../utils/mensagensUsuario.js";

const FORM_VAZIO = {
  titulo: "",
  resumo: "",
  corpo: "",
  imagemUrl: "",
  ativo: true,
};

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

async function uploadNovidadeImagem(file) {
  const session = loadAdminSession();
  if (!session?.token) throw new Error("Sessão de administrador não encontrada");

  const formData = new FormData();
  formData.append("imagem", file);

  const response = await fetch(apiUrl("/api/admin/novidades/upload"), {
    method: "POST",
    headers: { Authorization: `Bearer ${session.token}` },
    body: formData,
  });
  const { data } = await parseApiResponse(response);
  if (!response.ok) {
    throw new Error(mensagemParaUsuario(data.error));
  }
  return data.url;
}

export default function AdminNovidadesPage({ tab, onTabChange, onLogout, admin }) {
  const [novidades, setNovidades] = useState([]);
  const [form, setForm] = useState(FORM_VAZIO);
  const [editandoId, setEditandoId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const carregar = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAdmin("/api/admin/novidades");
      setNovidades(data.novidades || []);
    } catch (err) {
      setError(mensagemParaUsuario(err.message));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  function limparFormulario() {
    setForm(FORM_VAZIO);
    setEditandoId(null);
  }

  function atualizarCampo(campo, valor) {
    setForm((prev) => ({ ...prev, [campo]: valor }));
  }

  function editar(item) {
    setEditandoId(item.id);
    setForm({
      titulo: item.titulo || "",
      resumo: item.resumo || "",
      corpo: item.corpo || "",
      imagemUrl: item.imagemUrl || "",
      ativo: item.ativo !== false,
    });
    setSuccess("");
    setError("");
  }

  async function handleUpload(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    try {
      const url = await uploadNovidadeImagem(file);
      atualizarCampo("imagemUrl", url);
      setSuccess("Imagem enviada.");
    } catch (err) {
      setError(mensagemParaUsuario(err.message));
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (salvando) return;
    setSalvando(true);
    setError("");
    setSuccess("");

    try {
      const body = {
        titulo: form.titulo,
        resumo: form.resumo,
        corpo: form.corpo,
        imagemUrl: form.imagemUrl || null,
        ativo: form.ativo,
      };

      if (editandoId) {
        await fetchAdmin(`/api/admin/novidades/${editandoId}`, {
          method: "PUT",
          body: JSON.stringify(body),
        });
        setSuccess("Novidade atualizada.");
      } else {
        await fetchAdmin("/api/admin/novidades", {
          method: "POST",
          body: JSON.stringify(body),
        });
        setSuccess("Novidade criada.");
      }
      limparFormulario();
      await carregar();
    } catch (err) {
      setError(mensagemParaUsuario(err.message));
    } finally {
      setSalvando(false);
    }
  }

  async function handleExcluir(id) {
    if (!confirm("Excluir esta novidade?")) return;
    setError("");
    try {
      await fetchAdmin(`/api/admin/novidades/${id}`, { method: "DELETE" });
      if (editandoId === id) limparFormulario();
      setSuccess("Novidade excluída.");
      await carregar();
    } catch (err) {
      setError(mensagemParaUsuario(err.message));
    }
  }

  const preview = resolveImagemUrl(form.imagemUrl);

  return (
    <AdminLayout tab={tab} onTabChange={onTabChange} onLogout={onLogout} admin={admin}>
      {error && <div className="admin-alert admin-alert--error">{error}</div>}
      {success && <div className="admin-alert admin-alert--success">{success}</div>}

      <div className="admin-brindes-layout">
        <section className="admin-card admin-brindes-layout__form">
          <div className="admin-card__head">
            <div className="admin-card__head-title">
              <h2>{editandoId ? "Editar novidade" : "Nova publicação"}</h2>
            </div>
            {editandoId && (
              <button
                type="button"
                className="admin-btn admin-btn--ghost admin-btn--sm"
                onClick={limparFormulario}
              >
                Cancelar
              </button>
            )}
          </div>

          <form className="admin-form" onSubmit={handleSubmit}>
            <Field label="Título *" id="nov-titulo">
              <input
                id="nov-titulo"
                value={form.titulo}
                onChange={(e) => atualizarCampo("titulo", e.target.value)}
                maxLength={160}
                required
              />
            </Field>
            <Field label="Resumo" id="nov-resumo" hint="Aparece na lista do app">
              <input
                id="nov-resumo"
                value={form.resumo}
                onChange={(e) => atualizarCampo("resumo", e.target.value)}
                maxLength={400}
              />
            </Field>
            <Field label="Texto *" id="nov-corpo">
              <textarea
                id="nov-corpo"
                className="admin-textarea"
                rows={8}
                value={form.corpo}
                onChange={(e) => atualizarCampo("corpo", e.target.value)}
                required
              />
            </Field>
            <Field label="Imagem (URL ou upload)" id="nov-img">
              <input
                id="nov-img"
                value={form.imagemUrl}
                onChange={(e) => atualizarCampo("imagemUrl", e.target.value)}
                placeholder="/uploads/novidades/... ou https://..."
              />
            </Field>
            <div className="admin-upload">
              <label className="admin-upload__label">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={handleUpload}
                  disabled={salvando}
                />
                <span className="admin-btn admin-btn--ghost">
                  Enviar imagem do computador
                </span>
              </label>
            </div>
            {preview && (
              <div className="admin-img-preview">
                <img src={preview} alt="Prévia da novidade" />
              </div>
            )}
            <label className="admin-check">
              <input
                type="checkbox"
                checked={form.ativo}
                onChange={(e) => atualizarCampo("ativo", e.target.checked)}
              />
              Publicada (visível no app)
            </label>
            <button type="submit" className="admin-btn admin-btn--primary" disabled={salvando}>
              {salvando ? "Salvando…" : editandoId ? "Salvar alterações" : "Publicar"}
            </button>
          </form>
        </section>

        <section className="admin-card">
          <div className="admin-card__head">
            <h2>Publicações</h2>
            <span>{loading ? "…" : `${novidades.length}`}</span>
          </div>
          {loading ? (
            <p>Carregando…</p>
          ) : novidades.length === 0 ? (
            <p className="admin-muted">Nenhuma novidade cadastrada.</p>
          ) : (
            <ul className="admin-lista">
              {novidades.map((n) => (
                <li key={n.id} className="admin-lista__item admin-lista__item--row">
                  <div>
                    <strong>{n.titulo}</strong>
                    <p>
                      {n.ativo ? "Ativa" : "Oculta"} · {formatarData(n.publicadoEm || n.criadoEm)}
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
                    <button
                      type="button"
                      className="admin-btn admin-btn--ghost admin-btn--sm"
                      onClick={() => editar(n)}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="admin-btn admin-btn--ghost admin-btn--sm"
                      onClick={() => handleExcluir(n.id)}
                    >
                      Excluir
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AdminLayout>
  );
}
