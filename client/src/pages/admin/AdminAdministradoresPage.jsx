import { useCallback, useEffect, useRef, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout.jsx";
import Field from "../../components/Field.jsx";
import { clearAdminSession, fetchAdmin } from "../../utils/adminSession.js";
import { mensagemParaUsuario } from "../../utils/mensagensUsuario.js";
import SeletorPermissoes from "../../components/admin/SeletorPermissoes.jsx";
import JanelaAdmin from "../../components/admin/JanelaAdmin.jsx";
import { MODULOS } from "../../admin/acessoAdmin.js";

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
  acessoTotal: false,
  ferramentas: [],
};

function resumoAcesso(item) {
  if (!item || item.acessoTotal !== false) {
    return { titulo: "Acesso completo", grupos: [] };
  }
  const ids = new Set(item.ferramentas || []);
  const grupos = MODULOS.map((modulo) => ({
    label: modulo.label,
    ferramentas: modulo.ferramentas.filter((itemFerramenta) => ids.has(itemFerramenta.id)),
  })).filter((grupo) => grupo.ferramentas.length);
  return {
    titulo: grupos.length ? "Acesso personalizado" : "Somente o Manual",
    grupos,
  };
}

function permissaoDe(item) {
  if (item?.acessoTotal === false) {
    return {
      acessoTotal: false,
      ferramentas: Array.isArray(item.ferramentas) ? item.ferramentas : [],
    };
  }
  return { acessoTotal: true, ferramentas: [] };
}

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
  const [permissao, setPermissao] = useState({ acessoTotal: true, ferramentas: [] });
  const [loadingPermissao, setLoadingPermissao] = useState(false);
  const [error, setError] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [janela, setJanela] = useState(null);
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

  useEffect(() => {
    if (selecionado) setPermissao(permissaoDe(selecionado));
  }, [selecionado]);

  function atualizarCampo(campo, valor) {
    setForm((prev) => ({ ...prev, [campo]: valor }));
  }

  function fecharJanela() {
    if (loadingCriar || loadingSenha || loadingPermissao) return;
    setJanela(null);
    setError("");
  }

  function abrirCriar() {
    setForm(FORM_VAZIO);
    setError("");
    setSucesso("");
    setJanela("criar");
  }

  function selecionarAdmin(item, { abrirSenha = false, abrirAcesso = false } = {}) {
    setSelecionado(item);
    setPermissao(permissaoDe(item));
    setNovaSenha("");
    setConfirmacaoSenha("");
    setError("");
    if (abrirSenha) setJanela("senha");
    else if (abrirAcesso) setJanela("acesso");
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
      setJanela(null);
      setPermissao(permissaoDe(resultado.administrador));
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
      setJanela(null);
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

  async function handleSalvarPermissao(event) {
    event.preventDefault();
    if (!selecionado) return;

    setError("");
    setSucesso("");
    setLoadingPermissao(true);

    try {
      const resultado = await fetchAdmin(`/api/admin/administradores/${selecionado.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          acessoTotal: permissao.acessoTotal,
          ferramentas: permissao.acessoTotal ? [] : permissao.ferramentas,
        }),
      });
      setJanela(null);
      setSucesso(resultado.message || "Permissões atualizadas");
      if (resultado.administrador) {
        setSelecionado(resultado.administrador);
        setPermissao(permissaoDe(resultado.administrador));
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
      setLoadingPermissao(false);
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
        {((error && !janela) || sucesso) && (
          <div className="admin-feedback">
            {error && !janela && (
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

        <div className="admin-admins-topo">
          <p>
            Quem já está cadastrado continua com acesso completo até você alterar.
            Novas pessoas entram só com o que for marcado na janela.
          </p>
          <button type="button" className="admin-btn admin-btn--primary" onClick={abrirCriar}>
            Novo administrador
          </button>
        </div>

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
                        <small>
                          Desde {formatarDataHora(item.criadoEm)}
                          {" · "}
                          {item.acessoTotal === false
                            ? `${item.ferramentas?.length || 0} ferramenta${item.ferramentas?.length === 1 ? "" : "s"}`
                            : "Acesso completo"}
                        </small>
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
                          onClick={() => selecionarAdmin(item, { abrirAcesso: true })}
                        >
                          Acesso
                        </button>
                        <button
                          type="button"
                          className="admin-btn admin-btn--ghost admin-btn--sm"
                          onClick={() => selecionarAdmin(item, { abrirSenha: true })}
                        >
                          Senha
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
                  Escolha alguém na lista para ver o acesso, alterar a senha ou desativar a conta.
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

                <ResumoAcessoCard
                  item={selecionado}
                  onEditar={() => {
                    setPermissao(permissaoDe(selecionado));
                    setError("");
                    setJanela("acesso");
                  }}
                  onSenha={() => {
                    setNovaSenha("");
                    setConfirmacaoSenha("");
                    setError("");
                    setJanela("senha");
                  }}
                />
              </>
            )}
          </section>
        </div>

        {janela === "criar" && (
          <JanelaAdmin
            larga
            titulo="Novo administrador"
            subtitulo="Dados de acesso de um lado, ferramentas do outro."
            onFechar={fecharJanela}
            rodape={
              <>
                <button type="button" className="admin-btn admin-btn--ghost" onClick={fecharJanela}>
                  Cancelar
                </button>
                <button
                  type="submit"
                  form="admin-form-novo"
                  className="admin-btn admin-btn--primary"
                  disabled={loadingCriar}
                >
                  {loadingCriar ? "Criando…" : "Criar administrador"}
                </button>
              </>
            }
          >
            {error && (
              <p className="admin-alert" role="alert">
                {error}
              </p>
            )}
            <form id="admin-form-novo" className="admin-janela__criar" onSubmit={handleCriar}>
              <section className="admin-janela__bloco">
                <h3>Dados de acesso</h3>
                <div className="admin-form">
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
                      minLength={8}
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
                      minLength={8}
                      required
                    />
                  </Field>
                </div>
              </section>
              <section className="admin-janela__bloco">
                <h3>Ferramentas</h3>
                <SeletorPermissoes
                  idPrefix="admin-novo"
                  acessoTotal={form.acessoTotal}
                  ferramentas={form.ferramentas}
                  onChange={(proxima) => setForm((prev) => ({ ...prev, ...proxima }))}
                />
              </section>
            </form>
          </JanelaAdmin>
        )}

        {janela === "acesso" && selecionado && (
          <JanelaAdmin
            larga
            titulo={`Acesso de ${selecionado.nome || selecionado.usuario}`}
            subtitulo={`@${selecionado.usuario}`}
            onFechar={fecharJanela}
            rodape={
              <>
                <button type="button" className="admin-btn admin-btn--ghost" onClick={fecharJanela}>
                  Cancelar
                </button>
                <button
                  type="submit"
                  form="admin-form-acesso"
                  className="admin-btn admin-btn--primary"
                  disabled={loadingPermissao}
                >
                  {loadingPermissao ? "Salvando…" : "Salvar acesso"}
                </button>
              </>
            }
          >
            {error && (
              <p className="admin-alert" role="alert">
                {error}
              </p>
            )}
            <form id="admin-form-acesso" onSubmit={handleSalvarPermissao}>
              <SeletorPermissoes
                idPrefix={`admin-${selecionado.id}`}
                acessoTotal={permissao.acessoTotal}
                ferramentas={permissao.ferramentas}
                onChange={setPermissao}
              />
            </form>
          </JanelaAdmin>
        )}

        {janela === "senha" && selecionado && (
          <JanelaAdmin
            titulo={`Senha de ${selecionado.nome || selecionado.usuario}`}
            subtitulo="Mínimo de 8 caracteres. Vale para o próximo login."
            onFechar={fecharJanela}
            rodape={
              <>
                <button type="button" className="admin-btn admin-btn--ghost" onClick={fecharJanela}>
                  Cancelar
                </button>
                <button
                  type="submit"
                  form="admin-form-senha"
                  className="admin-btn admin-btn--primary"
                  disabled={loadingSenha}
                >
                  {loadingSenha ? "Salvando…" : "Salvar senha"}
                </button>
              </>
            }
          >
            {error && (
              <p className="admin-alert" role="alert">
                {error}
              </p>
            )}
            <form id="admin-form-senha" className="admin-form" onSubmit={handleAlterarSenha}>
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
              <label className="admin-usuarios-mostrar-senha">
                <input
                  type="checkbox"
                  checked={mostrarSenha}
                  onChange={(e) => setMostrarSenha(e.target.checked)}
                />
                Mostrar senhas
              </label>
            </form>
          </JanelaAdmin>
        )}
      </div>
    </AdminLayout>
  );
}

function ResumoAcessoCard({ item, onEditar, onSenha }) {
  const resumo = resumoAcesso(item);
  return (
    <section className="admin-admins-acesso">
      <header>
        <div>
          <h3>{resumo.titulo}</h3>
          <p>
            {resumo.titulo === "Acesso completo"
              ? "Todas as ferramentas do painel estão liberadas."
              : resumo.grupos.length
                ? "Só as ferramentas abaixo estão liberadas."
                : "Nenhuma ferramenta além do Manual."}
          </p>
        </div>
        <div className="admin-admins-acesso__acoes">
          <button type="button" className="admin-btn admin-btn--primary admin-btn--sm" onClick={onEditar}>
            Editar acesso
          </button>
          <button type="button" className="admin-btn admin-btn--ghost admin-btn--sm" onClick={onSenha}>
            Alterar senha
          </button>
        </div>
      </header>
      {resumo.grupos.length > 0 && (
        <ul className="admin-admins-acesso__grupos">
          {resumo.grupos.map((grupo) => (
            <li key={grupo.label}>
              <strong>{grupo.label}</strong>
              <span>{grupo.ferramentas.map((ferramenta) => ferramenta.label).join(" · ")}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
