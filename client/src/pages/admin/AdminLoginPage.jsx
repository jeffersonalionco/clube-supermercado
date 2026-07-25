import { useState } from "react";
import Logo from "../../components/Logo.jsx";
import MetajiCredit from "../../components/MetajiCredit.jsx";
import Field from "../../components/Field.jsx";
import { loginAdmin } from "../../utils/adminSession.js";
import { mensagemParaUsuario } from "../../utils/mensagensUsuario.js";

export default function AdminLoginPage({ onLogin }) {
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const data = await loginAdmin(usuario, senha);
      onLogin({ token: data.token, admin: data.admin });
    } catch (err) {
      setError(mensagemParaUsuario(err.message));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="admin-app">
      <div className="admin-login">
        <div className="admin-login__card">
          <Logo variant="compact" className="admin-login__logo" />
          <p className="admin-login__tag">Área administrativa</p>
          <h1 className="admin-login__title">Baixa de pontos</h1>
          <p className="admin-login__desc">
            Acesso restrito para consultar saldo e registrar resgate de pontos.
          </p>

          <form className="admin-form" onSubmit={handleSubmit}>
            <Field label="Usuário" id="admin-usuario">
              <input
                id="admin-usuario"
                name="usuario"
                value={usuario}
                onChange={(e) => setUsuario(e.target.value)}
                autoComplete="username"
                required
              />
            </Field>
            <Field label="Senha" id="admin-senha">
              <input
                id="admin-senha"
                name="senha"
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                autoComplete="current-password"
                required
              />
            </Field>

            {error && (
              <p className="admin-alert" role="alert">
                {error}
              </p>
            )}

            <button type="submit" className="admin-btn admin-btn--primary" disabled={loading}>
              {loading ? "Entrando…" : "Entrar"}
            </button>
          </form>

          <a className="admin-login__back" href="#/">
            Voltar ao clube
          </a>
        </div>
      </div>
      <MetajiCredit className="metaji-credit--admin-login" />
    </div>
  );
}
