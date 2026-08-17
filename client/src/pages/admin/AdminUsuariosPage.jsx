import { useCallback, useEffect, useMemo, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout.jsx";
import Field from "../../components/Field.jsx";
import { formatarCpfCnpj } from "../../utils/cpf.js";
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

function formatarDataCurta(valor) {
  if (!valor) return "—";
  try {
    return new Date(valor).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

function dataLocalInput(data) {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function intervaloRapido(tipo) {
  if (tipo === "todos" || tipo === "personalizado") {
    return { inicio: "", fim: "" };
  }

  const fim = new Date();
  fim.setHours(12, 0, 0, 0);
  const inicio = new Date(fim);

  if (tipo === "ultimos7") inicio.setDate(inicio.getDate() - 6);
  if (tipo === "ultimos30") inicio.setDate(inicio.getDate() - 29);
  if (tipo === "mes") inicio.setDate(1);

  return {
    inicio: dataLocalInput(inicio),
    fim: dataLocalInput(fim),
  };
}

const OPCOES_PERIODO = [
  { id: "todos", label: "Todos" },
  { id: "hoje", label: "Hoje" },
  { id: "ultimos7", label: "Últimos 7 dias" },
  { id: "ultimos30", label: "Últimos 30 dias" },
  { id: "mes", label: "Este mês" },
  { id: "personalizado", label: "Personalizado" },
];

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

function InfoBloco({ titulo, itens }) {
  return (
    <div className="admin-usuarios-bloco">
      <h4 className="admin-section-label">{titulo}</h4>
      <dl className="admin-usuarios-info">
        {itens.map((item) => (
          <div key={item.rotulo}>
            <dt>{item.rotulo}</dt>
            <dd>{item.valor}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default function AdminUsuariosPage({ tab, onTabChange, onLogout, admin }) {
  const [busca, setBusca] = useState("");
  const [buscaAtiva, setBuscaAtiva] = useState("");
  const [periodo, setPeriodo] = useState("todos");
  const [periodoAtivo, setPeriodoAtivo] = useState("todos");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [dataInicioAtiva, setDataInicioAtiva] = useState("");
  const [dataFimAtiva, setDataFimAtiva] = useState("");
  const [lista, setLista] = useState([]);
  const [total, setTotal] = useState(0);
  const [loadingLista, setLoadingLista] = useState(true);
  const [selecionado, setSelecionado] = useState(null);
  const [loadingDetalhe, setLoadingDetalhe] = useState(false);
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmacaoSenha, setConfirmacaoSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [loadingSenha, setLoadingSenha] = useState(false);
  const [error, setError] = useState("");
  const [sucesso, setSucesso] = useState("");

  const carregarLista = useCallback(async () => {
    setLoadingLista(true);
    setError("");

    try {
      const params = new URLSearchParams();
      if (buscaAtiva) params.set("busca", buscaAtiva);
      if (dataInicioAtiva) params.set("dataInicio", dataInicioAtiva);
      if (dataFimAtiva) params.set("dataFim", dataFimAtiva);
      params.set("limite", "100");
      const data = await fetchAdmin(`/api/admin/usuarios?${params}`);
      setLista(data.usuarios || []);
      setTotal(data.total ?? 0);
    } catch (err) {
      if (err.code === "UNAUTHORIZED") {
        clearAdminSession();
        onLogout();
        return;
      }
      setLista([]);
      setTotal(0);
      setError(mensagemParaUsuario(err.message));
    } finally {
      setLoadingLista(false);
    }
  }, [buscaAtiva, dataInicioAtiva, dataFimAtiva, onLogout]);

  useEffect(() => {
    carregarLista();
  }, [carregarLista]);

  const carregarDetalhe = useCallback(
    async (cpf) => {
      setLoadingDetalhe(true);
      setError("");
      setSucesso("");
      setNovaSenha("");
      setConfirmacaoSenha("");
      setMostrarSenha(false);

      try {
        const data = await fetchAdmin(`/api/admin/usuarios/${cpf}`);
        setSelecionado(data.usuario);
      } catch (err) {
        if (err.code === "UNAUTHORIZED") {
          clearAdminSession();
          onLogout();
          return;
        }
        setSelecionado(null);
        setError(mensagemParaUsuario(err.message));
      } finally {
        setLoadingDetalhe(false);
      }
    },
    [onLogout]
  );

  const comSaldo = useMemo(
    () => lista.filter((item) => Number(item.saldoPontos) > 0).length,
    [lista]
  );

  function handleBuscar(event) {
    event.preventDefault();
    if (periodo === "personalizado" && (!dataInicio || !dataFim)) {
      setError("Informe a data inicial e a data final.");
      return;
    }
    if (dataInicio && dataFim && dataInicio > dataFim) {
      setError("A data inicial não pode ser posterior à data final.");
      return;
    }

    setError("");
    setBuscaAtiva(busca.trim());
    setPeriodoAtivo(periodo);
    setDataInicioAtiva(dataInicio);
    setDataFimAtiva(dataFim);
    setSelecionado(null);
  }

  function handleSelecionarPeriodo(novoPeriodo) {
    setPeriodo(novoPeriodo);
    if (novoPeriodo !== "personalizado") {
      const intervalo = intervaloRapido(novoPeriodo);
      setDataInicio(intervalo.inicio);
      setDataFim(intervalo.fim);
    }
  }

  function handleLimparBusca() {
    setBusca("");
    setBuscaAtiva("");
    setPeriodo("todos");
    setPeriodoAtivo("todos");
    setDataInicio("");
    setDataFim("");
    setDataInicioAtiva("");
    setDataFimAtiva("");
    setSelecionado(null);
  }

  const temFiltroAtivo = Boolean(
    buscaAtiva || dataInicioAtiva || dataFimAtiva
  );
  const rotuloPeriodo =
    OPCOES_PERIODO.find((opcao) => opcao.id === periodoAtivo)?.label ||
    "Período";

  async function handleAlterarSenha(event) {
    event.preventDefault();
    if (!selecionado?.cpf) return;

    setError("");
    setSucesso("");
    setLoadingSenha(true);

    try {
      const resultado = await fetchAdmin(`/api/admin/usuarios/${selecionado.cpf}/senha`, {
        method: "PUT",
        body: JSON.stringify({
          novaSenha,
          confirmacaoSenha,
        }),
      });

      setSucesso(resultado.message || "Senha atualizada");
      setNovaSenha("");
      setConfirmacaoSenha("");
      setMostrarSenha(false);
      await carregarDetalhe(selecionado.cpf);
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

  function handleSair() {
    clearAdminSession();
    onLogout();
  }

  return (
    <AdminLayout tab={tab} onTabChange={onTabChange} onLogout={handleSair} admin={admin}>
      <div className="admin-usuarios-stack">
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

        <div className="admin-usuarios-stats" aria-label="Resumo de usuários">
          <article className="admin-usuarios-stat">
            <span className="admin-usuarios-stat__valor">
              {loadingLista ? "—" : total}
            </span>
            <span className="admin-usuarios-stat__label">
              {dataInicioAtiva || dataFimAtiva
                ? "Cadastrados no período"
                : "Cadastrados no clube"}
            </span>
          </article>
          <article className="admin-usuarios-stat admin-usuarios-stat--saldo">
            <span className="admin-usuarios-stat__valor">
              {loadingLista ? "—" : comSaldo}
            </span>
            <span className="admin-usuarios-stat__label">Com saldo de pontos</span>
          </article>
          {temFiltroAtivo && (
            <article className="admin-usuarios-stat admin-usuarios-stat--filtro">
              <span className="admin-usuarios-stat__valor">{total}</span>
              <span className="admin-usuarios-stat__label">
                {rotuloPeriodo}
                {buscaAtiva ? ` · “${buscaAtiva}”` : ""}
              </span>
            </article>
          )}
        </div>

        <div className="admin-usuarios-layout">
          <section className="admin-card admin-usuarios-lista-card">
            <header className="admin-card__head">
              <div>
                <h2>Lista de usuários</h2>
                <p className="admin-card__sub admin-card__sub--tight">
                  Quem já criou senha e acessa o clube online.
                </p>
              </div>
              <span className="admin-badge-count">{total}</span>
            </header>

            <form className="admin-usuarios-busca" onSubmit={handleBuscar}>
              <fieldset className="admin-usuarios-periodo">
                <legend>Período de cadastro</legend>
                <div className="admin-usuarios-periodo__opcoes">
                  {OPCOES_PERIODO.map((opcao) => (
                    <button
                      key={opcao.id}
                      type="button"
                      className={`admin-usuarios-periodo__opcao${
                        periodo === opcao.id
                          ? " admin-usuarios-periodo__opcao--ativa"
                          : ""
                      }`}
                      onClick={() => handleSelecionarPeriodo(opcao.id)}
                      aria-pressed={periodo === opcao.id}
                    >
                      {opcao.label}
                    </button>
                  ))}
                </div>

                {periodo === "personalizado" && (
                  <div className="admin-usuarios-periodo__datas">
                    <label>
                      <span>Data inicial</span>
                      <input
                        type="date"
                        value={dataInicio}
                        max={dataFim || undefined}
                        onChange={(e) => setDataInicio(e.target.value)}
                        required
                      />
                    </label>
                    <label>
                      <span>Data final</span>
                      <input
                        type="date"
                        value={dataFim}
                        min={dataInicio || undefined}
                        onChange={(e) => setDataFim(e.target.value)}
                        required
                      />
                    </label>
                  </div>
                )}
              </fieldset>

              <div className="admin-usuarios-busca__campo">
                <span className="admin-usuarios-busca__icone" aria-hidden>
                  ⌕
                </span>
                <input
                  id="admin-usuarios-busca"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar por CPF ou nome…"
                  aria-label="Buscar por CPF ou nome"
                />
              </div>
              <button
                type="submit"
                className="admin-btn admin-btn--primary admin-btn--sm"
                disabled={loadingLista}
              >
                {loadingLista ? "…" : "Aplicar filtros"}
              </button>
              {temFiltroAtivo && (
                <button
                  type="button"
                  className="admin-btn admin-btn--ghost admin-btn--sm"
                  onClick={handleLimparBusca}
                >
                  Limpar filtros
                </button>
              )}
            </form>

            <div className="admin-usuarios-lista-wrap">
              {loadingLista ? (
                <p className="admin-usuarios-loading">Carregando usuários…</p>
              ) : lista.length === 0 ? (
                <div className="admin-usuarios-vazio">
                  <span className="admin-usuarios-vazio__icone" aria-hidden>
                    ◎
                  </span>
                  <p>Nenhum usuário encontrado.</p>
                  <small>
                    Clientes que ainda não fizeram o primeiro login não aparecem nesta lista.
                  </small>
                </div>
              ) : (
                <ul className="admin-usuarios-lista">
                  {lista.map((item) => {
                    const ativo = selecionado?.id === item.id;
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          className={`admin-usuario-item${ativo ? " admin-usuario-item--ativo" : ""}`}
                          onClick={() => carregarDetalhe(item.cpf)}
                          aria-current={ativo ? "true" : undefined}
                        >
                          <span className="admin-usuario-item__avatar" aria-hidden>
                            {iniciaisNome(item.nome)}
                          </span>
                          <span className="admin-usuario-item__corpo">
                            <strong>{item.nome || "Sem nome"}</strong>
                            <span>{formatarCpfCnpj(item.cpf)}</span>
                            {item.clienteCodigo && (
                              <small>Cód. cliente {item.clienteCodigo}</small>
                            )}
                          </span>
                          <span className="admin-usuario-item__lateral">
                            <span className="admin-usuario-item__pts">
                              {item.saldoPontos ?? 0} pts
                            </span>
                            <small>{formatarDataCurta(item.criadoEm)}</small>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>

          <section className="admin-card admin-usuarios-detalhe-card">
            {!selecionado ? (
              <div className="admin-usuarios-placeholder">
                <span className="admin-usuarios-placeholder__icone" aria-hidden>
                  ◎
                </span>
                <h3>Selecione um usuário</h3>
                <p>
                  Escolha alguém na lista ao lado para ver os dados da conta e redefinir a senha de
                  acesso.
                </p>
              </div>
            ) : loadingDetalhe ? (
              <p className="admin-usuarios-loading">Carregando dados do usuário…</p>
            ) : (
              <>
                <header className="admin-usuarios-hero">
                  <span className="admin-usuarios-hero__avatar" aria-hidden>
                    {iniciaisNome(selecionado.nome)}
                  </span>
                  <div className="admin-usuarios-hero__texto">
                    <h2>{selecionado.nome || "Sem nome"}</h2>
                    <p>{formatarCpfCnpj(selecionado.cpf)}</p>
                  </div>
                  <div className="admin-usuarios-hero__chips">
                    <span className="admin-usuarios-chip admin-usuarios-chip--pts">
                      {selecionado.saldoPontos ?? 0} pontos
                    </span>
                    {selecionado.clienteCodigo && (
                      <span className="admin-usuarios-chip">
                        Cód. {selecionado.clienteCodigo}
                      </span>
                    )}
                  </div>
                </header>

                <div className="admin-usuarios-blocos">
                  <InfoBloco
                    titulo="Conta"
                    itens={[
                      { rotulo: "Cadastro na plataforma", valor: formatarDataHora(selecionado.criadoEm) },
                      { rotulo: "Pontos contabilizados desde", valor: selecionado.dataInicioPlataforma || "—" },
                      { rotulo: "Última atualização", valor: formatarDataHora(selecionado.atualizadoEm) },
                    ]}
                  />
                  <InfoBloco
                    titulo="Documentos legais"
                    itens={[
                      { rotulo: "Aceite do regulamento", valor: formatarDataHora(selecionado.aceiteRegulamentoEm) },
                      { rotulo: "Aceite da privacidade", valor: formatarDataHora(selecionado.aceitePrivacidadeEm) },
                    ]}
                  />
                </div>

                <form
                  className="admin-usuarios-senha-card"
                  onSubmit={handleAlterarSenha}
                >
                  <div className="admin-usuarios-senha-card__head">
                    <span className="admin-usuarios-senha-card__icone" aria-hidden>
                      S
                    </span>
                    <div>
                      <h3>Redefinir senha de acesso</h3>
                      <p>
                        Mínimo de 8 caracteres. A alteração é registrada no histórico de auditoria
                        do cliente.
                      </p>
                    </div>
                  </div>

                  <div className="admin-form__row">
                    <Field label="Nova senha" id="admin-nova-senha">
                      <input
                        id="admin-nova-senha"
                        type={mostrarSenha ? "text" : "password"}
                        autoComplete="new-password"
                        value={novaSenha}
                        onChange={(e) => setNovaSenha(e.target.value)}
                        minLength={8}
                        required
                      />
                    </Field>
                    <Field label="Confirmar senha" id="admin-confirma-senha">
                      <input
                        id="admin-confirma-senha"
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

        <p className="admin-usuarios-nota">
          Clientes cadastrados apenas na API da loja aparecem aqui após o primeiro login no clube
          online, quando criam a senha de acesso.
        </p>
      </div>
    </AdminLayout>
  );
}
