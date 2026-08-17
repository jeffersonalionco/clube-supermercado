import { useCallback, useEffect, useMemo, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout.jsx";
import Field from "../../components/Field.jsx";
import MarketingRichEditor from "../../components/admin/MarketingRichEditor.jsx";
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

function statusLabel(status) {
  const mapa = {
    rascunho: "Rascunho",
    enviando: "Enviando",
    concluida: "Concluída",
    cancelada: "Cancelada",
  };
  return mapa[status] || status;
}

const CAMPANHA_VAZIA = {
  assunto: "",
  preheader: "",
  corpoMd: "",
  corpoHtml: "",
  corpoTexto: "",
  publico: "todos_elegiveis",
  emailsEspecificos: [],
};

export default function AdminMarketingEmailPage({
  tab,
  onTabChange,
  onLogout,
  admin,
  onVoltarHub,
}) {
  const [vista, setVista] = useState("lista");
  const [listaArquivadas, setListaArquivadas] = useState(false);
  const [campanhas, setCampanhas] = useState([]);
  const [campanhaId, setCampanhaId] = useState(null);
  const [form, setForm] = useState(CAMPANHA_VAZIA);
  const [emailsSelecionados, setEmailsSelecionados] = useState(() => new Set());
  const [clientes, setClientes] = useState([]);
  const [clientesResumo, setClientesResumo] = useState(null);
  const [buscaCliente, setBuscaCliente] = useState("");
  const [buscaDebounced, setBuscaDebounced] = useState("");
  const [mostrarIndisponiveis, setMostrarIndisponiveis] = useState(false);
  const [loadingClientes, setLoadingClientes] = useState(false);
  const [avancado, setAvancado] = useState(false);
  const [destResumo, setDestResumo] = useState(null);
  const [previewHtml, setPreviewHtml] = useState("");
  const [emailTeste, setEmailTeste] = useState("");
  const [progresso, setProgresso] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [sucesso, setSucesso] = useState("");

  const editavel =
    !campanhaId ||
    !form.status ||
    form.status === "rascunho" ||
    form.status === "concluida" ||
    form.status === "cancelada";
  const enviandoAgora = form.status === "enviando";
  const jaEnviada =
    form.status === "concluida" || form.status === "cancelada";
  const podeEnviar = editavel && !enviandoAgora;

  const carregarLista = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const qs = listaArquivadas ? "?arquivadas=1" : "";
      const data = await fetchAdmin(`/api/admin/marketing/campanhas${qs}`);
      setCampanhas(data.campanhas || []);
    } catch (err) {
      if (err.code === "UNAUTHORIZED") {
        clearAdminSession();
        onLogout();
        return;
      }
      setError(mensagemParaUsuario(err.message));
    } finally {
      setLoading(false);
    }
  }, [onLogout, listaArquivadas]);

  useEffect(() => {
    carregarLista();
  }, [carregarLista]);

  useEffect(() => {
    const t = setTimeout(() => setBuscaDebounced(buscaCliente.trim()), 280);
    return () => clearTimeout(t);
  }, [buscaCliente]);

  const carregarClientes = useCallback(async () => {
    setLoadingClientes(true);
    try {
      const qs = new URLSearchParams();
      if (buscaDebounced) qs.set("busca", buscaDebounced);
      if (!mostrarIndisponiveis) qs.set("apenasElegiveis", "1");
      const data = await fetchAdmin(
        `/api/admin/marketing/clientes?${qs.toString()}`
      );
      setClientes(data.clientes || []);
      setClientesResumo(data.resumo || null);
    } catch (err) {
      if (err.code === "UNAUTHORIZED") {
        clearAdminSession();
        onLogout();
        return;
      }
      setError(mensagemParaUsuario(err.message));
    } finally {
      setLoadingClientes(false);
    }
  }, [buscaDebounced, mostrarIndisponiveis, onLogout]);

  useEffect(() => {
    if (vista !== "editor") return;
    if (form.publico !== "emails_especificos") return;
    carregarClientes();
  }, [vista, form.publico, carregarClientes]);

  useEffect(() => {
    if (vista !== "editor") return undefined;
    let ativo = true;
    (async () => {
      try {
        const data = await fetchAdmin("/api/admin/marketing/resumo");
        if (!ativo) return;
        setClientesResumo((prev) => ({
          ...(prev || {}),
          elegiveis: data.elegiveis,
          semEmail: data.semEmail,
          optOut: data.optOut,
          total: (data.elegiveis || 0) + (data.semEmail || 0),
        }));
      } catch {
        /* ignore */
      }
    })();
    return () => {
      ativo = false;
    };
  }, [vista]);

  useEffect(() => {
    if (!campanhaId || form.status !== "enviando") return undefined;
    let ativo = true;
    const timer = setInterval(async () => {
      try {
        const data = await fetchAdmin(
          `/api/admin/marketing/campanhas/${campanhaId}/progresso`
        );
        if (!ativo) return;
        setProgresso(data);
        setForm((prev) => ({
          ...prev,
          ...data.campanha,
          status: data.campanha.status,
        }));
        if (data.campanha.status === "concluida") {
          clearInterval(timer);
          carregarLista();
        }
      } catch {
        /* ignore */
      }
    }, 2000);
    return () => {
      ativo = false;
      clearInterval(timer);
    };
  }, [campanhaId, form.status, carregarLista]);

  function handleSair() {
    clearAdminSession();
    onLogout();
  }

  function novaCampanha() {
    setCampanhaId(null);
    setForm({ ...CAMPANHA_VAZIA });
    setEmailsSelecionados(new Set());
    setDestResumo(null);
    setPreviewHtml("");
    setProgresso(null);
    setSucesso("");
    setError("");
    setBuscaCliente("");
    setAvancado(false);
    setVista("editor");
  }

  async function abrirCampanha(id) {
    setError("");
    setSucesso("");
    setLoading(true);
    try {
      const data = await fetchAdmin(`/api/admin/marketing/campanhas/${id}`);
      const c = data.campanha;
      setCampanhaId(c.id);
      const html =
        String(c.corpoHtml || "").trim() ||
        (c.corpoMd
          ? `<p>${String(c.corpoMd)
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")
              .replace(/\n\n+/g, "</p><p>")
              .replace(/\n/g, "<br>")}</p>`
          : "");
      setForm({
        ...c,
        corpoHtml: html,
        emailsEspecificos: c.emailsEspecificos || [],
      });
      setEmailsSelecionados(new Set(c.emailsEspecificos || []));
      setDestResumo(data.destinatariosResumo || null);
      setPreviewHtml("");
      setVista("editor");
      if (c.status === "enviando" || c.status === "concluida") {
        const prog = await fetchAdmin(
          `/api/admin/marketing/campanhas/${id}/progresso`
        );
        setProgresso(prog);
      }
      // preview automático com mídia
      try {
        const prev = await fetchAdmin(
          `/api/admin/marketing/campanhas/${id}/preview`,
          { method: "POST", body: "{}" }
        );
        setPreviewHtml(prev.html || "");
      } catch {
        /* preview opcional ao abrir */
      }
    } catch (err) {
      if (err.code === "UNAUTHORIZED") {
        clearAdminSession();
        onLogout();
        return;
      }
      setError(mensagemParaUsuario(err.message));
    } finally {
      setLoading(false);
    }
  }

  function payloadAtual() {
    return {
      assunto: form.assunto,
      preheader: form.preheader,
      corpoMd: form.corpoMd || "",
      corpoHtml: form.corpoHtml || "",
      corpoTexto: form.corpoTexto || "",
      publico: form.publico,
      emailsEspecificos:
        form.publico === "emails_especificos"
          ? [...emailsSelecionados]
          : [],
    };
  }

  async function salvar() {
    setSaving(true);
    setError("");
    setSucesso("");
    try {
      const body = payloadAtual();
      let data;
      if (campanhaId) {
        data = await fetchAdmin(`/api/admin/marketing/campanhas/${campanhaId}`, {
          method: "PUT",
          body: JSON.stringify(body),
        });
      } else {
        data = await fetchAdmin("/api/admin/marketing/campanhas", {
          method: "POST",
          body: JSON.stringify(body),
        });
      }
      const c = data.campanha;
      setCampanhaId(c.id);
      setForm({ ...c });
      setEmailsSelecionados(new Set(c.emailsEspecificos || []));
      const detalhe = await fetchAdmin(
        `/api/admin/marketing/campanhas/${c.id}`
      );
      setDestResumo(detalhe.destinatariosResumo || null);
      setSucesso("Campanha salva.");
      try {
        const prev = await fetchAdmin(
          `/api/admin/marketing/campanhas/${c.id}/preview`,
          { method: "POST", body: "{}" }
        );
        setPreviewHtml(prev.html || "");
      } catch {
        /* ignore */
      }
      await carregarLista();
      return c;
    } catch (err) {
      if (err.code === "UNAUTHORIZED") {
        clearAdminSession();
        onLogout();
        return null;
      }
      setError(mensagemParaUsuario(err.message));
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function gerarPreview() {
    setError("");
    const c = await salvar();
    if (!c?.id) return;
    try {
      const data = await fetchAdmin(
        `/api/admin/marketing/campanhas/${c.id}/preview`,
        { method: "POST", body: "{}" }
      );
      setPreviewHtml(data.html || "");
    } catch (err) {
      setError(mensagemParaUsuario(err.message));
    }
  }

  async function enviarTeste() {
    setError("");
    setSucesso("");
    const c = await salvar();
    if (!c?.id) return;
    try {
      const data = await fetchAdmin(
        `/api/admin/marketing/campanhas/${c.id}/teste`,
        {
          method: "POST",
          body: JSON.stringify({ email: emailTeste }),
        }
      );
      setSucesso(data.message || "Teste enviado.");
    } catch (err) {
      setError(mensagemParaUsuario(err.message));
    }
  }

  async function enviarAgora() {
    const n =
      form.publico === "emails_especificos"
        ? emailsSelecionados.size
        : destResumo?.elegiveis ?? clientesResumo?.elegiveis;
    const reenvio = jaEnviada;
    const ok = window.confirm(
      reenvio
        ? n != null
          ? `Esta campanha já foi enviada. Reenviar agora para ${n} destinatário(s)?`
          : "Esta campanha já foi enviada. Reenviar agora?"
        : n != null
          ? `Enviar esta campanha para ${n} destinatário(s)?`
          : "Enviar esta campanha agora?"
    );
    if (!ok) return;

    setError("");
    setSucesso("");
    const c = await salvar();
    if (!c?.id) return;
    try {
      const data = await fetchAdmin(
        `/api/admin/marketing/campanhas/${c.id}/enviar`,
        { method: "POST", body: "{}" }
      );
      setSucesso(data.message || "Envio iniciado.");
      setForm((prev) => ({ ...prev, status: "enviando" }));
      setCampanhaId(c.id);
      const prog = await fetchAdmin(
        `/api/admin/marketing/campanhas/${c.id}/progresso`
      );
      setProgresso(prog);
    } catch (err) {
      setError(mensagemParaUsuario(err.message));
    }
  }

  async function alternarArquivo(id, arquivar) {
    setError("");
    setSucesso("");
    try {
      const path = arquivar
        ? `/api/admin/marketing/campanhas/${id}/arquivar`
        : `/api/admin/marketing/campanhas/${id}/desarquivar`;
      const data = await fetchAdmin(path, { method: "POST", body: "{}" });
      setSucesso(data.message || (arquivar ? "Arquivada." : "Restaurada."));
      if (campanhaId === id) {
        setForm((prev) => ({
          ...prev,
          arquivadoEm: data.campanha?.arquivadoEm ?? null,
        }));
        if (arquivar) setVista("lista");
      }
      await carregarLista();
    } catch (err) {
      if (err.code === "UNAUTHORIZED") {
        clearAdminSession();
        onLogout();
        return;
      }
      setError(mensagemParaUsuario(err.message));
    }
  }

  function toggleEmail(email, elegivel) {
    if (!editavel || !elegivel || !email) return;
    setEmailsSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  }

  function marcarVisiveis() {
    setEmailsSelecionados((prev) => {
      const next = new Set(prev);
      for (const c of clientes) {
        if (c.elegivel && c.email) next.add(c.email);
      }
      return next;
    });
  }

  function limparSelecao() {
    setEmailsSelecionados(new Set());
  }

  const selecionadosVisiveis = useMemo(
    () => clientes.filter((c) => c.email && emailsSelecionados.has(c.email)).length,
    [clientes, emailsSelecionados]
  );

  return (
    <AdminLayout tab={tab} onTabChange={onTabChange} onLogout={handleSair} admin={admin}>
      <div className="admin-marketing-stack">
        <header className="admin-page-head">
          <div>
            <button
              type="button"
              className="admin-btn admin-btn--ghost admin-btn--sm"
              onClick={onVoltarHub}
            >
              ← Marketing
            </button>
            <h1>E-mail promocional</h1>
            <p>
              Monte a mensagem, escolha quem recebe e envie. O descadastro entra
              sozinho no rodapé.
            </p>
          </div>
          {vista === "lista" ? (
            <button
              type="button"
              className="admin-btn admin-btn--primary"
              onClick={novaCampanha}
            >
              Nova campanha
            </button>
          ) : (
            <button
              type="button"
              className="admin-btn admin-btn--ghost"
              onClick={() => {
                setVista("lista");
                carregarLista();
              }}
            >
              Voltar à lista
            </button>
          )}
        </header>

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

        {vista === "lista" && (
          <section className="admin-card">
            <header className="admin-card__head">
              <div>
                <h2>Campanhas</h2>
                <p className="admin-card__sub admin-card__sub--tight">
                  {listaArquivadas
                    ? "Campanhas arquivadas"
                    : "Rascunhos e envios ativos"}
                </p>
              </div>
              <div className="admin-marketing-tabs">
                <button
                  type="button"
                  className={`admin-mkt-editor__btn${!listaArquivadas ? " is-upload" : ""}`}
                  onClick={() => setListaArquivadas(false)}
                >
                  Ativas
                </button>
                <button
                  type="button"
                  className={`admin-mkt-editor__btn${listaArquivadas ? " is-upload" : ""}`}
                  onClick={() => setListaArquivadas(true)}
                >
                  Arquivadas
                </button>
              </div>
            </header>
            {loading ? (
              <p className="admin-usuarios-loading">Carregando…</p>
            ) : campanhas.length === 0 ? (
              <p className="admin-usuarios-loading">
                {listaArquivadas
                  ? "Nenhuma campanha arquivada."
                  : "Nenhuma campanha ainda. Crie a primeira."}
              </p>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Assunto</th>
                      <th>Para</th>
                      <th>Status</th>
                      <th>Enviados</th>
                      <th>Criada</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {campanhas.map((c) => (
                      <tr key={c.id}>
                        <td>{c.assunto}</td>
                        <td>
                          {c.publico === "emails_especificos"
                            ? `${(c.emailsEspecificos || []).length} selecionado(s)`
                            : "Todos elegíveis"}
                        </td>
                        <td>{statusLabel(c.status)}</td>
                        <td>
                          {c.totalEnviados}/{c.totalDestinatarios || "—"}
                        </td>
                        <td>{formatarDataHora(c.criadoEm)}</td>
                        <td>
                          <div className="admin-relatorio-filtros__acoes">
                            <button
                              type="button"
                              className="admin-btn admin-btn--ghost admin-btn--sm"
                              onClick={() => abrirCampanha(c.id)}
                            >
                              Abrir
                            </button>
                            {listaArquivadas ? (
                              <button
                                type="button"
                                className="admin-btn admin-btn--ghost admin-btn--sm"
                                onClick={() => alternarArquivo(c.id, false)}
                              >
                                Restaurar
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="admin-btn admin-btn--ghost admin-btn--sm"
                                disabled={c.status === "enviando"}
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      "Arquivar esta campanha? Ela sai da lista ativa."
                                    )
                                  ) {
                                    alternarArquivo(c.id, true);
                                  }
                                }}
                              >
                                Arquivar
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {vista === "editor" && (
          <div className="admin-marketing-editor">
            <section className="admin-card">
              <header className="admin-card__head">
                <div>
                  <h2>1. Destinatários</h2>
                  <p className="admin-card__sub admin-card__sub--tight">
                    Status: {statusLabel(form.status || "rascunho")}
                    {campanhaId ? ` · #${campanhaId}` : ""}
                    {jaEnviada
                      ? " · você pode editar e reenviar"
                      : ""}
                    {form.arquivadoEm ? " · arquivada" : ""}
                  </p>
                </div>
                {campanhaId && !enviandoAgora ? (
                  <button
                    type="button"
                    className="admin-btn admin-btn--ghost admin-btn--sm"
                    onClick={() => {
                      if (form.arquivadoEm) {
                        alternarArquivo(campanhaId, false);
                        return;
                      }
                      if (
                        window.confirm(
                          "Arquivar esta campanha? Ela sai da lista ativa."
                        )
                      ) {
                        alternarArquivo(campanhaId, true);
                      }
                    }}
                  >
                    {form.arquivadoEm ? "Restaurar" : "Arquivar"}
                  </button>
                ) : null}
              </header>

              {jaEnviada && editavel && (
                <p className="admin-marketing-dest-resumo">
                  Campanha já enviada. Altere o conteúdo ou os destinatários e
                  use <strong>Reenviar agora</strong> para mandar de novo.
                </p>
              )}

              {enviandoAgora && (
                <p className="admin-marketing-dest-resumo">
                  Envio em andamento — edição bloqueada até concluir.
                </p>
              )}

              <div className="admin-marketing-modo">
                <button
                  type="button"
                  disabled={!editavel}
                  className={`admin-marketing-modo__opcao${
                    form.publico === "todos_elegiveis"
                      ? " admin-marketing-modo__opcao--ativa"
                      : ""
                  }`}
                  onClick={() =>
                    setForm((p) => ({ ...p, publico: "todos_elegiveis" }))
                  }
                >
                  <strong>Todos do clube</strong>
                  <span>
                    Envia para todos com e-mail e sem opt-out
                    {clientesResumo?.elegiveis != null
                      ? ` (${clientesResumo.elegiveis})`
                      : destResumo?.elegiveis != null
                        ? ` (${destResumo.elegiveis})`
                        : ""}
                    .
                  </span>
                </button>
                <button
                  type="button"
                  disabled={!editavel}
                  className={`admin-marketing-modo__opcao${
                    form.publico === "emails_especificos"
                      ? " admin-marketing-modo__opcao--ativa"
                      : ""
                  }`}
                  onClick={() =>
                    setForm((p) => ({ ...p, publico: "emails_especificos" }))
                  }
                >
                  <strong>Escolher clientes</strong>
                  <span>
                    Marque um ou mais nomes da lista
                    {emailsSelecionados.size
                      ? ` · ${emailsSelecionados.size} marcado(s)`
                      : ""}
                    .
                  </span>
                </button>
              </div>

              {form.publico === "emails_especificos" && (
                <div className="admin-marketing-picker">
                  <div className="admin-marketing-picker__toolbar">
                    <Field label="Buscar cliente">
                      <input
                        value={buscaCliente}
                        disabled={!editavel}
                        onChange={(e) => setBuscaCliente(e.target.value)}
                        placeholder="Nome, e-mail ou CPF"
                        autoComplete="off"
                      />
                    </Field>
                    <div className="admin-marketing-picker__acoes">
                      <label className="admin-marketing-check-inline">
                        <input
                          type="checkbox"
                          checked={mostrarIndisponiveis}
                          onChange={(e) =>
                            setMostrarIndisponiveis(e.target.checked)
                          }
                        />
                        Mostrar sem e-mail / opt-out
                      </label>
                      {editavel && (
                        <>
                          <button
                            type="button"
                            className="admin-btn admin-btn--ghost admin-btn--sm"
                            onClick={marcarVisiveis}
                          >
                            Marcar visíveis
                          </button>
                          <button
                            type="button"
                            className="admin-btn admin-btn--ghost admin-btn--sm"
                            onClick={limparSelecao}
                          >
                            Limpar
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <p className="admin-marketing-dest-resumo">
                    Marcados: <strong>{emailsSelecionados.size}</strong>
                    {selecionadosVisiveis > 0
                      ? ` · ${selecionadosVisiveis} nesta lista`
                      : ""}
                    {clientesResumo
                      ? ` · Elegíveis no clube: ${clientesResumo.elegiveis}`
                      : ""}
                  </p>

                  <div className="admin-marketing-picker__lista" role="list">
                    {loadingClientes ? (
                      <p className="admin-usuarios-loading">Carregando clientes…</p>
                    ) : clientes.length === 0 ? (
                      <p className="admin-usuarios-loading">
                        Nenhum cliente encontrado.
                      </p>
                    ) : (
                      clientes.map((c) => {
                        const marcado =
                          Boolean(c.email) && emailsSelecionados.has(c.email);
                        return (
                          <label
                            key={c.id}
                            className={`admin-marketing-cliente${
                              !c.elegivel
                                ? " admin-marketing-cliente--off"
                                : ""
                            }${
                              marcado ? " admin-marketing-cliente--on" : ""
                            }`}
                            role="listitem"
                          >
                            <input
                              type="checkbox"
                              disabled={!editavel || !c.elegivel}
                              checked={marcado}
                              onChange={() => toggleEmail(c.email, c.elegivel)}
                            />
                            <span className="admin-marketing-cliente__corpo">
                              <strong>{c.nome}</strong>
                              <span>{c.email || "Sem e-mail"}</span>
                              {c.motivo ? <em>{c.motivo}</em> : null}
                            </span>
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {form.publico === "todos_elegiveis" && (
                <p className="admin-marketing-dest-resumo">
                  {destResumo
                    ? <>Vão receber: <strong>{destResumo.elegiveis}</strong>
                      {destResumo.semEmail
                        ? ` · Sem e-mail: ${destResumo.semEmail}`
                        : ""}
                      {destResumo.optOut
                        ? ` · Opt-out: ${destResumo.optOut}`
                        : ""}</>
                    : "Salve o rascunho para calcular quantos vão receber."}
                </p>
              )}
            </section>

            <section className="admin-card">
              <header className="admin-card__head">
                <div>
                  <h2>2. Mensagem</h2>
                  <p className="admin-card__sub admin-card__sub--tight">
                    Assunto e conteúdo do e-mail
                  </p>
                </div>
              </header>

              <div className="admin-form">
                <Field label="Assunto *">
                  <input
                    value={form.assunto}
                    disabled={!editavel}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, assunto: e.target.value }))
                    }
                    maxLength={200}
                    placeholder="Ex.: Ofertas da semana no Superama"
                  />
                </Field>

                <Field
                  label="Texto curto na caixa de entrada"
                  hint="Opcional — aparece ao lado do assunto em alguns apps"
                >
                  <input
                    value={form.preheader || ""}
                    disabled={!editavel}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, preheader: e.target.value }))
                    }
                    maxLength={200}
                  />
                </Field>

                <div className="admin-marketing-conteudo">
                  <div className="admin-marketing-conteudo__label">
                    Conteúdo da mensagem *
                  </div>
                  <MarketingRichEditor
                    value={form.corpoHtml || ""}
                    disabled={!editavel}
                    onUnauthorized={() => {
                      clearAdminSession();
                      onLogout();
                    }}
                    onChange={(html) =>
                      setForm((p) => ({
                        ...p,
                        corpoHtml: html,
                      }))
                    }
                  />
                </div>

                <button
                  type="button"
                  className="admin-btn admin-btn--ghost admin-btn--sm"
                  onClick={() => setAvancado((v) => !v)}
                >
                  {avancado ? "Ocultar opções avançadas" : "Opções avançadas"}
                </button>

                {avancado && (
                  <>
                    <Field
                      label="HTML bruto"
                      hint="Editado automaticamente pelo editor visual"
                    >
                      <textarea
                        rows={8}
                        disabled={!editavel}
                        value={form.corpoHtml || ""}
                        onChange={(e) =>
                          setForm((p) => ({ ...p, corpoHtml: e.target.value }))
                        }
                      />
                    </Field>
                    <Field
                      label="Versão texto puro"
                      hint="Se vazio, o servidor gera a partir do HTML"
                    >
                      <textarea
                        rows={6}
                        disabled={!editavel}
                        value={form.corpoTexto || ""}
                        onChange={(e) =>
                          setForm((p) => ({ ...p, corpoTexto: e.target.value }))
                        }
                      />
                    </Field>
                  </>
                )}
              </div>
            </section>

            <section className="admin-card">
              <header className="admin-card__head">
                <div>
                  <h2>3. Revisar e enviar</h2>
                  <p className="admin-card__sub admin-card__sub--tight">
                    Preview, teste e envio final
                  </p>
                </div>
              </header>

              {podeEnviar && (
                <div className="admin-marketing-envio-box">
                  <div className="admin-relatorio-filtros__acoes">
                    <button
                      type="button"
                      className="admin-btn admin-btn--ghost"
                      disabled={saving}
                      onClick={salvar}
                    >
                      {saving ? "Salvando…" : "Salvar"}
                    </button>
                    <button
                      type="button"
                      className="admin-btn admin-btn--ghost"
                      disabled={saving}
                      onClick={gerarPreview}
                    >
                      Ver preview
                    </button>
                  </div>

                  <Field label="Enviar teste para">
                    <input
                      type="email"
                      value={emailTeste}
                      onChange={(e) => setEmailTeste(e.target.value)}
                      placeholder="seu@email.com"
                    />
                  </Field>

                  <div className="admin-relatorio-filtros__acoes">
                    <button
                      type="button"
                      className="admin-btn admin-btn--ghost"
                      disabled={saving}
                      onClick={enviarTeste}
                    >
                      Enviar teste
                    </button>
                    <button
                      type="button"
                      className="admin-btn admin-btn--primary"
                      disabled={saving}
                      onClick={enviarAgora}
                    >
                      {jaEnviada ? "Reenviar agora" : "Enviar agora"}
                    </button>
                  </div>
                </div>
              )}

              {previewHtml ? (
                <iframe
                  title="Preview do e-mail"
                  className="admin-marketing-preview"
                  srcDoc={previewHtml}
                  sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"
                />
              ) : (
                <p className="admin-usuarios-loading">
                  Clique em “Ver preview” para visualizar imagens e vídeos.
                </p>
              )}

              {previewHtml ? (
                <p className="admin-marketing-dest-resumo">
                  No preview, imagens e vídeos aparecem para conferência. No
                  e-mail real, vídeo fica como botão “Assistir” (compatível com
                  Gmail, Outlook etc.).
                </p>
              ) : null}

              {progresso && (
                <div className="admin-marketing-progresso">
                  <strong>Progresso do envio</strong>
                  <p>
                    Enviados: {progresso.porStatus?.enviado || 0} · Falhas:{" "}
                    {progresso.porStatus?.falha || 0} · Pendentes:{" "}
                    {progresso.porStatus?.pendente || 0}
                    {progresso.emAndamento ? " · processando…" : ""}
                  </p>
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
