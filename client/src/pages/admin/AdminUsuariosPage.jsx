import { useCallback, useEffect, useState } from "react";
import {
  Search,
  Users,
  Wallet,
  Filter,
  ChevronRight,
  ChevronLeft,
  X,
  Loader2,
  KeyRound,
  ExternalLink,
  UserCircle,
  Calendar,
  ShieldCheck,
  FileText,
  Clock,
  Award,
} from "lucide-react";
import AdminLayout from "../../components/admin/AdminLayout.jsx";
import Field from "../../components/Field.jsx";
import { formatarCpfCnpj } from "../../utils/cpf.js";
import { clearAdminSession, fetchAdmin } from "../../utils/adminSession.js";
import { mensagemParaUsuario } from "../../utils/mensagensUsuario.js";
import { navegarAdminComQuery } from "../../utils/adminHash.js";

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

  if (tipo === "hoje") {
    /* mesmo dia */
  } else if (tipo === "ultimos7") inicio.setDate(inicio.getDate() - 6);
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
  { id: "ultimos7", label: "7 dias" },
  { id: "ultimos30", label: "30 dias" },
  { id: "mes", label: "Este mês" },
  { id: "personalizado", label: "Personalizado" },
];

const ITENS_POR_PAGINA = 50;

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

function ModalInfoCard({ Icon, rotulo, valor, destaque }) {
  return (
    <article className={`admin-usuarios-modal__card${destaque ? " admin-usuarios-modal__card--destaque" : ""}`}>
      <span className="admin-usuarios-modal__card-icon" aria-hidden>
        <Icon size={16} />
      </span>
      <div>
        <span className="admin-usuarios-modal__card-rotulo">{rotulo}</span>
        <strong className="admin-usuarios-modal__card-valor">{valor}</strong>
      </div>
    </article>
  );
}

