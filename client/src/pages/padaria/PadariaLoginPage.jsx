import { useState } from "react";
import {
  clearPadariaSession,
  fetchPadaria,
  savePadariaSession,
} from "../../utils/padariaSession.js";
import "../../styles/padaria.css";

export default function PadariaLoginPage({ titulo, subtitulo, onLogin, papeisOk }) {
  const [login, setLogin] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setErro("");
    setLoading(true);
    try {
      const data = await fetchPadaria("/auth/login", {
        method: "POST",
        body: { login, senha },
      });
      if (papeisOk && !papeisOk.includes(data.usuario.papel)) {
        clearPadariaSession();
        setErro("Este usuário não tem acesso a esta área.");
        return;
      }
      savePadariaSession(data);
      onLogin(data);
    } catch (err) {
      setErro(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="padaria-app pk-login">
      <form className="pk-login__card" onSubmit={handleSubmit}>
        <p className="padaria-hero__tag">Superama · Padaria</p>
        <h1>{titulo}</h1>
        <p>{subtitulo}</p>
        {erro && <p className="padaria-alert">{erro}</p>}
        <label>
          Usuário
          <input
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            autoComplete="username"
            required
          />
        </label>
        <label>
          Senha
          <input
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        <button
          type="submit"
          className="padaria-btn padaria-btn--primary padaria-btn--lg padaria-btn--block"
          disabled={loading}
        >
          {loading ? "Entrando…" : "Entrar"}
        </button>
        <p className="pk-login__link">
          <a href="#/padaria">Voltar ao catálogo</a>
        </p>
      </form>
    </div>
  );
}
