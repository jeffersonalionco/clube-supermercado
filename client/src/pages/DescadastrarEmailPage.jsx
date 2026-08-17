import { useEffect, useState } from "react";
import AuthShell from "../components/AuthShell.jsx";
import { apiUrl, parseApiResponse } from "../utils/api.js";
import { mensagemParaUsuario } from "../utils/mensagensUsuario.js";
import "../styles/auth-mobile.css";

function tokenDaUrl() {
  const hash = window.location.hash.slice(1);
  const q = hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : "";
  return new URLSearchParams(q).get("token") || "";
}

export default function DescadastrarEmailPage({ onVoltar }) {
  const [token] = useState(() => tokenDaUrl());
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState("");
  const [resultado, setResultado] = useState(null);

  useEffect(() => {
    let ativo = true;
    async function carregar() {
      if (!token) {
        setError("Link inválido.");
        setLoading(false);
        return;
      }
      try {
        const response = await fetch(
          apiUrl(`/api/marketing/opt-out/${encodeURIComponent(token)}`)
        );
        const { data } = await parseApiResponse(response);
        if (!response.ok) throw new Error(data.error || "Link inválido");
        if (ativo) setEmail(data.email || "");
      } catch (err) {
        if (ativo) setError(mensagemParaUsuario(err.message));
      } finally {
        if (ativo) setLoading(false);
      }
    }
    carregar();
    return () => {
      ativo = false;
    };
  }, [token]);

  async function confirmar() {
    setConfirmando(true);
    setError("");
    try {
      const response = await fetch(
        apiUrl(`/api/marketing/opt-out/${encodeURIComponent(token)}`),
        { method: "POST" }
      );
      const { data } = await parseApiResponse(response);
      if (!response.ok) throw new Error(data.error || "Não foi possível concluir");
      setResultado(data);
    } catch (err) {
      setError(mensagemParaUsuario(err.message));
    } finally {
      setConfirmando(false);
    }
  }

  return (
    <AuthShell
      variant="login"
      badge="Preferências"
      title="E-mails promocionais"
      description="Gerencie o recebimento de propaganda do Clube Superama+."
      onBack={onVoltar}
      backLabel="Início"
      footer={
        !resultado && !loading && !error ? (
          <div className="auth-footer__inner">
            <button
              type="button"
              className="auth-btn auth-btn--primary"
              disabled={confirmando}
              onClick={confirmar}
            >
              {confirmando ? "Confirmando…" : "Cancelar propaganda"}
            </button>
          </div>
        ) : null
      }
    >
      {loading && <p className="auth-form-sub">Validando link…</p>}

      {error && (
        <div className="auth-alert auth-alert--error" role="alert">
          {error}
        </div>
      )}

      {!loading && !error && !resultado && (
        <>
          <h2 className="auth-form-title">Cancelar e-mails promocionais?</h2>
          <p className="auth-form-sub">
            {email ? (
              <>
                Vamos parar de enviar propaganda para{" "}
                <strong>{email}</strong>.
              </>
            ) : (
              "Vamos parar de enviar e-mails promocionais do clube."
            )}
          </p>
          <p className="auth-form-sub">
            E-mails de conta, senha e avisos importantes continuam normalmente.
          </p>
        </>
      )}

      {resultado && (
        <div className="auth-success">
          <div className="auth-success__icon" aria-hidden>
            ✓
          </div>
          <h2>Preferência salva</h2>
          <p>{resultado.message}</p>
        </div>
      )}
    </AuthShell>
  );
}
