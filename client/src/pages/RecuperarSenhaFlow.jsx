import { useEffect, useMemo, useState } from "react";
import AuthShell from "../components/AuthShell.jsx";
import Field from "../components/Field.jsx";
import { cpfSomenteValido, formatarCpf } from "../utils/cpf.js";
import { apiUrl, parseApiResponse } from "../utils/api.js";
import { mensagemParaUsuario } from "../utils/mensagensUsuario.js";

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

function lerTokenDaUrl() {
  try {
    const hash = window.location.hash || "";
    const query = hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : "";
    const params = new URLSearchParams(query);
    return params.get("t") || params.get("token") || "";
  } catch {
    return "";
  }
}

function limparHashRecuperacao() {
  if (window.location.hash.includes("redefinir-senha")) {
    history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  }
}

/**
 * Fluxo: solicitar → código/nova senha (ou link com token).
 */
export default function RecuperarSenhaFlow({ cpfInicial = "", onVoltarLogin, onSenhaRedefinida }) {
  const tokenUrl = useMemo(() => lerTokenDaUrl(), []);
  const [etapa, setEtapa] = useState(tokenUrl ? "nova-senha" : "solicitar");
  const [cpf, setCpf] = useState(cpfInicial || "");
  const [codigo, setCodigo] = useState("");
  const [token] = useState(tokenUrl);
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [showSenha, setShowSenha] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [cpfError, setCpfError] = useState("");
  const [codigoError, setCodigoError] = useState("");
  const [senhaError, setSenhaError] = useState("");

  useEffect(() => {
    if (tokenUrl) {
      setEtapa("nova-senha");
    }
  }, [tokenUrl]);

  async function handleSolicitar(event) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setCpfError("");

    if (!cpfSomenteValido(cpf)) {
      setCpfError("Informe um CPF válido");
      setError("Corrija o campo destacado em vermelho para continuar.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(apiUrl("/api/auth/recuperar-senha/solicitar"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cpf: cpf.replace(/\D/g, "") }),
      });
      const { data } = await parseApiResponse(response);

      if (!response.ok) {
        throw new Error(mensagemParaUsuario(data.error));
      }

      setSuccess(data.message || "Se as informações estiverem corretas, enviamos o e-mail.");
      setEtapa("codigo");
    } catch (err) {
      setError(err.message || "Não foi possível enviar a solicitação.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRedefinir(event) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setCodigoError("");
    setSenhaError("");

    if (!token) {
      if (!cpfSomenteValido(cpf)) {
        setCpfError("Informe um CPF válido");
        setError("Corrija os campos destacados para continuar.");
        return;
      }
      if (!/^\d{6}$/.test(codigo.replace(/\D/g, ""))) {
        setCodigoError("Informe o código de 6 dígitos do e-mail");
        setError("Corrija os campos destacados para continuar.");
        return;
      }
    }

    if (novaSenha.length < 8) {
      setSenhaError("A senha deve ter pelo menos 8 caracteres");
      setError("Corrija os campos destacados para continuar.");
      return;
    }

    if (novaSenha !== confirmacao) {
      setSenhaError("A confirmação da senha não confere");
      setError("Corrija os campos destacados para continuar.");
      return;
    }

    setLoading(true);
    try {
      const body = token
        ? { token, novaSenha, confirmacaoSenha: confirmacao }
        : {
            cpf: cpf.replace(/\D/g, ""),
            codigo: codigo.replace(/\D/g, ""),
            novaSenha,
            confirmacaoSenha: confirmacao,
          };

      const response = await fetch(apiUrl("/api/auth/recuperar-senha/redefinir"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const { data } = await parseApiResponse(response);

      if (!response.ok) {
        throw new Error(mensagemParaUsuario(data.error));
      }

      limparHashRecuperacao();
      setSuccess(data.message || "Senha redefinida com sucesso.");
      onSenhaRedefinida?.(cpf);
    } catch (err) {
      setError(err.message || "Não foi possível redefinir a senha.");
    } finally {
      setLoading(false);
    }
  }

  const viaLink = Boolean(token);
  const stepNum = etapa === "solicitar" ? 1 : 2;

  return (
    <AuthShell
      variant="login"
      badge="Recuperar senha"
      title="Esqueceu a senha?"
      description={
        viaLink
          ? "Defina uma nova senha para continuar."
          : "Enviamos um código e um link para o e-mail cadastrado. Na loja, um atendente também pode ajudar."
      }
      onBack={onVoltarLogin}
      backLabel="Voltar ao login"
      step={viaLink ? undefined : stepNum}
      totalSteps={2}
      footer={
        <div className="auth-footer__inner">
          {etapa === "solicitar" && (
            <>
              <Btn type="submit" form="form-recuperar-solicitar" loading={loading}>
                Enviar instruções
              </Btn>
              {!viaLink && (
                <Btn
                  variant="ghost"
                  disabled={loading}
                  onClick={() => {
                    setEtapa("codigo");
                    setError("");
                    setSuccess("");
                  }}
                >
                  Já tenho o código
                </Btn>
              )}
            </>
          )}
          {(etapa === "codigo" || etapa === "nova-senha") && (
            <>
              <Btn type="submit" form="form-recuperar-redefinir" loading={loading}>
                Salvar nova senha
              </Btn>
              {!viaLink && etapa === "codigo" && (
                <Btn
                  variant="ghost"
                  disabled={loading}
                  onClick={() => {
                    setEtapa("solicitar");
                    setError("");
                    setSuccess("");
                  }}
                >
                  Reenviar para outro CPF
                </Btn>
              )}
            </>
          )}
        </div>
      }
    >
      {error && (
        <div className="auth-alert auth-alert--error" role="alert">
          <span className="auth-alert__icon" aria-hidden>
            !
          </span>
          <span>{error}</span>
        </div>
      )}

      {success && !error && (
        <div className="auth-alert auth-alert--success" role="status">
          <span className="auth-alert__icon" aria-hidden>
            ✓
          </span>
          <span>{success}</span>
        </div>
      )}

      {etapa === "solicitar" ? (
        <form id="form-recuperar-solicitar" onSubmit={handleSolicitar} noValidate>
          <h2 className="auth-form-title">Informe seu CPF</h2>
          <p className="auth-form-sub">
            Se houver conta e e-mail cadastrado, enviaremos o código e o link. A mensagem é a
            mesma mesmo quando o CPF não existir — assim ninguém descobre contas de outras
            pessoas.
          </p>

          <div className="auth-callout" role="note">
            <strong>Preferência pela loja?</strong>
            <p>
              Leve um documento com foto até o caixa ou atendimento: o time pode redefinir sua
              senha com segurança.
            </p>
          </div>

          <Field label="CPF" id="recuperar-cpf" error={cpfError}>
            <input
              id="recuperar-cpf"
              type="text"
              inputMode="numeric"
              autoComplete="username"
              placeholder="000.000.000-00"
              maxLength={14}
              value={cpf}
              onChange={(e) => {
                setCpf(formatarCpf(e.target.value));
                setCpfError("");
                setError("");
              }}
              disabled={loading}
              required
              aria-invalid={Boolean(cpfError)}
            />
          </Field>
        </form>
      ) : (
        <form id="form-recuperar-redefinir" onSubmit={handleRedefinir} noValidate>
          <h2 className="auth-form-title">
            {viaLink ? "Nova senha" : "Código e nova senha"}
          </h2>
          <p className="auth-form-sub">
            {viaLink
              ? "Link validado. Escolha uma senha com pelo menos 8 caracteres."
              : "Digite o código de 6 dígitos do e-mail e escolha a nova senha."}
          </p>

          {!viaLink && (
            <>
              <Field label="CPF" id="recuperar-cpf-2" error={cpfError}>
                <input
                  id="recuperar-cpf-2"
                  type="text"
                  inputMode="numeric"
                  autoComplete="username"
                  placeholder="000.000.000-00"
                  maxLength={14}
                  value={cpf}
                  onChange={(e) => {
                    setCpf(formatarCpf(e.target.value));
                    setCpfError("");
                    setError("");
                  }}
                  disabled={loading}
                  required
                  aria-invalid={Boolean(cpfError)}
                />
              </Field>

              <Field
                label="Código do e-mail"
                id="recuperar-codigo"
                error={codigoError}
                hint="6 dígitos enviados para o e-mail cadastrado"
              >
                <input
                  id="recuperar-codigo"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  maxLength={6}
                  value={codigo}
                  onChange={(e) => {
                    setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6));
                    setCodigoError("");
                    setError("");
                  }}
                  disabled={loading}
                  required
                  aria-invalid={Boolean(codigoError)}
                />
              </Field>
            </>
          )}

          <Field label="Nova senha *" id="recuperar-senha" error={senhaError}>
            <div className="auth-password-wrap">
              <input
                id="recuperar-senha"
                type={showSenha ? "text" : "password"}
                autoComplete="new-password"
                placeholder="••••••••"
                value={novaSenha}
                onChange={(e) => {
                  setNovaSenha(e.target.value);
                  setSenhaError("");
                  setError("");
                }}
                disabled={loading}
                required
                minLength={8}
                aria-invalid={Boolean(senhaError)}
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

          <Field label="Confirmar senha *" id="recuperar-senha-2">
            <input
              id="recuperar-senha-2"
              type={showSenha ? "text" : "password"}
              autoComplete="new-password"
              placeholder="••••••••"
              value={confirmacao}
              onChange={(e) => {
                setConfirmacao(e.target.value);
                setError("");
              }}
              disabled={loading}
              required
              minLength={8}
            />
          </Field>
        </form>
      )}
    </AuthShell>
  );
}
