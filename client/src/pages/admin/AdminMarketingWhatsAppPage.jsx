import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout.jsx";
import Field from "../../components/Field.jsx";
import {
  clearAdminSession,
  fetchAdmin,
  loadAdminSession,
  resolveImagemUrl,
} from "../../utils/adminSession.js";
import { apiUrl, parseApiResponse } from "../../utils/api.js";
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

function labelPublicoCampanha(c) {
  if (c.publico === "telefones_especificos") {
    return `${(c.telefonesEspecificos || []).length} selecionado(s)`;
  }
  if (c.publico === "carteira_whatsapp") return "Carteira WhatsApp (todos)";
  if (c.publico === "carteira_com_clube") return "Carteira · com Clube";
  if (c.publico === "carteira_sem_clube") return "Carteira · sem Clube";
  return "Todos com celular (cadastro)";
}

function formatarTelefoneExibicao(tel) {
  const d = String(tel || "").replace(/\D/g, "");
  const local = d.startsWith("55") ? d.slice(2) : d;
  if (local.length === 11) {
    return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  }
  if (local.length === 10) {
    return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  }
  return tel || "—";
}

async function uploadMarketingMidia(file) {
  const session = loadAdminSession();
  if (!session?.token) throw new Error("Sessão de administrador não encontrada");

  const formData = new FormData();
  const isVideo = String(file.type || "").startsWith("video/");
  formData.append(isVideo ? "video" : "arquivo", file);

  const response = await fetch(apiUrl("/api/admin/marketing/upload"), {
    method: "POST",
    headers: { Authorization: `Bearer ${session.token}` },
    body: formData,
  });
  const { data } = await parseApiResponse(response);
  if (response.status === 401) {
    clearAdminSession();
    const err = new Error("Sessão expirada. Faça login novamente.");
    err.code = "UNAUTHORIZED";
    throw err;
  }
  if (!response.ok) {
    throw new Error(mensagemParaUsuario(data.error));
  }
  return data;
}

const CAMPANHA_VAZIA = {
  assunto: "",
  templateNome: "",
  templateIdioma: "pt_BR",
  midiaUrl: "",
  midiaTipo: "video",
  bodyParams: [],
  buttonUrlParams: [],
  publico: "telefones_especificos",
  telefonesEspecificos: [],
};

