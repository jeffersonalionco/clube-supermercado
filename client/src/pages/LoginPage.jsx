import { useEffect, useState } from "react";
import AuthShell from "../components/AuthShell.jsx";
import Field from "../components/Field.jsx";
import CadastroClubePage from "./CadastroClubePage.jsx";
import LegalPage from "./LegalPage.jsx";
import RecuperarSenhaFlow from "./RecuperarSenhaFlow.jsx";
import { cpfSomenteValido, formatarCpf } from "../utils/cpf.js";
import { apiUrl, parseApiResponse } from "../utils/api.js";
import { mensagemParaUsuario } from "../utils/mensagensUsuario.js";
import { saveSession } from "../utils/session.js";
import AceiteLegal from "../components/AceiteLegal.jsx";
import { useProgramaPublico } from "../hooks/useProgramaPublico.js";
import "../styles/auth-mobile.css";
import "../styles/legal.css";

function hashEhRecuperacaoSenha() {
  const hash = window.location.hash.slice(1).replace(/^\//, "").trim();
  return hash.startsWith("redefinir-senha");
}

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
  const pontosAtivo = useProgramaPublico();
  const [tela, setTela] = useState(() => (hashEhRecuperacaoSenha() ? "recuperar" : "login"));
  const [legalSlug, setLegalSlug] = useState(null);
  const [etapa, setEtapa] = useState("cpf");
  const [cpf, setCpf] = useState("");
  const [senha, setSenha] = useState("");
  const [showSenha, setShowSenha] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [aceiteLegal, setAceiteLegal] = useState(false);
  const [erroAceite, setErroAceite] = useState(false);
  const [precisaAceite, setPrecisaAceite] = useState(false);
  const [aposCadastro, setAposCadastro] = useState(false);
  const [cpfError, setCpfError] = useState("");
  const [senhaError, setSenhaError] = useState("");

  useEffect(() => {
    if (hashEhRecuperacaoSenha()) {
      setTela("recuperar");
    }
  }, []);

  async function handleVerificarCpf(event) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setCpfError("");
    setAposCadastro(false);

    if (!cpfSomenteValido(cpf)) {
      setCpfError("Informe um CPF válido");
      setError("Corrija o campo destacado em vermelho para continuar.");
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

      const primeiroAcesso = !data.cadastradoNaPlataforma;
      setPrecisaAceite(primeiroAcesso);
      setEtapa("senha");
      if (primeiroAcesso) {
        setSuccess("");
      }
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
    setErroAceite(false);
    setSenhaError("");

    if (!senha.trim()) {
      setSenhaError(
        precisaAceite
          ? "Crie uma senha com pelo menos 8 caracteres"
          : "Informe sua senha"
      );
      setError("Corrija o campo destacado em vermelho para continuar.");
      return;
    }

    if (precisaAceite && senha.length < 8) {
      setSenhaError("A senha deve ter pelo menos 8 caracteres");
      setError("Corrija o campo destacado em vermelho para continuar.");
      return;
    }

    if (precisaAceite && !aceiteLegal) {
      setErroAceite(true);
      setError("Aceite o Regulamento e a Política de Privacidade para continuar");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(apiUrl("/api/auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cpf,
          senha,
          aceiteLegal: precisaAceite ? aceiteLegal : undefined,
        }),
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
        saveSession({
          token: data.token,
          usuario: data.usuario,
          programa: data.programa,
        });
        onLogin({
          token: data.token,
          usuario: data.usuario,
          programa: data.programa,
        });
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
    setCpfError("");
    setSenhaError("");
    setAposCadastro(false);
    setPrecisaAceite(false);
  }

  function handleCadastroConcluido({ cpf: cpfDigits }) {
    setTela("login");
    setCpf(formatarCpf(cpfDigits || ""));
    setSenha("");
    setShowSenha(false);
    setAceiteLegal(false);
    setErroAceite(false);
    setPrecisaAceite(true);
    setAposCadastro(true);
    setEtapa("senha");
    setError("");
    setCpfError("");
    setSenhaError("");
    setSuccess("Cadastro concluído! Agora crie sua senha para entrar.");
  }

  function voltarParaCpf() {
    setEtapa("cpf");
    setSenha("");
    setAceiteLegal(false);
    setErroAceite(false);
    setPrecisaAceite(false);
    setAposCadastro(false);
    setError("");
    setSuccess("");
    setSenhaError("");
  }

  const step = etapa === "cpf" ? 1 : 2;
  const criandoSenha = etapa === "senha" && precisaAceite;

  const overlayLegal = legalSlug ? (
    <div className="legal-overlay">
      <LegalPage slug={legalSlug} onVoltar={() => setLegalSlug(null)} />
    </div>
  ) : null;

  if (tela === "cadastro-clube") {
    return (
      <>
        <CadastroClubePage
          cpf={cpf.replace(/\D/g, "")}
          onVoltar={voltarAoLogin}
          onCadastroConcluido={handleCadastroConcluido}
          onAbrirRegulamento={() => setLegalSlug("regulamento")}
          onAbrirPrivacidade={() => setLegalSlug("privacidade")}
        />
        {overlayLegal}
      </>
    );
  }

  if (tela === "recuperar") {
    return (
      <RecuperarSenhaFlow
        cpfInicial={cpf}
        onVoltarLogin={() => {
          if (window.location.hash.includes("redefinir-senha")) {
            history.replaceState(
              null,
              "",
              `${window.location.pathname}${window.location.search}`
            );
          }
          voltarAoLogin();
        }}
        onSenhaRedefinida={(cpfUsado) => {
          setTela("login");
          setCpf(formatarCpf(cpfUsado || cpf));
          setSenha("");
          setEtapa("senha");
          setPrecisaAceite(false);
          setAposCadastro(false);
          setError("");
          setSuccess("Senha redefinida! Entre com a nova senha.");
        }}
      />
    );
  }

  return (
    <>
      <AuthShell
        variant="login"
        badge="Área do cliente"
        title={
          etapa === "cpf"
            ? "Bem-vindo ao Clube Superama+"
            : criandoSenha
              ? "Crie sua senha"
              : "Sua senha"
        }
        description={
          etapa === "cpf"
            ? pontosAtivo
              ? "Acumule pontos a cada compra e troque por prêmios exclusivos na loja."
              : "Aproveite descontos em produtos selecionados e benefícios exclusivos do Clube Superama+."
            : criandoSenha
              ? "Você ainda não tem senha. Crie uma agora para acessar o clube."
              : "Informe a senha vinculada ao seu CPF."
        }
        onBack={etapa === "senha" ? voltarParaCpf : undefined}
        backLabel="CPF"
        step={step}
        totalSteps={2}
        footer={
          <div className="auth-footer__inner">
            {error && (
              <div className="auth-alert auth-alert--error auth-alert--footer" role="alert">
                <span className="auth-alert__icon" aria-hidden>
                  !
                </span>
                <span>{error}</span>
              </div>
            )}
            {etapa === "cpf" ? (
              <Btn loading={loading} type="submit" form="form-cpf">
                {loading ? "Verificando" : "Continuar"}
              </Btn>
            ) : (
              <>
                <Btn loading={loading} type="submit" form="form-senha">
                  {loading
                    ? criandoSenha
                      ? "Criando senha"
                      : "Entrando"
                    : criandoSenha
                      ? "Criar senha e entrar"
                      : "Entrar"}
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
            <p className="auth-form-sub">Informe seu CPF para continuar.</p>

            <div className="auth-callout" role="note">
              <strong>Primeiro acesso?</strong>
              <p>
                Se você acabou de se cadastrar ou ainda não tem senha, continue com o
                CPF: o sistema vai pedir para <strong>criar uma senha</strong>.
              </p>
            </div>

            <Field label="CPF" id="cpf" error={cpfError}>
              <input
                id="cpf"
                type="text"
                inputMode="numeric"
                autoComplete="username"
                enterKeyHint="go"
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
          <form id="form-senha" onSubmit={handleLogin} noValidate>
            <h2 className="auth-form-title">
              {criandoSenha ? "Criar senha de acesso" : "Senha de acesso"}
            </h2>
            <p className="auth-form-sub">
              CPF: <strong>{cpf}</strong>
            </p>

            {(criandoSenha || aposCadastro) && (
              <div
                className={`auth-callout auth-callout--destaque${
                  aposCadastro ? " auth-callout--sucesso" : ""
                }`}
                role="status"
              >
                <strong>
                  {aposCadastro
                    ? "Cadastro concluído — falta criar a senha"
                    : "Você ainda não tem senha"}
                </strong>
                <p>
                  Digite uma senha nova com pelo menos <strong>8 caracteres</strong>.
                  Essa será a senha do seu CPF no Clube Superama+.
                </p>
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

            <Field
              label={criandoSenha ? "Nova senha *" : "Senha"}
              id="senha"
              error={senhaError}
              hint={
                criandoSenha
                  ? "Mínimo de 8 caracteres. Guarde em um lugar seguro."
                  : "Informe a senha vinculada ao seu CPF."
              }
            >
              <div className="auth-password-wrap">
                <input
                  id="senha"
                  type={showSenha ? "text" : "password"}
                  autoComplete={criandoSenha ? "new-password" : "current-password"}
                  enterKeyHint="go"
                  placeholder="••••••••"
                  value={senha}
                  onChange={(e) => {
                    setSenha(e.target.value);
                    setSenhaError("");
                    setError("");
                  }}
                  disabled={loading}
                  required
                  minLength={precisaAceite ? 8 : 4}
                  autoFocus
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

            {!criandoSenha && (
              <p className="auth-forgot">
                <button
                  type="button"
                  className="auth-forgot__link"
                  onClick={() => {
                    setError("");
                    setSuccess("");
                    setTela("recuperar");
                  }}
                >
                  Esqueci minha senha
                </button>
              </p>
            )}

            {precisaAceite && (
              <>
                <AceiteLegal
                  checked={aceiteLegal}
                  onChange={(v) => {
                    setAceiteLegal(v);
                    if (v) setErroAceite(false);
                    setError("");
                  }}
                  onAbrirRegulamento={() => setLegalSlug("regulamento")}
                  onAbrirPrivacidade={() => setLegalSlug("privacidade")}
                  erro={erroAceite}
                />
                {erroAceite && (
                  <small className="auth-field__error auth-field__error--aceite">
                    Aceite o Regulamento e a Política de Privacidade
                  </small>
                )}
              </>
            )}
          </form>
        )}

        {etapa === "cpf" && (
          <nav className="auth-legal-links" aria-label="Ajuda e documentos">
            <button
              type="button"
              onClick={() => {
                setError("");
                setSuccess("");
                setTela("recuperar");
              }}
            >
              Esqueci a senha
            </button>
            <button type="button" onClick={() => setLegalSlug("regulamento")}>
              Regulamento
            </button>
            <button type="button" onClick={() => setLegalSlug("privacidade")}>
              Privacidade
            </button>
          </nav>
        )}
      </AuthShell>
      {overlayLegal}
    </>
  );
}
