import { useCallback, useEffect, useRef, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout.jsx";
import Field from "../../components/Field.jsx";
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

function iniciaisNome(nome) {
  const partes = String(nome || "?")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (partes.length >= 2) {
    return `${partes[0][0]}${partes[partes.length - 1][0]}`.toUpperCase();
  }
  return (partes[0]?.[0] || "?").toUpperCase();
}

const FORM_VAZIO = {
  usuario: "",
  nome: "",
  senha: "",
  confirmacaoSenha: "",
};

export default function AdminAdministradoresPage({ tab, onTabChange, onLogout, admin }) {
  const [lista, setLista] = useState([]);
  const [loadingLista, setLoadingLista] = useState(true);
  const [form, setForm] = useState(FORM_VAZIO);
  const [loadingCriar, setLoadingCriar] = useState(false);
  const [selecionado, setSelecionado] = useState(null);
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmacaoSenha, setConfirmacaoSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [loadingSenha, setLoadingSenha] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [error, setError] = useState("");
  const [sucesso, setSucesso] = useState("");
  const detalheRef = useRef(null);

  const loginAtual = String(admin?.usuario || "").toLowerCase();

  const carregarLista = useCallback(async () => {
    setLoadingLista(true);
    setError("");

    try {
      const data = await fetchAdmin("/api/admin/administradores");
      const administradores = data.administradores || [];
      setLista(administradores);

      setSelecionado((atual) => {
        if (atual) {
          return administradores.find((item) => item.id === atual.id) || atual;
        }
        return administradores.find((item) => item.usuario === loginAtual) || null;
      });
    } catch (err) {
      if (err.code === "UNAUTHORIZED") {
        clearAdminSession();
        onLogout();
        return;
      }
      setLista([]);
      setError(mensagemParaUsuario(err.message));
    } finally {
      setLoadingLista(false);
    }
  }, [loginAtual, onLogout]);

  useEffect(() => {
    carregarLista();
  }, [carregarLista]);

  function atualizarCampo(campo, valor) {
    setForm((prev) => ({ ...prev, [campo]: valor }));
  }

  function selecionarAdmin(item, { focarSenha = false } = {}) {
    setSelecionado(item);
    setNovaSenha("");
    setConfirmacaoSenha("");
    setError("");
    if (focarSenha) {
      setTimeout(() => {
        detalheRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        document.getElementById("admin-senha-nova")?.focus();
      }, 100);
    }
  }

  async function handleCriar(event) {
    event.preventDefault();
    setError("");
    setSucesso("");
    setLoadingCriar(true);

    try {
      const resultado = await fetchAdmin("/api/admin/administradores", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setSucesso(resultado.message || "Administrador criado");
      setForm(FORM_VAZIO);
      await carregarLista();
      if (resultado.administrador) {
        selecionarAdmin(resultado.administrador);
      }
    } catch (err) {
      if (err.code === "UNAUTHORIZED") {
        clearAdminSession();
        onLogout();
        return;
      }
      setError(mensagemParaUsuario(err.message));
    } finally {
      setLoadingCriar(false);
    }
  }

  async function handleAlterarSenha(event) {
    event.preventDefault();
    if (!selecionado) return;

    setError("");
    setSucesso("");
    setLoadingSenha(true);

    try {
      const resultado = await fetchAdmin(
        `/api/admin/administradores/${selecionado.id}/senha`,
        {
          method: "PUT",
          body: JSON.stringify({
            novaSenha,
            confirmacaoSenha,
          }),
        }
      );
      setSucesso(resultado.message || "Senha atualizada");
      setNovaSenha("");
      setConfirmacaoSenha("");
      await carregarLista();
    } catch (err) {
      if (err.code === "UNAUTHORIZED") {
        clearAdminSession();
        onLogout();
        return;
      }
      setError(mensagemParaUsuario(err.message));
    } finally {
      setLoadingSenha(false);
    }
  }

  async function handleAlternarStatus(item) {
    setError("");
    setSucesso("");
    setLoadingStatus(true);

    try {
      const resultado = await fetchAdmin(`/api/admin/administradores/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ ativo: !item.ativo }),
      });
      setSucesso(resultado.message || "Status atualizado");
      if (selecionado?.id === item.id) {
        setSelecionado(resultado.administrador);
      }
      await carregarLista();
    } catch (err) {
      if (err.code === "UNAUTHORIZED") {
        clearAdminSession();
        onLogout();
        return;
      }
      setError(mensagemParaUsuario(err.message));
    } finally {
      setLoadingStatus(false);
    }
  }

  function handleSair() {
    clearAdminSession();
    onLogout();
  }

  return (
    <AdminLayout tab={tab} onTabChange={onTabChange} onLogout={handleSair} admin={admin}>
      <div className="admin-admins-stack">
        {(error || sucesso) && (
          <div className="admin-feedback">
            {error && (
              <p className="admin-alert" role="alert">
                {error}
              </p>
            )}
            {sucesso && (
              <p className="admin-success" role="status">
                {sucesso}
              </p>
            )}
          </div>
        )}

        <section className="admin-card">
          <h2>Novo administrador</h2>
          <p className="admin-resgate-hint">
            Cada pessoa do time terá seu próprio usuário e senha para acessar o painel.
          </p>
          <form className="admin-form admin-form--inline admin-admins-form-novo" onSubmit={handleCriar}>
            <Field label="Usuário de login" id="admin-novo-usuario">
              <input
                id="admin-novo-usuario"
                value={form.usuario}
                onChange={(e) => atualizarCampo("usuario", e.target.value)}
                placeholder="ex.: maria.gerente"
                autoComplete="off"
                required
              />
            </Field>
            <Field label="Nome" id="admin-novo-nome">
              <input
                id="admin-novo-nome"
                value={form.nome}
                onChange={(e) => atualizarCampo("nome", e.target.value)}
                placeholder="ex.: Maria Silva"
                autoComplete="name"
              />
            </Field>
            <Field label="Senha" id="admin-novo-senha">
              <input
                id="admin-novo-senha"
                type="password"
                value={form.senha}
                onChange={(e) => atualizarCampo("senha", e.target.value)}
                autoComplete="new-password"
                required
              />
            </Field>
            <Field label="Confirmar senha" id="admin-novo-conf">
              <input
                id="admin-novo-conf"
                type="password"
                value={form.confirmacaoSenha}
                onChange={(e) => atualizarCampo("confirmacaoSenha", e.target.value)}
                autoComplete="new-password"
                required
              />
            </Field>
            <button
              type="submit"
              className="admin-btn admin-btn--primary"
              disabled={loadingCriar}
            >
              {loadingCriar ? "Criando…" : "Adicionar"}
            </button>
          </form>
        </section>

        <div className="admin-admins-layout-detalhe">
          <section className="admin-card admin-admins-layout__lista">
            <div className="admin-admins-lista__head">
              <h2>Administradores</h2>
              <span className="admin-admins-lista__count">
                {loadingLista ? "…" : `${lista.length} cadastrado${lista.length === 1 ? "" : "s"}`}
              </span>
            </div>

            {loadingLista ? (
              <p className="admin-empty">Carregando…</p>
            ) : lista.length === 0 ? (
              <p className="admin-empty">Nenhum administrador cadastrado.</p>
            ) : (
              <ul className="admin-admins-lista">
                {lista.map((item) => {
                  const ativo = item.ativo !== false;
                  const selecionadoAtivo = selecionado?.id === item.id;
                  const eu = item.usuario === loginAtual;

                  return (
                    <li
                      key={item.id}
                      className={`admin-admins-item ${selecionadoAtivo ? "admin-admins-item--sel" : ""} ${!ativo ? "admin-admins-item--off" : ""}`}
                    >
                      <button
                        type="button"
                        className="admin-admins-item__main"
                        onClick={() => selecionarAdmin(item)}
                      >
                        <strong>{item.nome || item.usuario}</strong>
                        <span>@{item.usuario}</span>
                        <small>Desde {formatarDataHora(item.criadoEm)}</small>
                      </button>
                      <div className="admin-admins-item__side">
                        {eu && <span className="admin-admins-item__eu">Você</span>}
                        <span
                          className={`admin-estoque-badge ${ativo ? "admin-estoque--ok" : "admin-estoque--zero"}`}
                        >
                          {ativo ? "Ativo" : "Inativo"}
                        </span>
                        <button
                          type="button"
                          className="admin-btn admin-btn--ghost admin-btn--sm"
                          onClick={() => selecionarAdmin(item, { focarSenha: true })}
                        >
                          Alterar senha
                        </button>
                        <button
                          type="button"
                          className="admin-btn admin-btn--ghost admin-btn--sm"
                          disabled={loadingStatus || (eu && ativo)}
                          onClick={() => handleAlternarStatus(item)}
                        >
                          {ativo ? "Desativar" : "Reativar"}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="admin-card admin-usuarios-detalhe-card" ref={detalheRef}>
            {!selecionado ? (
              <div className="admin-usuarios-placeholder">
                <span className="admin-usuarios-placeholder__icone" aria-hidden>
                  ◆
                </span>
                <h3>Selecione um administrador</h3>
                <p>
                  Escolha alguém na lista ou clique em <strong>Alterar senha</strong> para definir uma
                  nova senha de acesso ao painel.
                </p>
              </div>
            ) : (
              <>
                <header className="admin-usuarios-hero">
                  <span className="admin-usuarios-hero__avatar" aria-hidden>
                    {iniciaisNome(selecionado.nome || selecionado.usuario)}
                  </span>
                  <div className="admin-usuarios-hero__texto">
                    <h2>{selecionado.nome || selecionado.usuario}</h2>
                    <p>@{selecionado.usuario}</p>
                  </div>
                  <div className="admin-usuarios-hero__chips">
                    <span
                      className={`admin-usuarios-chip ${selecionado.ativo !== false ? "" : "admin-usuarios-chip--off"}`}
                    >
                      {selecionado.ativo !== false ? "Ativo" : "Inativo"}
                    </span>
                    {selecionado.usuario === loginAtual && (
                      <span className="admin-usuarios-chip">Sua conta</span>
                    )}
                  </div>
                </header>

                <dl className="admin-dl admin-admins-dl">
                  <div>
                    <dt>Cadastro no painel</dt>
                    <dd>{formatarDataHora(selecionado.criadoEm)}</dd>
                  </div>
                  <div>
                    <dt>Última atualização</dt>
                    <dd>{formatarDataHora(selecionado.atualizadoEm)}</dd>
                  </div>
                </dl>

                <form className="admin-usuarios-senha-card" onSubmit={handleAlterarSenha}>
                  <div className="admin-usuarios-senha-card__head">
                    <span className="admin-usuarios-senha-card__icone" aria-hidden>
                      S
                    </span>
                    <div>
                      <h3>Alterar senha de acesso</h3>
                      <p>
                        Mínimo de 8 caracteres. Qualquer administrador ativo pode redefinir a senha de
                        outro — inclusive a sua própria.
                      </p>
                    </div>
                  </div>

                  <div className="admin-form__row">
                    <Field label="Nova senha" id="admin-senha-nova">
                      <input
                        id="admin-senha-nova"
                        type={mostrarSenha ? "text" : "password"}
                        autoComplete="new-password"
                        value={novaSenha}
                        onChange={(e) => setNovaSenha(e.target.value)}
                        minLength={8}
                        required
                      />
                    </Field>
                    <Field label="Confirmar senha" id="admin-senha-conf">
                      <input
                        id="admin-senha-conf"
                        type={mostrarSenha ? "text" : "password"}
                        autoComplete="new-password"
                        value={confirmacaoSenha}
                        onChange={(e) => setConfirmacaoSenha(e.target.value)}
                        minLength={8}
                        required
                      />
                    </Field>
                  </div>

                  <div className="admin-usuarios-senha-card__acoes">
                    <label className="admin-usuarios-mostrar-senha">
                      <input
                        type="checkbox"
                        checked={mostrarSenha}
                        onChange={(e) => setMostrarSenha(e.target.checked)}
                      />
                      Mostrar senhas
                    </label>
                    <button
                      type="submit"
                      className="admin-btn admin-btn--primary"
                      disabled={loadingSenha}
                    >
                      {loadingSenha ? "Salvando…" : "Salvar nova senha"}
                    </button>
                  </div>
                </form>
              </>
            )}
          </section>
        </div>
      </div>
    </AdminLayout>
  );
}