function UsuarioDetalheModal({
  aberto,
  onFechar,
  usuario,
  loading,
  erro,
  sucesso,
  novaSenha,
  setNovaSenha,
  confirmacaoSenha,
  setConfirmacaoSenha,
  mostrarSenha,
  setMostrarSenha,
  loadingSenha,
  onAlterarSenha,
  onVerFichaCompleta,
}) {
  useEffect(() => {
    if (!aberto) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onFechar();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [aberto, onFechar]);

  if (!aberto) return null;

  return (
    <div
      className="admin-mkt-modal admin-usuarios-modal admin-usuarios-modal--v3"
      role="dialog"
      aria-modal="true"
      aria-label="Dados do usuário"
    >
      <div className="admin-mkt-modal__backdrop" onClick={onFechar} />
      <div className="admin-mkt-modal__panel admin-usuarios-modal__panel">
        {loading ? (
          <div className="admin-usuarios-modal__loading">
            <Loader2 size={28} className="admin-crm-loading__spinner admin-crm-loading__spinner--icon" aria-hidden />
            <p>Carregando dados do usuário…</p>
          </div>
        ) : usuario ? (
          <>
            <header className="admin-usuarios-modal__banner">
              <button
                type="button"
                className="admin-usuarios-modal__close"
                onClick={onFechar}
                aria-label="Fechar"
              >
                <X size={18} />
              </button>

              <div className="admin-usuarios-modal__profile">
                <span className="admin-usuarios-modal__avatar" aria-hidden>
                  {iniciaisNome(usuario.nome)}
                </span>
                <div className="admin-usuarios-modal__identidade">
                  <p className="admin-section-label">Membro do clube</p>
                  <h2>{usuario.nome || "Sem nome"}</h2>
                  <p className="admin-usuarios-modal__cpf">{formatarCpfCnpj(usuario.cpf)}</p>
                </div>
              </div>

              <div className="admin-usuarios-modal__banner-chips">
                <span className="admin-usuarios-chip admin-usuarios-chip--pts">
                  <Award size={12} aria-hidden />
                  {usuario.saldoPontos ?? 0} pontos
                </span>
                {usuario.clienteCodigo && (
                  <span className="admin-usuarios-chip">
                    Cód. {usuario.clienteCodigo}
                  </span>
                )}
              </div>

              <button
                type="button"
                className="admin-btn admin-btn--primary admin-btn--sm admin-usuarios-modal__ficha-btn"
                onClick={() => onVerFichaCompleta(usuario.cpf)}
              >
                <ExternalLink size={14} aria-hidden />
                Ver ficha completa (compras)
              </button>
            </header>

            <div className="admin-usuarios-modal__body">
              {erro && (
                <p className="admin-alert" role="alert">
                  {erro}
                </p>
              )}
              {sucesso && (
                <p className="admin-success" role="status">
                  {sucesso}
                </p>
              )}

              <section className="admin-usuarios-modal__secao" aria-label="Linha do tempo da conta">
                <h3 className="admin-usuarios-modal__secao-titulo">
                  <Calendar size={16} aria-hidden />
                  Conta na plataforma
                </h3>
                <div className="admin-usuarios-modal__cards">
                  <ModalInfoCard
                    Icon={Calendar}
                    rotulo="Cadastro"
                    valor={formatarDataHora(usuario.criadoEm)}
                  />
                  <ModalInfoCard
                    Icon={Clock}
                    rotulo="Pontos desde"
                    valor={usuario.dataInicioPlataforma || "—"}
                  />
                  <ModalInfoCard
                    Icon={Clock}
                    rotulo="Última atualização"
                    valor={formatarDataHora(usuario.atualizadoEm)}
                  />
                </div>
              </section>

              <section className="admin-usuarios-modal__secao" aria-label="Documentos legais">
                <h3 className="admin-usuarios-modal__secao-titulo">
                  <ShieldCheck size={16} aria-hidden />
                  Aceites legais
                </h3>
                <div className="admin-usuarios-modal__legal">
                  <article className="admin-usuarios-modal__legal-item">
                    <span className="admin-usuarios-modal__legal-icon" aria-hidden>
                      <FileText size={18} />
                    </span>
                    <div>
                      <strong>Regulamento do clube</strong>
                      <p>{formatarDataHora(usuario.aceiteRegulamentoEm)}</p>
                    </div>
                  </article>
                  <article className="admin-usuarios-modal__legal-item">
                    <span className="admin-usuarios-modal__legal-icon" aria-hidden>
                      <FileText size={18} />
                    </span>
                    <div>
                      <strong>Política de privacidade</strong>
                      <p>{formatarDataHora(usuario.aceitePrivacidadeEm)}</p>
                    </div>
                  </article>
                </div>
              </section>

              <section className="admin-usuarios-modal__secao admin-usuarios-modal__secao--senha" aria-label="Redefinir senha">
                <h3 className="admin-usuarios-modal__secao-titulo">
                  <KeyRound size={16} aria-hidden />
                  Redefinir senha de acesso
                </h3>
                <p className="admin-usuarios-modal__secao-hint">
                  Mínimo de 8 caracteres. A alteração é registrada no histórico de auditoria do cliente.
                </p>

                <form className="admin-usuarios-senha-card admin-usuarios-senha-card--modal" onSubmit={onAlterarSenha}>
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
              </section>
            </div>
          </>
        ) : (
          <div className="admin-usuarios-modal__body">
            {erro && (
              <p className="admin-alert" role="alert">
                {erro}
              </p>
            )}
          </div>
        )}
      </div>
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
  const [comSaldo, setComSaldo] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [loadingLista, setLoadingLista] = useState(true);
  const [cpfSelecionado, setCpfSelecionado] = useState("");
  const [selecionado, setSelecionado] = useState(null);
  const [modalAberto, setModalAberto] = useState(false);
  const [loadingDetalhe, setLoadingDetalhe] = useState(false);
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmacaoSenha, setConfirmacaoSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [loadingSenha, setLoadingSenha] = useState(false);
  const [error, setError] = useState("");
  const [modalErro, setModalErro] = useState("");
  const [sucesso, setSucesso] = useState("");

  const carregarLista = useCallback(async () => {
    setLoadingLista(true);
    setError("");

    try {
      const params = new URLSearchParams();
      if (buscaAtiva) params.set("busca", buscaAtiva);
      if (dataInicioAtiva) params.set("dataInicio", dataInicioAtiva);
      if (dataFimAtiva) params.set("dataFim", dataFimAtiva);
      params.set("limite", String(ITENS_POR_PAGINA));
      params.set("offset", String((pagina - 1) * ITENS_POR_PAGINA));
      const data = await fetchAdmin(`/api/admin/usuarios?${params}`);
      setLista(data.usuarios || []);
      setTotal(data.total ?? 0);
      setComSaldo(data.comSaldo ?? 0);
      setTotalPaginas(data.totalPaginas ?? 1);
    } catch (err) {
      if (err.code === "UNAUTHORIZED") {
        clearAdminSession();
        onLogout();
        return;
      }
      setLista([]);
      setTotal(0);
      setComSaldo(0);
      setTotalPaginas(1);
      setError(mensagemParaUsuario(err.message));
    } finally {
      setLoadingLista(false);
    }
  }, [buscaAtiva, dataInicioAtiva, dataFimAtiva, pagina, onLogout]);

  useEffect(() => {
    carregarLista();
  }, [carregarLista]);

  const carregarDetalhe = useCallback(
    async (cpf) => {
      setModalAberto(true);
      setLoadingDetalhe(true);
      setModalErro("");
      setSucesso("");
      setNovaSenha("");
      setConfirmacaoSenha("");
      setMostrarSenha(false);
      setCpfSelecionado(cpf);

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
        setModalErro(mensagemParaUsuario(err.message));
      } finally {
        setLoadingDetalhe(false);
      }
    },
    [onLogout]
  );

  const temFiltroAtivo = Boolean(buscaAtiva || dataInicioAtiva || dataFimAtiva);
  const rotuloPeriodo =
    OPCOES_PERIODO.find((opcao) => opcao.id === periodoAtivo)?.label || "Período";
  const offsetLista = (pagina - 1) * ITENS_POR_PAGINA;
  const inicioFaixa = total === 0 ? 0 : offsetLista + 1;
  const fimFaixa = Math.min(offsetLista + lista.length, total);

  function handlePagina(nova) {
    if (nova < 1 || nova > totalPaginas) return;
    setPagina(nova);
    setModalAberto(false);
    setSelecionado(null);
    setCpfSelecionado("");
  }

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
    setPagina(1);
    setBuscaAtiva(busca.trim());
    setPeriodoAtivo(periodo);
    setDataInicioAtiva(dataInicio);
    setDataFimAtiva(dataFim);
    setModalAberto(false);
    setSelecionado(null);
    setCpfSelecionado("");
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
    setPagina(1);
    setPeriodo("todos");
    setPeriodoAtivo("todos");
    setDataInicio("");
    setDataFim("");
    setDataInicioAtiva("");
    setDataFimAtiva("");
    setModalAberto(false);
    setSelecionado(null);
    setCpfSelecionado("");
  }

  function fecharModal() {
    setModalAberto(false);
    setModalErro("");
    setSucesso("");
  }

  function handleVerFichaCompleta(cpf) {
    fecharModal();
    navegarAdminComQuery("clientes", { cpf });
    onTabChange("clientes");
  }

  async function handleAlterarSenha(event) {
    event.preventDefault();
    if (!selecionado?.cpf) return;

    setModalErro("");
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
      setModalErro(mensagemParaUsuario(err.message));
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
      <div className="admin-usuarios admin-usuarios--v2">
        <header className="admin-usuarios-hero-bar">
          <div className="admin-usuarios-hero-bar__text">
            <p className="admin-section-label">Membros · Contas</p>
            <h1>Usuários do clube</h1>
            <p>
              Quem já criou senha e acessa o programa online. Clique na linha para ver a conta
              ou abrir a ficha com compras.
            </p>
          </div>

          <form className="admin-usuarios-toolbar" onSubmit={handleBuscar}>
            <div className="admin-crm-search admin-usuarios-search">
              <Search size={18} className="admin-crm-search__icon" aria-hidden />
              <input
                id="admin-usuarios-busca"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por CPF ou nome…"
                className="admin-crm-search__input"
                aria-label="Buscar por CPF ou nome"
              />
            </div>

            <div className="admin-usuarios-periodo-pills" role="group" aria-label="Período de cadastro">
              {OPCOES_PERIODO.map((opcao) => (
                <button
                  key={opcao.id}
                  type="button"
                  className={`admin-usuarios-periodo__opcao${
                    periodo === opcao.id ? " admin-usuarios-periodo__opcao--ativa" : ""
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
                  <span>Início</span>
                  <input
                    type="date"
                    value={dataInicio}
                    max={dataFim || undefined}
                    onChange={(e) => setDataInicio(e.target.value)}
                    required
                  />
                </label>
                <label>
                  <span>Fim</span>
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

            <div className="admin-usuarios-toolbar__btns">
              <button
                type="submit"
                className="admin-btn admin-btn--primary admin-btn--sm"
                disabled={loadingLista}
              >
                {loadingLista ? "…" : "Buscar"}
              </button>
              {temFiltroAtivo && (
                <button
                  type="button"
                  className="admin-btn admin-btn--ghost admin-btn--sm"
                  onClick={handleLimparBusca}
                >
                  Limpar
                </button>
              )}
            </div>
          </form>
        </header>

        {error && (
          <p className="admin-alert" role="alert">
            {error}
          </p>
        )}

        <div className="admin-usuarios-stats" aria-label="Resumo de usuários">
          <article className="admin-usuarios-stat">
            <Users size={18} className="admin-usuarios-stat__icon" aria-hidden />
            <div>
              <span className="admin-usuarios-stat__valor">{loadingLista ? "—" : total}</span>
              <span className="admin-usuarios-stat__label">
                {dataInicioAtiva || dataFimAtiva
                  ? "Cadastrados no período"
                  : "Membros com conta"}
              </span>
            </div>
          </article>
          <article className="admin-usuarios-stat admin-usuarios-stat--saldo">
            <Wallet size={18} className="admin-usuarios-stat__icon" aria-hidden />
            <div>
              <span className="admin-usuarios-stat__valor">{loadingLista ? "—" : comSaldo}</span>
              <span className="admin-usuarios-stat__label">Com saldo de pontos</span>
            </div>
          </article>
          {temFiltroAtivo && (
            <article className="admin-usuarios-stat admin-usuarios-stat--filtro">
              <Filter size={18} className="admin-usuarios-stat__icon" aria-hidden />
              <div>
                <span className="admin-usuarios-stat__valor">{total}</span>
                <span className="admin-usuarios-stat__label">
                  {rotuloPeriodo}
                  {buscaAtiva ? ` · “${buscaAtiva}”` : ""}
                </span>
              </div>
            </article>
          )}
        </div>

        <section className="admin-usuarios-panel admin-card">
          <header className="admin-usuarios-panel__head">
            <div>
              <p className="admin-section-label">Resultados</p>
              <h2>Lista de usuários</h2>
              {total > 0 && (
                <p className="admin-usuarios-panel__faixa">
                  Exibindo {inicioFaixa}–{fimFaixa} de {total}
                  {totalPaginas > 1 && ` · Página ${pagina} de ${totalPaginas}`}
                </p>
              )}
            </div>
            <span className="admin-badge-count">{total}</span>
          </header>

          <div className="admin-usuarios-panel__body">
            {loadingLista ? (
              <div className="admin-crm-loading admin-crm-loading--compact">
                <Loader2 size={22} className="admin-crm-loading__spinner admin-crm-loading__spinner--icon" aria-hidden />
                <p>Carregando usuários…</p>
              </div>
            ) : lista.length === 0 ? (
              <div className="admin-usuarios-vazio">
                <UserCircle size={36} strokeWidth={1.25} aria-hidden />
                <p>Nenhum usuário encontrado.</p>
                <small>
                  Clientes que ainda não fizeram o primeiro login não aparecem nesta lista.
                </small>
              </div>
            ) : (
              <div className="admin-usuarios-tabela-wrap">
                <table className="admin-usuarios-tabela">
                  <thead>
                    <tr>
                      <th className="admin-usuarios-tabela__rank">#</th>
                      <th>Nome</th>
                      <th>CPF</th>
                      <th>Cód. cliente</th>
                      <th className="admin-usuarios-tabela__num">Pontos</th>
                      <th>Cadastro</th>
                      <th className="admin-usuarios-tabela__acao" aria-hidden />
                    </tr>
                  </thead>
                  <tbody>
                    {lista.map((item, indice) => {
                      const ativo = cpfSelecionado === item.cpf;
                      return (
                        <tr
                          key={item.id}
                          className={`admin-usuarios-tabela__row${ativo ? " admin-usuarios-tabela__row--sel" : ""}`}
                          onClick={() => carregarDetalhe(item.cpf)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              carregarDetalhe(item.cpf);
                            }
                          }}
                          tabIndex={0}
                          role="button"
                        >
                          <td className="admin-usuarios-tabela__rank">{offsetLista + indice + 1}</td>
                          <td>
                            <span className="admin-usuarios-tabela__nome">
                              {item.nome || "Sem nome"}
                            </span>
                          </td>
                          <td className="admin-usuarios-tabela__cpf">
                            {formatarCpfCnpj(item.cpf)}
                          </td>
                          <td>{item.clienteCodigo || "—"}</td>
                          <td className="admin-usuarios-tabela__num">
                            <strong>{item.saldoPontos ?? 0}</strong>
                          </td>
                          <td>{formatarDataCurta(item.criadoEm)}</td>
                          <td className="admin-usuarios-tabela__acao">
                            <ChevronRight size={16} aria-hidden />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {totalPaginas > 1 && !loadingLista && lista.length > 0 && (
              <footer className="admin-usuarios-paginacao">
                <button
                  type="button"
                  className="admin-btn admin-btn--ghost admin-btn--sm"
                  disabled={pagina <= 1 || loadingLista}
                  onClick={() => handlePagina(pagina - 1)}
                >
                  <ChevronLeft size={16} aria-hidden />
                  Anterior
                </button>
                <span className="admin-usuarios-paginacao__info">
                  Página {pagina} de {totalPaginas}
                </span>
                <button
                  type="button"
                  className="admin-btn admin-btn--ghost admin-btn--sm"
                  disabled={pagina >= totalPaginas || loadingLista}
                  onClick={() => handlePagina(pagina + 1)}
                >
                  Próxima
                  <ChevronRight size={16} aria-hidden />
                </button>
              </footer>
            )}
          </div>
        </section>

        <p className="admin-usuarios-nota">
          Aparecem aqui os clientes que já fizeram o primeiro login e criaram senha no clube
          online. Para compras, cupons e segmentos, use a aba Clientes.
        </p>

        <UsuarioDetalheModal
          aberto={modalAberto}
          onFechar={fecharModal}
          usuario={selecionado}
          loading={loadingDetalhe}
          erro={modalErro}
          sucesso={sucesso}
          novaSenha={novaSenha}
          setNovaSenha={setNovaSenha}
          confirmacaoSenha={confirmacaoSenha}
          setConfirmacaoSenha={setConfirmacaoSenha}
          mostrarSenha={mostrarSenha}
          setMostrarSenha={setMostrarSenha}
          loadingSenha={loadingSenha}
          onAlterarSenha={handleAlterarSenha}
          onVerFichaCompleta={handleVerFichaCompleta}
        />
      </div>
    </AdminLayout>
  );
}
