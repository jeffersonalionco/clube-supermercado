import { useCallback, useEffect, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout.jsx";
import { clearAdminSession, fetchAdmin } from "../../utils/adminSession.js";
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

export default function AdminMarketingHubPage({
  tab,
  onTabChange,
  onLogout,
  admin,
  onAbrirEmail,
}) {
  const [resumo, setResumo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const carregar = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAdmin("/api/admin/marketing/resumo");
      setResumo(data);
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

  function handleSair() {
    clearAdminSession();
    onLogout();
  }

  return (
    <AdminLayout tab={tab} onTabChange={onTabChange} onLogout={handleSair} admin={admin}>
      <div className="admin-marketing-stack">
        <header className="admin-page-head">
          <div>
            <h1>Marketing</h1>
            <p>
              Canais de comunicação com os clientes do Clube Superama+. Comece
              pelo e-mail promocional.
            </p>
          </div>
        </header>

        {error && (
          <p className="admin-alert" role="alert">
            {error}
          </p>
        )}

        <div className="admin-usuarios-stats" aria-label="Resumo marketing">
          <article className="admin-usuarios-stat">
            <span className="admin-usuarios-stat__valor">
              {loading ? "—" : resumo?.elegiveis ?? 0}
            </span>
            <span className="admin-usuarios-stat__label">
              Elegíveis a e-mail
            </span>
          </article>
          <article className="admin-usuarios-stat">
            <span className="admin-usuarios-stat__valor">
              {loading ? "—" : resumo?.optOut ?? 0}
            </span>
            <span className="admin-usuarios-stat__label">Opt-out propaganda</span>
          </article>
          <article className="admin-usuarios-stat admin-usuarios-stat--saldo">
            <span className="admin-usuarios-stat__valor">
              {loading ? "—" : resumo?.campanhasConcluidas ?? 0}
            </span>
            <span className="admin-usuarios-stat__label">Campanhas enviadas</span>
          </article>
          <article className="admin-usuarios-stat admin-usuarios-stat--filtro">
            <span className="admin-usuarios-stat__valor">
              {loading
                ? "—"
                : resumo?.smtpDisponivel
                  ? "OK"
                  : "Off"}
            </span>
            <span className="admin-usuarios-stat__label">SMTP</span>
          </article>
        </div>

        <div className="admin-marketing-canais">
          <button
            type="button"
            className="admin-marketing-canal"
            onClick={onAbrirEmail}
          >
            <span className="admin-marketing-canal__icone" aria-hidden>
              ✉
            </span>
            <span className="admin-marketing-canal__corpo">
              <strong>E-mail promocional</strong>
              <span>
                Escolha todos do clube ou marque clientes pelo nome/e-mail.
              </span>
              <small>
                Último envio: {formatarDataHora(resumo?.ultimoEnvio)}
              </small>
            </span>
            <span className="admin-marketing-canal__cta">Abrir</span>
          </button>

          <div className="admin-marketing-canal admin-marketing-canal--disabled">
            <span className="admin-marketing-canal__icone" aria-hidden>
              ▦
            </span>
            <span className="admin-marketing-canal__corpo">
              <strong>SMS</strong>
              <span>Em breve — estrutura pronta para novos canais.</span>
            </span>
            <span className="admin-marketing-canal__cta">Em breve</span>
          </div>

          <div className="admin-marketing-canal admin-marketing-canal--disabled">
            <span className="admin-marketing-canal__icone" aria-hidden>
              ◈
            </span>
            <span className="admin-marketing-canal__corpo">
              <strong>WhatsApp / Push</strong>
              <span>Em breve.</span>
            </span>
            <span className="admin-marketing-canal__cta">Em breve</span>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
