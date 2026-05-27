import { useState } from "react";
import AuthShell from "../components/AuthShell.jsx";
import Field from "../components/Field.jsx";
import CadastroClubePage from "./CadastroClubePage.jsx";
import { cpfValido, formatarCpfCnpj } from "../utils/cpf.js";
import { apiUrl, parseApiResponse } from "../utils/api.js";
import { mensagemParaUsuario } from "../utils/mensagensUsuario.js";
import { saveSession } from "../utils/session.js";
import "../styles/auth-mobile.css";

function Btn({ loading, children, variant = "primary", type = "button", ...props }) {
  return (
    <button
      type={type}
      className={`auth-btn auth-btn--${variant}`}
      disabled={loading}
      {...props}
    >
      {loading && <span className="auth-btn__spinner" aria-hidden />}
      {children}
    </button>
  );
}

export default function LoginPage({ onLogin }) {
  const [tela, setTela] = useState("login");
  const [etapa, setEtapa] = useState("cpf");
  const [cpf, setCpf] = useState("");
  const [senha, setSenha] = useState("");
  const [showSenha, setShowSenha] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleVerificarCpf(event) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!cpfValido(cpf)) {
      setError("Informe um CPF ou CNPJ válido");
      return;
    }

    setLoading(true);

    try {
      const digits = cpf.replace(/\D/g, "");
      const response = await fetch(
        apiUrl(`/api/auth/verificar-cpf/${encodeURIComponent(digits)}`)
      );
      const { data } = await parseApiResponse(response);

      if (!response.ok) {
        throw new Error(mensagemParaUsuario(data.error));
      }

      if (!data.existeNoSistema) {
        setTela("cadastro-clube");
        return;
      }

      setEtapa("senha");
    } catch (err) {
      setError(mensagemParaUsuario(err.message));
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const response = await fetch(apiUrl("/api/auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cpf, senha }),
      });

      const { data } = await parseApiResponse(response);

      if (response.status === 404 && data.cadastrarNoClube) {
        setTela("cadastro-clube");
        return;
      }

      if (!response.ok) {
        throw new Error(mensagemParaUsuario(data.error));
      }

      if (data.token && onLogin) {
        saveSession({ token: data.token, usuario: data.usuario });
        onLogin({ token: data.token, usuario: data.usuario });
        return;
      }

      setSuccess(data.message || "Login realizado com sucesso");
      setSenha("");
    } catch (err) {
      setError(mensagemParaUsuario(err.message));
    } finally {
      setLoading(false);
    }
  }

  function voltarAoLogin() {
    setTela("login");
    setEtapa("cpf");
    setSenha("");
    setError("");
    setSuccess("");
  }

  function voltarParaCpf() {
    setEtapa("cpf");
    setSenha("");
    setError("");
    setSuccess("");
  }

  if (tela === "cadastro-clube") {
    return (
      <CadastroClubePage
        cpf={cpf.replace(/\D/g, "")}
        onVoltar={voltarAoLogin}
      />
    );
  }

  const step = etapa === "cpf" ? 1 : 2;

  return (
    <AuthShell
      variant="login"
      badge="Área do cliente"
      title={etapa === "cpf" ? "Bem-vindo de volta" : "Sua senha"}
      description={
        etapa === "cpf"
          ? "Digite seu CPF ou CNPJ para acessar a plataforma."
          : "Informe a senha vinculada ao seu documento."
      }
      onBack={etapa === "senha" ? voltarParaCpf : undefined}
      backLabel="CPF"
      step={step}
      totalSteps={2}
      footer={
        <div className="auth-footer__inner">
          {etapa === "cpf" ? (
            <Btn loading={loading} type="submit" form="form-cpf">
              {loading ? "Verificando" : "Continuar"}
            </Btn>
          ) : (
            <>
              <Btn loading={loading} type="submit" form="form-senha">
                {loading ? "Entrando" : "Entrar"}
              </Btn>
              <Btn variant="ghost" onClick={voltarParaCpf} disabled={loading}>
                Alterar CPF
              </Btn>
            </>
          )}
        </div>
      }
    >
      {etapa === "cpf" ? (
        <form id="form-cpf" onSubmit={handleVerificarCpf} noValidate>
          <h2 className="auth-form-title">Identificação</h2>
          <p className="auth-form-sub">Informe seu documento para continuar.</p>

          {error && (
            <div className="auth-alert auth-alert--error" role="alert">
              <span className="auth-alert__icon" aria-hidden>!</span>
              <span>{error}</span>
            </div>
          )}

          <Field label="CPF ou CNPJ" id="cpf">
            <input
              id="cpf"
              type="text"
              inputMode="numeric"
              autoComplete="username"
              enterKeyHint="go"
              placeholder="000.000.000-00"
              value={cpf}
              onChange={(e) => setCpf(formatarCpfCnpj(e.target.value))}
              disabled={loading}
              required
            />
          </Field>
        </form>
      ) : (
        <form id="form-senha" onSubmit={handleLogin} noValidate>
          <h2 className="auth-form-title">Senha de acesso</h2>
          <p className="auth-form-sub">
            Documento: <strong>{cpf}</strong>
          </p>

          {error && (
            <div className="auth-alert auth-alert--error" role="alert">
              <span className="auth-alert__icon" aria-hidden>!</span>
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="auth-alert auth-alert--success" role="status">
              <span className="auth-alert__icon" aria-hidden>✓</span>
              <span>{success}</span>
            </div>
          )}

          <Field
            label="Senha"
            id="senha"
            hint="No primeiro acesso, você define a senha que usará daqui em diante."
          >
            <div className="auth-password-wrap">
              <input
                id="senha"
                type={showSenha ? "text" : "password"}
                autoComplete="current-password"
                enterKeyHint="go"
                placeholder="••••••••"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                disabled={loading}
                required
                minLength={4}
                autoFocus
              />
              <button
                type="button"
                className="auth-field__toggle-pw"
                onClick={() => setShowSenha((v) => !v)}
                aria-label={showSenha ? "Ocultar senha" : "Mostrar senha"}
                tabIndex={-1}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                  {showSenha ? (
                    <path
                      d="M3 3l18 18M10.58 10.58A3 3 0 0012 15a3 3 0 002.42-4.42M9.88 5.09A10.94 10.94 0 0112 5c5 0 9.27 3.11 11 7a11.8 11.8 0 01-4.12 5.12M6.12 6.12A11.76 11.76 0 001 12c1.73 3.89 6 7 11 7 1.41 0 2.76-.26 4-.74"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                    />
                  ) : (
                    <>
                      <path
                        d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"
                        stroke="currentColor"
                        strokeWidth="1.75"
                      />
                      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.75" />
                    </>
                  )}
                </svg>
              </button>
            </div>
          </Field>
        </form>
      )}
    </AuthShell>
  );
}