export default function AdminMarketingWhatsAppPage({
  tab,
  onTabChange,
  onLogout,
  admin,
  onVoltarHub,
  onAbrirAutoReply,
}) {
  const [vista, setVista] = useState("lista");
  const [listaArquivadas, setListaArquivadas] = useState(false);
  const [campanhas, setCampanhas] = useState([]);
  const [campanhaId, setCampanhaId] = useState(null);
  const [form, setForm] = useState(CAMPANHA_VAZIA);
  const [bodyParams, setBodyParams] = useState([]);
  const [buttonParams, setButtonParams] = useState([]);
  const [telefonesSelecionados, setTelefonesSelecionados] = useState(
    () => new Set()
  );
  const [telefoneTeste, setTelefoneTeste] = useState("");
  const [destResumo, setDestResumo] = useState(null);
  const [progresso, setProgresso] = useState(null);
  const [waOk, setWaOk] = useState(null);
  const [templatePadrao, setTemplatePadrao] = useState("");
  const [templates, setTemplates] = useState([]);
  const [templateSel, setTemplateSel] = useState(null);
  const [buscaTemplate, setBuscaTemplate] = useState("");
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [clientes, setClientes] = useState([]);
  const [clientesResumo, setClientesResumo] = useState(null);
  const [buscaCliente, setBuscaCliente] = useState("");
  const [buscaDebounced, setBuscaDebounced] = useState("");
  const [mostrarIndisponiveis, setMostrarIndisponiveis] = useState(false);
  const [loadingClientes, setLoadingClientes] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [modalTeste, setModalTeste] = useState(false);
  const fileInputRef = useRef(null);

  const editavel =
    !campanhaId ||
    !form.status ||
    form.status === "rascunho" ||
    form.status === "concluida" ||
    form.status === "cancelada";
  const enviandoAgora = form.status === "enviando";

  const templatesFiltrados = useMemo(() => {
    const q = buscaTemplate.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter(
      (t) =>
        t.nome.toLowerCase().includes(q) ||
        String(t.idioma || "")
          .toLowerCase()
          .includes(q) ||
        String(t.categoria || "")
          .toLowerCase()
          .includes(q)
    );
  }, [templates, buscaTemplate]);

  const carregarLista = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams({ canal: "whatsapp" });
      if (listaArquivadas) qs.set("arquivadas", "1");
      const data = await fetchAdmin(
        `/api/admin/marketing/campanhas?${qs.toString()}`
      );
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

  const carregarTemplates = useCallback(async () => {
    setLoadingTemplates(true);
    try {
      const data = await fetchAdmin("/api/admin/marketing/whatsapp/templates");
      setTemplates(data.templates || []);
    } catch (err) {
      if (err.code === "UNAUTHORIZED") {
        clearAdminSession();
        onLogout();
        return;
      }
      setError(
        mensagemParaUsuario(
          err.message || "Não foi possível listar templates da Meta"
        )
      );
    } finally {
      setLoadingTemplates(false);
    }
  }, [onLogout]);

  useEffect(() => {
    carregarLista();
  }, [carregarLista]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("wa_campanha_telefones");
      if (raw && JSON.parse(raw)?.length) {
        // Vindo da carteira: abre editor já com os telefones
        novaCampanha();
      }
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só na montagem
  }, []);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const data = await fetchAdmin("/api/admin/marketing/resumo");
        if (!ativo) return;
        setWaOk(Boolean(data.whatsappDisponivel));
        setTemplatePadrao(data.whatsappTemplatePadrao || "");
        if (data.whatsappDisponivel) {
          carregarTemplates();
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      ativo = false;
    };
  }, [carregarTemplates]);

  useEffect(() => {
    const t = setTimeout(() => setBuscaDebounced(buscaCliente.trim()), 280);
    return () => clearTimeout(t);
  }, [buscaCliente]);

  const carregarClientes = useCallback(async () => {
    setLoadingClientes(true);
    try {
      const qs = new URLSearchParams({ canal: "whatsapp" });
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
    if (form.publico !== "telefones_especificos") return;
    carregarClientes();
  }, [vista, form.publico, carregarClientes]);

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

  function aplicarTemplateMeta(t) {
    if (!t) return;
    setTemplateSel(t);
    setForm((p) => ({
      ...p,
      templateNome: t.nome,
      templateIdioma: t.idioma || "pt_BR",
      midiaTipo:
        t.headerTipo === "IMAGE"
          ? "image"
          : t.headerTipo === "VIDEO"
            ? "video"
            : p.midiaTipo || "video",
      assunto: p.assunto || t.nome,
    }));
    setBodyParams(Array.from({ length: t.bodyVars || 0 }, () => ""));
    setButtonParams(Array.from({ length: t.buttonUrlVars || 0 }, () => ""));
    setSucesso(
      `Template “${t.nome}” · ${t.bodyVars || 0} var. no corpo · ${
        t.buttonUrlVars || 0
      } no botão` + (t.exigeMidia ? ` · header ${t.headerTipo}` : "")
    );
  }

  function novaCampanha() {
    setCampanhaId(null);
    let phonesFromCarteira = [];
    try {
      const raw = sessionStorage.getItem("wa_campanha_telefones");
      if (raw) {
        phonesFromCarteira = JSON.parse(raw);
        sessionStorage.removeItem("wa_campanha_telefones");
      }
    } catch {
      phonesFromCarteira = [];
    }
    const temCarteira =
      Array.isArray(phonesFromCarteira) && phonesFromCarteira.length > 0;

    setForm({
      ...CAMPANHA_VAZIA,
      templateNome: templatePadrao || "",
      publico: temCarteira ? "telefones_especificos" : CAMPANHA_VAZIA.publico,
    });
    setBodyParams([]);
    setButtonParams([]);
    setTelefonesSelecionados(
      temCarteira ? new Set(phonesFromCarteira.map(String)) : new Set()
    );
    setTelefoneTeste("45998331383");
    setTemplateSel(null);
    setDestResumo(null);
    setProgresso(null);
    setSucesso(
      temCarteira
        ? `${phonesFromCarteira.length} telefone(s) da carteira carregados.`
        : ""
    );
    setError("");
    setVista("editor");
    if (templatePadrao && templates.length) {
      const t = templates.find((x) => x.nome === templatePadrao);
      if (t) setTimeout(() => aplicarTemplateMeta(t), 0);
    }
  }

  async function abrirCampanha(id) {
    setError("");
    setSucesso("");
    setLoading(true);
    try {
      const data = await fetchAdmin(`/api/admin/marketing/campanhas/${id}`);
      const c = data.campanha;
      setCampanhaId(c.id);
      setForm({
        ...c,
        midiaTipo: c.midiaTipo || "video",
      });
      setBodyParams([...(c.bodyParams || [])]);
      setButtonParams([...(c.buttonUrlParams || [])]);
      setTelefonesSelecionados(new Set(c.telefonesEspecificos || []));
      setTelefoneTeste(c.telefoneTeste || "");
      setDestResumo(data.destinatariosResumo || null);
      const t = templates.find(
        (x) => x.nome === c.templateNome && x.idioma === c.templateIdioma
      ) || templates.find((x) => x.nome === c.templateNome);
      setTemplateSel(t || null);
      setVista("editor");
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

  function payloadForm() {
    return {
      canal: "whatsapp",
      assunto: form.assunto,
      templateNome: form.templateNome,
      templateIdioma: form.templateIdioma || "pt_BR",
      midiaUrl: form.midiaUrl,
      midiaTipo: form.midiaTipo || "video",
      bodyParams: bodyParams.map((s) => String(s ?? "").trim()),
      buttonUrlParams: buttonParams.map((s) => String(s ?? "").trim()),
      publico: form.publico,
      telefonesEspecificos: [...telefonesSelecionados],
    };
  }

  async function salvar() {
    setSaving(true);
    setError("");
    setSucesso("");
    try {
      const body = payloadForm();
      if (
        form.publico === "telefones_especificos" &&
        !body.telefonesEspecificos.length
      ) {
        throw new Error("Selecione ao menos um cliente ou telefone");
      }
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
      setForm((prev) => ({ ...prev, ...c }));
      setSucesso("Campanha salva.");
      const detalhe = await fetchAdmin(
        `/api/admin/marketing/campanhas/${c.id}`
      );
      setDestResumo(detalhe.destinatariosResumo || null);
      carregarLista();
    } catch (err) {
      if (err.code === "UNAUTHORIZED") {
        clearAdminSession();
        onLogout();
        return;
      }
      setError(mensagemParaUsuario(err.message));
    } finally {
      setSaving(false);
    }
  }

  async function processarArquivoMidia(file) {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const data = await uploadMarketingMidia(file);
      setForm((prev) => ({
        ...prev,
        midiaUrl: data.url,
        midiaTipo: data.tipo || "video",
      }));
      setSucesso(
        data.tipo === "image"
          ? "Imagem pronta para o template."
          : "Vídeo pronto para o template."
      );
    } catch (err) {
      if (err.code === "UNAUTHORIZED") {
        clearAdminSession();
        onLogout();
        return;
      }
      setError(mensagemParaUsuario(err.message));
    } finally {
      setUploading(false);
    }
  }

  async function salvarSilencioso() {
    const body = payloadForm();
    const data = await fetchAdmin(
      `/api/admin/marketing/campanhas/${campanhaId}`,
      {
        method: "PUT",
        body: JSON.stringify(body),
      }
    );
    setForm((prev) => ({ ...prev, ...data.campanha }));
  }

  async function enviarTeste() {
    if (!campanhaId) {
      setError("Salve a campanha antes de enviar o teste.");
      return;
    }
    setSaving(true);
    setError("");
    setSucesso("");
    try {
      await salvarSilencioso();
      const data = await fetchAdmin(
        `/api/admin/marketing/campanhas/${campanhaId}/teste`,
        {
          method: "POST",
          body: JSON.stringify({ telefone: telefoneTeste }),
        }
      );
      setSucesso(data.message || "Teste enviado.");
      setModalTeste(false);
    } catch (err) {
      setError(mensagemParaUsuario(err.message));
    } finally {
      setSaving(false);
    }
  }

  async function enviarCampanha() {
    if (!campanhaId) {
      setError("Salve a campanha antes de enviar.");
      return;
    }
    if (
      !window.confirm(
        "Enviar esta campanha WhatsApp agora para os destinatários selecionados?"
      )
    ) {
      return;
    }
    setSaving(true);
    setError("");
    setSucesso("");
    try {
      await salvarSilencioso();
      const data = await fetchAdmin(
        `/api/admin/marketing/campanhas/${campanhaId}/enviar`,
        { method: "POST", body: JSON.stringify({}) }
      );
      setSucesso(data.message || "Envio iniciado.");
      setForm((prev) => ({ ...prev, status: "enviando" }));
    } catch (err) {
      setError(mensagemParaUsuario(err.message));
    } finally {
      setSaving(false);
    }
  }

  async function arquivar(id, arquivarFlag) {
    try {
      await fetchAdmin(
        `/api/admin/marketing/campanhas/${id}/${
          arquivarFlag ? "arquivar" : "desarquivar"
        }`,
        { method: "POST", body: JSON.stringify({}) }
      );
      carregarLista();
      if (campanhaId === id) setVista("lista");
    } catch (err) {
      setError(mensagemParaUsuario(err.message));
    }
  }

  function toggleTelefone(tel, elegivel) {
    if (!elegivel || !tel) return;
    setTelefonesSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(tel)) next.delete(tel);
      else next.add(tel);
      return next;
    });
  }

  function marcarVisiveis() {
    setTelefonesSelecionados((prev) => {
      const next = new Set(prev);
      for (const c of clientes) {
        if (c.elegivel && c.telefone) next.add(c.telefone);
      }
      return next;
    });
  }

  const midiaPreviewUrl = form.midiaUrl
    ? resolveImagemUrl(form.midiaUrl)
    : null;

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
            <h1>WhatsApp — ofertas</h1>
            <p>
              Templates da Meta, vídeo/imagem e envio para clientes do clube.
            </p>
          </div>
          {vista === "lista" && (
            <div className="admin-form-actions" style={{ margin: 0, gap: "0.5rem" }}>
              {onAbrirAutoReply && (
                <button
                  type="button"
                  className="admin-btn admin-btn--ghost"
                  onClick={onAbrirAutoReply}
                >
                  Auto-resposta
                </button>
              )}
              <button
                type="button"
                className="admin-btn admin-btn--primary"
                onClick={novaCampanha}
                disabled={waOk === false}
              >
                Nova campanha
              </button>
            </div>
          )}
        </header>

        {waOk === false && (
          <p className="admin-alert" role="alert">
            Configure WHATSAPP_CLOUD_TOKEN e WHATSAPP_CLOUD_PHONE_NUMBER_ID no
            servidor.
          </p>
        )}
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
                  className={!listaArquivadas ? "is-active" : ""}
                  onClick={() => setListaArquivadas(false)}
                >
                  Ativas
                </button>
                <button
                  type="button"
                  className={listaArquivadas ? "is-active" : ""}
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
                Nenhuma campanha WhatsApp ainda.
              </p>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Campanha</th>
                      <th>Template</th>
                      <th>Para</th>
                      <th>Status</th>
                      <th>Enviados</th>
                      <th>Quando</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {campanhas.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <strong>{c.assunto}</strong>
                        </td>
                        <td>
                          <code>{c.templateNome || "—"}</code>
                        </td>
                        <td>
                          {labelPublicoCampanha(c)}
                        </td>
                        <td>{statusLabel(c.status)}</td>
                        <td>
                          {c.totalEnviados}/{c.totalDestinatarios || "—"}
                          {c.totalFalhas > 0
                            ? ` · ${c.totalFalhas} falhas`
                            : ""}
                        </td>
                        <td>{formatarDataHora(c.enviadoEm || c.criadoEm)}</td>
                        <td>
                          <div className="admin-relatorio-filtros__acoes">
                            <button
                              type="button"
                              className="admin-btn admin-btn--ghost admin-btn--sm"
                              onClick={() => abrirCampanha(c.id)}
                            >
                              Abrir
                            </button>
                            <button
                              type="button"
                              className="admin-btn admin-btn--ghost admin-btn--sm"
                              disabled={c.status === "enviando"}
                              onClick={() => arquivar(c.id, !listaArquivadas)}
                            >
                              {listaArquivadas ? "Restaurar" : "Arquivar"}
                            </button>
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
            <div className="admin-form-actions admin-wa-sticky-bar">
              <button
                type="button"
                className="admin-btn admin-btn--ghost"
                onClick={() => {
                  setVista("lista");
                  carregarLista();
                }}
              >
                Voltar
              </button>
              <div className="admin-wa-sticky-bar__right">
                <button
                  type="button"
                  className="admin-btn admin-btn--ghost"
                  disabled={!campanhaId || saving || waOk === false}
                  onClick={() => setModalTeste(true)}
                >
                  Enviar teste
                </button>
                <button
                  type="button"
                  className="admin-btn admin-btn--primary"
                  disabled={!editavel || saving}
                  onClick={salvar}
                >
                  {saving ? "Salvando…" : "Salvar"}
                </button>
                <button
                  type="button"
                  className="admin-btn admin-btn--primary"
                  disabled={
                    !campanhaId || !editavel || saving || waOk === false
                  }
                  onClick={enviarCampanha}
                >
                  Enviar campanha
                </button>
              </div>
            </div>

            {enviandoAgora && progresso && (
              <div className="admin-marketing-envio-box">
                <p className="admin-marketing-dest-resumo">
                  Enviando… {progresso.campanha?.totalEnviados || 0} enviados ·{" "}
                  {progresso.campanha?.totalFalhas || 0} falhas ·{" "}
                  {progresso.porStatus?.pendente || 0} pendentes
                </p>
                <div className="admin-marketing-progresso">
                  <div className="admin-marketing-progresso__bar">
                    <span
                      style={{
                        width: `${Math.min(
                          100,
                          ((progresso.campanha?.totalEnviados || 0) /
                            Math.max(
                              1,
                              progresso.campanha?.totalDestinatarios || 1
                            )) *
                            100
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            <section className="admin-card">
              <header className="admin-card__head">
                <div>
                  <h2>1. Template WhatsApp</h2>
                  <p className="admin-card__sub admin-card__sub--tight">
                    Busque o template aprovado na Meta — os parâmetros são
                    preenchidos automaticamente
                  </p>
                </div>
                <button
                  type="button"
                  className="admin-btn admin-btn--ghost admin-btn--sm"
                  disabled={loadingTemplates || waOk === false}
                  onClick={carregarTemplates}
                >
                  {loadingTemplates ? "Atualizando…" : "Atualizar lista"}
                </button>
              </header>

              <div className="admin-form">
                <Field label="Nome interno da campanha">
                  <input
                    value={form.assunto}
                    disabled={!editavel}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, assunto: e.target.value }))
                    }
                    placeholder="Ex.: Ofertas 10/09"
                    maxLength={200}
                  />
                </Field>

                <div className="admin-wa-template-manual">
                  <Field
                    label="Nome do template (Meta)"
                    hint="Exatamente como está aprovado — mesmo se a lista abaixo falhar"
                  >
                    <input
                      value={form.templateNome}
                      disabled={!editavel}
                      onChange={(e) => {
                        setTemplateSel(null);
                        setForm((p) => ({
                          ...p,
                          templateNome: e.target.value,
                        }));
                      }}
                      placeholder="ex.: ofertas_superma_video"
                    />
                  </Field>
                  <Field label="Idioma">
                    <input
                      value={form.templateIdioma}
                      disabled={!editavel}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          templateIdioma: e.target.value,
                        }))
                      }
                      placeholder="pt_BR"
                    />
                  </Field>
                </div>

                <Field label="Buscar na lista da Meta">
                  <input
                    value={buscaTemplate}
                    onChange={(e) => setBuscaTemplate(e.target.value)}
                    placeholder="Filtrar por nome, idioma ou categoria"
                    disabled={!editavel}
                    autoComplete="off"
                  />
                </Field>

                <div className="admin-wa-template-grid" role="list">
                  {loadingTemplates && !templates.length ? (
                    <p className="admin-usuarios-loading">
                      Carregando templates da Meta…
                    </p>
                  ) : templatesFiltrados.length === 0 ? (
                    <p className="admin-usuarios-loading">
                      Lista da Meta indisponível. Preencha o nome do template
                      acima e as variáveis na seção 3. Se quiser a lista
                      automática, configure WHATSAPP_WABA_ID no .env.
                    </p>
                  ) : (
                    templatesFiltrados.map((t) => {
                      const ativo =
                        form.templateNome === t.nome &&
                        form.templateIdioma === t.idioma;
                      return (
                        <button
                          key={`${t.nome}-${t.idioma}-${t.id || ""}`}
                          type="button"
                          role="listitem"
                          disabled={!editavel}
                          className={`admin-wa-template-card${
                            ativo ? " is-active" : ""
                          }`}
                          onClick={() => aplicarTemplateMeta(t)}
                        >
                          <strong>{t.nome}</strong>
                          <span>
                            {t.idioma} · {t.categoria || "—"}
                          </span>
                          <small>
                            {t.exigeMidia
                              ? `Header ${t.headerTipo}`
                              : "Sem mídia"}
                            {" · "}
                            {t.bodyVars} var. corpo
                            {" · "}
                            {t.buttonUrlVars} var. botão
                          </small>
                        </button>
                      );
                    })
                  )}
                </div>

                {templateSel && (
                  <div className="admin-wa-template-preview">
                    <h3>Prévia do texto</h3>
                    {templateSel.bodyTexto ? (
                      <pre>{templateSel.bodyTexto}</pre>
                    ) : (
                      <p>Sem texto de corpo no template.</p>
                    )}
                    {templateSel.botoes?.length > 0 && (
                      <ul>
                        {templateSel.botoes.map((b, i) => (
                          <li key={i}>
                            [{b.tipo}] {b.texto}
                            {b.dinamico ? " (URL dinâmica)" : ""}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            </section>

            <section className="admin-card">
              <header className="admin-card__head">
                <div>
                  <h2>2. Mídia do header</h2>
                  <p className="admin-card__sub admin-card__sub--tight">
                    Arraste o vídeo ou imagem, ou clique para escolher
                    {templateSel?.exigeMidia
                      ? ` (template pede ${templateSel.headerTipo})`
                      : ""}
                  </p>
                </div>
              </header>

              <div
                className={`admin-wa-drop${dragOver ? " is-over" : ""}${
                  !editavel ? " is-disabled" : ""
                }`}
                onDragEnter={(e) => {
                  e.preventDefault();
                  if (editavel) setDragOver(true);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (editavel) setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  if (!editavel) return;
                  const f = e.dataTransfer.files?.[0];
                  processarArquivoMidia(f);
                }}
                onClick={() => editavel && fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/mp4,video/*,image/jpeg,image/png,image/webp,.mp4,.mov,.webm,.jpg,.jpeg,.png"
                  hidden
                  disabled={!editavel || uploading}
                  onChange={(e) => processarArquivoMidia(e.target.files?.[0])}
                />
                {uploading ? (
                  <p>Enviando arquivo…</p>
                ) : form.midiaUrl ? (
                  <div className="admin-wa-drop__preview">
                    {form.midiaTipo === "image" ? (
                      <img src={midiaPreviewUrl} alt="Mídia da campanha" />
                    ) : (
                      <video src={midiaPreviewUrl} controls muted />
                    )}
                    <p>
                      <code>{form.midiaUrl}</code>
                    </p>
                    <span>Solte outro arquivo para substituir</span>
                  </div>
                ) : (
                  <>
                    <strong>Arraste e solte aqui</strong>
                    <span>Vídeo convertido automaticamente (H.264) · máx. 16 MB no WhatsApp</span>
                  </>
                )}
              </div>

              <Field
                label="Ou URL HTTPS pública"
                hint="Opcional se já fez upload acima"
              >
                <input
                  value={form.midiaUrl}
                  disabled={!editavel}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      midiaUrl: e.target.value,
                    }))
                  }
                  placeholder="https://…"
                />
              </Field>
            </section>

            <section className="admin-card">
              <header className="admin-card__head">
                <div>
                  <h2>3. Parâmetros do template</h2>
                  <p className="admin-card__sub admin-card__sub--tight">
                    Quantidade de linhas = quantidade de {"{{1}}"}, {"{{2}}"}…
                    no template. Use <code>{"{{nome}}"}</code> para o primeiro
                    nome. Se o template não tiver variável, deixe vazio.
                  </p>
                </div>
              </header>
              <div className="admin-form">
                <div className="admin-wa-params-head">
                  <strong>Variáveis do corpo</strong>
                  {editavel && (
                    <button
                      type="button"
                      className="admin-btn admin-btn--ghost admin-btn--sm"
                      onClick={() => setBodyParams((p) => [...p, ""])}
                    >
                      + Adicionar {"{{"}
                      {bodyParams.length + 1}
                      {"}}"}
                    </button>
                  )}
                </div>
                {bodyParams.length === 0 ? (
                  <p className="admin-usuarios-loading">
                    Nenhuma variável de corpo. Clique em “Adicionar” se o
                    template tiver {"{{1}}"}.
                  </p>
                ) : (
                  bodyParams.map((val, idx) => (
                    <div key={`body-${idx}`} className="admin-wa-param-row">
                      <Field label={`Corpo {{${idx + 1}}}`}>
                        <input
                          value={val}
                          disabled={!editavel}
                          onChange={(e) => {
                            const next = [...bodyParams];
                            next[idx] = e.target.value;
                            setBodyParams(next);
                          }}
                          placeholder={`Valor de {{${idx + 1}}} ou {{nome}}`}
                        />
                      </Field>
                      {editavel && (
                        <button
                          type="button"
                          className="admin-btn admin-btn--ghost admin-btn--sm"
                          onClick={() =>
                            setBodyParams((p) => p.filter((_, i) => i !== idx))
                          }
                        >
                          Remover
                        </button>
                      )}
                    </div>
                  ))
                )}

                <div className="admin-wa-params-head">
                  <strong>Sufixo do botão URL</strong>
                  {editavel && (
                    <button
                      type="button"
                      className="admin-btn admin-btn--ghost admin-btn--sm"
                      onClick={() => setButtonParams((p) => [...p, ""])}
                    >
                      + Adicionar sufixo
                    </button>
                  )}
                </div>
                {buttonParams.length === 0 ? (
                  <p className="admin-usuarios-loading">
                    Só use se o botão do template tiver parte variável na URL.
                  </p>
                ) : (
                  buttonParams.map((val, idx) => (
                    <div key={`btn-${idx}`} className="admin-wa-param-row">
                      <Field label={`Botão URL — sufixo {{${idx + 1}}}`}>
                        <input
                          value={val}
                          disabled={!editavel}
                          onChange={(e) => {
                            const next = [...buttonParams];
                            next[idx] = e.target.value;
                            setButtonParams(next);
                          }}
                          placeholder="parte variável da URL"
                        />
                      </Field>
                      {editavel && (
                        <button
                          type="button"
                          className="admin-btn admin-btn--ghost admin-btn--sm"
                          onClick={() =>
                            setButtonParams((p) =>
                              p.filter((_, i) => i !== idx)
                            )
                          }
                        >
                          Remover
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="admin-card">
              <header className="admin-card__head">
                <div>
                  <h2>4. Público</h2>
                  <p className="admin-card__sub admin-card__sub--tight">
                    Quem recebe esta campanha
                  </p>
                </div>
              </header>

              <div className="admin-marketing-modo">
                <button
                  type="button"
                  disabled={!editavel}
                  className={`admin-marketing-modo__opcao${
                    form.publico === "telefones_especificos"
                      ? " admin-marketing-modo__opcao--ativa"
                      : ""
                  }`}
                  onClick={() =>
                    setForm((p) => ({
                      ...p,
                      publico: "telefones_especificos",
                    }))
                  }
                >
                  <strong>Escolher clientes</strong>
                  <span>
                    Busque membros do clube com celular
                    {telefonesSelecionados.size
                      ? ` · ${telefonesSelecionados.size} marcado(s)`
                      : ""}
                  </span>
                </button>
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
                  <strong>Todos com celular</strong>
                  <span>Base completa do cadastro (sem opt-out)</span>
                </button>
                <button
                  type="button"
                  disabled={!editavel}
                  className={`admin-marketing-modo__opcao${
                    form.publico === "carteira_whatsapp"
                      ? " admin-marketing-modo__opcao--ativa"
                      : ""
                  }`}
                  onClick={() =>
                    setForm((p) => ({ ...p, publico: "carteira_whatsapp" }))
                  }
                >
                  <strong>Carteira WhatsApp</strong>
                  <span>Quem já falou no número de ofertas</span>
                </button>
                <button
                  type="button"
                  disabled={!editavel}
                  className={`admin-marketing-modo__opcao${
                    form.publico === "carteira_com_clube"
                      ? " admin-marketing-modo__opcao--ativa"
                      : ""
                  }`}
                  onClick={() =>
                    setForm((p) => ({ ...p, publico: "carteira_com_clube" }))
                  }
                >
                  <strong>Carteira · com Clube</strong>
                  <span>Falou no WA e tem cadastro no Clube</span>
                </button>
                <button
                  type="button"
                  disabled={!editavel}
                  className={`admin-marketing-modo__opcao${
                    form.publico === "carteira_sem_clube"
                      ? " admin-marketing-modo__opcao--ativa"
                      : ""
                  }`}
                  onClick={() =>
                    setForm((p) => ({ ...p, publico: "carteira_sem_clube" }))
                  }
                >
                  <strong>Carteira · sem Clube</strong>
                  <span>Só visitante do WhatsApp (sem cadastro)</span>
                </button>
              </div>

              {form.publico === "telefones_especificos" && (
                <div className="admin-marketing-picker">
                  <div className="admin-marketing-picker__toolbar">
                    <Field label="Buscar cliente do clube">
                      <input
                        value={buscaCliente}
                        disabled={!editavel}
                        onChange={(e) => setBuscaCliente(e.target.value)}
                        placeholder="Nome, celular ou CPF"
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
                        Mostrar sem celular / opt-out
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
                            onClick={() => setTelefonesSelecionados(new Set())}
                          >
                            Limpar
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <p className="admin-marketing-dest-resumo">
                    Marcados: <strong>{telefonesSelecionados.size}</strong>
                    {clientesResumo
                      ? ` · Elegíveis no clube: ${clientesResumo.elegiveis}`
                      : ""}
                  </p>

                  <div className="admin-marketing-picker__lista" role="list">
                    {loadingClientes ? (
                      <p className="admin-usuarios-loading">
                        Carregando clientes…
                      </p>
                    ) : clientes.length === 0 ? (
                      <p className="admin-usuarios-loading">
                        Nenhum cliente encontrado.
                      </p>
                    ) : (
                      clientes.map((c) => {
                        const marcado =
                          Boolean(c.telefone) &&
                          telefonesSelecionados.has(c.telefone);
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
                              onChange={() =>
                                toggleTelefone(c.telefone, c.elegivel)
                              }
                            />
                            <span className="admin-marketing-cliente__corpo">
                              <strong>{c.nome}</strong>
                              <span>
                                {formatarTelefoneExibicao(c.telefone)}
                              </span>
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
                  {destResumo ? (
                    <>
                      Vão receber: <strong>{destResumo.elegiveis}</strong>
                      {destResumo.semTelefone
                        ? ` · Sem celular: ${destResumo.semTelefone}`
                        : ""}
                      {destResumo.optOut
                        ? ` · Opt-out: ${destResumo.optOut}`
                        : ""}
                    </>
                  ) : (
                    "Salve o rascunho para calcular quantos vão receber."
                  )}
                </p>
              )}

              {(form.publico === "carteira_whatsapp" ||
                form.publico === "carteira_com_clube" ||
                form.publico === "carteira_sem_clube") && (
                <p className="admin-marketing-dest-resumo">
                  {destResumo ? (
                    <>
                      Carteira — vão receber:{" "}
                      <strong>{destResumo.elegiveis}</strong>
                      {destResumo.optOut
                        ? ` · Opt-out: ${destResumo.optOut}`
                        : ""}
                    </>
                  ) : (
                    "Salve o rascunho para calcular a carteira."
                  )}
                </p>
              )}
            </section>
          </div>
        )}
      </div>

      {modalTeste && (
        <div className="admin-mkt-modal" role="dialog" aria-modal="true">
          <button
            type="button"
            className="admin-mkt-modal__backdrop"
            aria-label="Fechar"
            onClick={() => setModalTeste(false)}
          />
          <div className="admin-mkt-modal__panel">
            <header className="admin-mkt-modal__head">
              <h3>Enviar teste</h3>
              <button
                type="button"
                className="admin-btn admin-btn--ghost admin-btn--sm"
                onClick={() => setModalTeste(false)}
              >
                Fechar
              </button>
            </header>
            <div className="admin-mkt-modal__body">
              <p className="admin-mkt-modal__nota">
                Envia só para este número (lista de teste da Meta, se estiver em
                desenvolvimento).
              </p>
              <label className="admin-mkt-modal__field">
                Celular com DDD
                <input
                  value={telefoneTeste}
                  onChange={(e) => setTelefoneTeste(e.target.value)}
                  placeholder="45998331383"
                />
              </label>
              <button
                type="button"
                className="admin-btn admin-btn--primary"
                disabled={saving || !telefoneTeste.trim()}
                onClick={enviarTeste}
              >
                {saving ? "Enviando…" : "Enviar agora"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
